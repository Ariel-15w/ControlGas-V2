/* =========================================================
   CONTROLGAS
   CUENTAS PENDIENTES

   Responsabilidades:
   - Consultar pendientes
   - Registrar abonos de dinero
   - Registrar devoluciones de tanques
   - Registrar retiros de gas ya pagado
   - Permitir operaciones parciales
   - Completar las bolsas cuando se cobra un fiado
   - Cerrar automáticamente una cuenta al quedar en cero
   - Actualizar el estado de la venta original
   - Registrar todos los movimientos en historial

   IMPORTANTE:

   Un pago posterior:
   - SÍ aumenta lo cobrado
   - SÍ puede aumentar caja o transferencias
   - SÍ completa dinero faltante de las bolsas
   - NO crea una nueva venta

   Un retiro de gas reservado:
   - NO crea ingreso
   - NO crea una segunda venta
   - solo disminuye "reserved"
========================================================= */

import {
  ACCOUNT_STATUS,
  ACCOUNT_TYPES,
  GAS_IDS,
  GAS_ID_LIST,
  MOVEMENT_TYPES,
  PAYMENT_METHODS,
  SALE_STATUS,
} from './config.js';


import {
  getState,
  getActiveDay,
  getAccountById,
  getAccountBalance,
  getSaleById,
  getSaleLines,
  createMovementBase,
  replaceState,
  touchState,
} from './state.js';


import {
  receiveEmptyCylinders,
  pickupReservedCylinders,
} from './inventory.js';


import {
  fundSaleReplacementReserve,
} from './finance.js';


import {
  saveState,
} from './storage.js';


import {
  cloneData,
  normalizeText,
  nowIso,
  roundMoney,
  sortNewestFirst,
  toNonNegativeInteger,
  toNonNegativeNumber,
  uid,
} from './utils.js';



/* =========================================================
   MAPA VACÍO DE MARCAS
========================================================= */

function emptyGasMap() {

  return {

    [GAS_IDS.DURAGAS]: 0,

    [GAS_IDS.KING_GAS]: 0,

  };

}



/* =========================================================
   NORMALIZAR CANTIDADES POR MARCA
========================================================= */

function normalizeGasAmounts(
  value = {}
) {

  return {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        value?.[
          GAS_IDS.DURAGAS
        ]
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        value?.[
          GAS_IDS.KING_GAS
        ]
      ),

  };

}



/* =========================================================
   TOTAL DE TANQUES
========================================================= */

function totalGasAmounts(
  value = {}
) {

  const quantities =
    normalizeGasAmounts(
      value
    );


  return (

    quantities[
      GAS_IDS.DURAGAS
    ]

    +

    quantities[
      GAS_IDS.KING_GAS
    ]

  );

}



/* =========================================================
   VALIDAR JORNADA ACTIVA
========================================================= */

function requireActiveDay() {

  const day =
    getActiveDay();


  if (!day) {

    throw new Error(
      'Debes abrir el día antes de registrar este movimiento.'
    );

  }


  return day;

}



/* =========================================================
   OBTENER CUENTA Y BALANCE
========================================================= */

function requireAccount(
  accountId
) {

  const account =
    getAccountById(
      accountId
    );


  if (!account) {

    throw new Error(
      'No se encontró la cuenta pendiente.'
    );

  }


  const balance =
    getAccountBalance(
      accountId
    );


  if (!balance) {

    throw new Error(
      'No se encontró el saldo de la cuenta pendiente.'
    );

  }


  /*
    Protección para cuentas migradas.
  */

  balance.moneyDue =
    roundMoney(
      toNonNegativeNumber(
        balance.moneyDue
      )
    );


  balance.tanksDue =
    normalizeGasAmounts(
      balance.tanksDue
    );


  balance.pickupDue =
    normalizeGasAmounts(
      balance.pickupDue
    );


  return {

    account,

    balance,

  };

}



/* =========================================================
   COMPROBAR QUE LA CUENTA ESTÉ ABIERTA
========================================================= */

function requireOpenAccount(
  account
) {

  if (
    account.status ===
    ACCOUNT_STATUS.CLOSED
  ) {

    throw new Error(
      'Este pendiente ya está cerrado.'
    );

  }

}



/* =========================================================
   TIPO ACTUAL DE PENDIENTE
========================================================= */

function determineCurrentAccountType(
  balance
) {

  const owesMoney =
    roundMoney(
      balance.moneyDue
    ) > 0;


  const owesTanks =
    totalGasAmounts(
      balance.tanksDue
    ) > 0;


  const owesPickup =
    totalGasAmounts(
      balance.pickupDue
    ) > 0;


  if (
    owesPickup &&
    (owesMoney || owesTanks)
  ) {

    return 'inconsistent';

  }


  if (owesPickup) {

    return ACCOUNT_TYPES.PICKUP;

  }


  if (
    owesMoney &&
    owesTanks
  ) {

    return ACCOUNT_TYPES.MIXED;

  }


  if (owesMoney) {

    return ACCOUNT_TYPES.MONEY;

  }


  if (owesTanks) {

    return ACCOUNT_TYPES.TANKS;

  }


  return null;

}


function isAccountBalanceInconsistent(
  balance
) {

  return (
    totalGasAmounts(
      balance.pickupDue
    ) > 0 &&
    (
      roundMoney(
        balance.moneyDue
      ) > 0 ||
      totalGasAmounts(
        balance.tanksDue
      ) > 0
    )
  );

}


function requireConsistentAccount(
  balance
) {

  if (
    isAccountBalanceInconsistent(
      balance
    )
  ) {

    throw new Error(
      'La cuenta es inconsistente: no puede tener dinero o tanques pendientes mientras tiene gas pagado por retirar.'
    );

  }

}



/* =========================================================
   ESTADO ACTUAL DE LA VENTA
========================================================= */

function determineSaleStatusFromBalance(
  balance
) {

  const type =
    determineCurrentAccountType(
      balance
    );


  switch (type) {

    case ACCOUNT_TYPES.MONEY:

      return SALE_STATUS
        .PENDING_MONEY;


    case ACCOUNT_TYPES.TANKS:

      return SALE_STATUS
        .PENDING_TANKS;


    case ACCOUNT_TYPES.MIXED:

      return SALE_STATUS
        .PENDING_MIXED;


    case ACCOUNT_TYPES.PICKUP:

      return SALE_STATUS
        .PENDING_PICKUP;


    default:

      return SALE_STATUS
        .COMPLETED;

  }

}



/* =========================================================
   ¿EL PENDIENTE ESTÁ EN CERO?
========================================================= */

export function isAccountSettled(
  balance
) {

  if (!balance) {

    return true;

  }


  return (

    roundMoney(
      balance.moneyDue
    ) <= 0

    &&

    totalGasAmounts(
      balance.tanksDue
    ) === 0

    &&

    totalGasAmounts(
      balance.pickupDue
    ) === 0

  );

}



/* =========================================================
   SINCRONIZAR CUENTA + VENTA
========================================================= */

function syncAccountStatus(
  account,
  balance,
  createdAt =
    nowIso()
) {

  const sale =
    getSaleById(
      account.saleId
    );


  const settled =
    isAccountSettled(
      balance
    );


  if (settled) {

    account.status =
      ACCOUNT_STATUS.CLOSED;


    account.type =
      null;


    account.closedAt =
      account.closedAt ??
      createdAt;


    if (sale) {

      sale.status =
        SALE_STATUS.COMPLETED;

    }

  }
  else {

    account.status =
      ACCOUNT_STATUS.OPEN;


    account.type =
      determineCurrentAccountType(
        balance
      );


    account.closedAt =
      null;


    if (sale) {

      sale.status =
        determineSaleStatusFromBalance(
          balance
        );

    }

  }


  touchState();


  return settled;

}



/* =========================================================
   CREAR MOVIMIENTO GENERAL
========================================================= */

function pushAccountMovement({

  dayId,

  account,

  type,

  detail,

  value = 0,

  metadata = {},

  createdAt =
    nowIso(),

}) {

  const movement =
    createMovementBase({

      id:
        uid('mov'),

      dayId,

      type,

      createdAt,

      referenceId:
        account.id,

      reference:
        account.customer ||
        'Cliente',

      detail,

      value,

      metadata: {

        accountId:
          account.id,

        saleId:
          account.saleId,

        ...metadata,

      },

    });


  getState()
    .movements
    .push(
      movement
    );


  touchState();


  return movement;

}



/* =========================================================
   CUÁNTO SE HA FINANCIADO DE LA VENTA
========================================================= */

function getSaleReserveFunded(
  sale
) {

  return {

    [GAS_IDS.DURAGAS]:
      roundMoney(
        toNonNegativeNumber(
          sale?.reserveFunded?.[
            GAS_IDS.DURAGAS
          ]
        )
      ),

    [GAS_IDS.KING_GAS]:
      roundMoney(
        toNonNegativeNumber(
          sale?.reserveFunded?.[
            GAS_IDS.KING_GAS
          ]
        )
      ),

  };

}



/* =========================================================
   ACTUALIZAR RESERVA FINANCIADA EN LÍNEAS
========================================================= */

function applyFundingToSaleLines({

  saleId,

  allocation,

}) {

  const lines =
    getSaleLines(
      saleId
    );


  GAS_ID_LIST.forEach(
    gasId => {

      let remaining =
        roundMoney(
          allocation?.[gasId] ??
          0
        );


      if (
        remaining <= 0
      ) {

        return;

      }


      const gasLines =
        lines.filter(
          line =>
            line.gasId ===
            gasId
        );


      for (
        const line
        of gasLines
      ) {

        if (
          remaining <= 0
        ) {

          break;

        }


        const required =
          roundMoney(
            toNonNegativeNumber(
              line.reserveRequired
            )
          );


        const funded =
          roundMoney(
            toNonNegativeNumber(
              line.reserveFunded
            )
          );


        const pending =
          roundMoney(
            Math.max(
              0,
              required -
              funded
            )
          );


        if (
          pending <= 0
        ) {

          continue;

        }


        const amount =
          roundMoney(
            Math.min(
              pending,
              remaining
            )
          );


        line.reserveFunded =
          roundMoney(
            funded +
            amount
          );


        remaining =
          roundMoney(
            remaining -
            amount
          );

      }

    }
  );


  touchState();

}



/* =========================================================
   APLICAR FINANCIAMIENTO POSTERIOR A LA VENTA
========================================================= */

/*
  Cuando un cliente fiado paga:

  1. El dinero entra.
  2. Primero completa el dinero que faltaba
     separar para reposición.
  3. Lo restante pasa a ser ganancia
     efectivamente cobrada.

  Esto NO crea una segunda venta.
*/

function fundReserveFromAccountPayment({

  sale,

  amount,

  paymentMethod,

  dayId,

  createdAt,

}) {

  if (!sale) {

    return null;

  }


  const alreadyFunded =
    getSaleReserveFunded(
      sale
    );


  const funding =
    fundSaleReplacementReserve({

      saleId:
        sale.id,

      dayId,

      quantities:
        sale.quantities,

      price:
        sale.unitPrice ??
        sale.price,

      amountCollected:
        amount,

      paymentMethod,

      alreadyFunded,

      createdAt,

    });



  GAS_ID_LIST.forEach(
    gasId => {

      sale.reserveFunded[gasId] =
        roundMoney(

          alreadyFunded[gasId]

          +

          (
            funding
              .allocation?.[gasId] ??
            0
          )

        );

    }
  );


  sale.realizedProfitFromCollection =
    roundMoney(

      toNonNegativeNumber(
        sale
          .realizedProfitFromCollection
      )

      +

      funding
        .availableProfitFromCollection

    );


  applyFundingToSaleLines({

    saleId:
      sale.id,

    allocation:
      funding.allocation,

  });


  touchState();


  return funding;

}



/* =========================================================
   REGISTRAR ABONO DE DINERO
========================================================= */

export function registerAccountPayment({

  accountId,

  amount,

  paymentMethod =
    PAYMENT_METHODS.CASH,

  note = '',

  createdAt =
    nowIso(),

}) {

  const stateBefore =
    cloneData(
      getState()
    );


  try {

    const day =
      requireActiveDay();


    const {
      account,
      balance,
    } =
      requireAccount(
        accountId
      );


    requireOpenAccount(
      account
    );


    requireConsistentAccount(
      balance
    );


    if (
      paymentMethod !==
      PAYMENT_METHODS.CASH
    ) {

      throw new Error(
        'El negocio únicamente maneja pagos en efectivo.'
      );

    }


    const payment =
      roundMoney(
        toNonNegativeNumber(
          amount
        )
      );


    if (
      payment <= 0
    ) {

      throw new Error(
        'El abono debe ser mayor que cero.'
      );

    }


    const moneyDueBefore =
      roundMoney(
        balance.moneyDue
      );


    if (
      moneyDueBefore <= 0
    ) {

      throw new Error(
        'Esta cuenta no tiene dinero pendiente.'
      );

    }


    if (
      payment >
      moneyDueBefore + 0.005
    ) {

      throw new Error(
        `El cliente debe $${moneyDueBefore.toFixed(2)}. No puedes registrar un abono mayor a la deuda.`
      );

    }



    const sale =
      getSaleById(
        account.saleId
      );


    /*
      Reducimos el saldo pendiente.
    */

    balance.moneyDue =
      roundMoney(
        Math.max(
          0,
          moneyDueBefore -
          payment
        )
      );



    /*
      Completar las bolsas correspondientes
      a la venta original.
    */

    const funding =
      fundReserveFromAccountPayment({

        sale,

        amount:
          payment,

        paymentMethod,

        dayId:
          day.id,

        createdAt,

      });



    /*
      Registrar movimiento.

      El valor es POSITIVO porque es dinero
      efectivamente cobrado durante esta jornada.
    */

    const movement =
      pushAccountMovement({

        dayId:
          day.id,

        account,

        type:
          MOVEMENT_TYPES.PAYMENT,

        detail:
          normalizeText(
            note
          ) ||
          `Abono de cuenta pendiente por $${payment.toFixed(2)}`,

        value:
          payment,

        metadata: {

          amount:
            payment,

          paymentMethod,

          moneyDueBefore,

          moneyDueAfter:
            balance.moneyDue,

          reserveAllocation:
            cloneData(
              funding?.allocation ??
              emptyGasMap()
            ),

          realizedProfit:
            roundMoney(
              funding
                ?.availableProfitFromCollection ??
              payment
            ),

        },

        createdAt,

      });



    const closed =
      syncAccountStatus(
        account,
        balance,
        createdAt
      );


    touchState();

    saveState();



    return {

      account:
        cloneData(
          account
        ),

      balance:
        cloneData(
          balance
        ),

      payment: {

        amount:
          payment,

        paymentMethod,

        moneyDueBefore,

        moneyDueAfter:
          balance.moneyDue,

      },

      funding:
        funding
          ? cloneData(
              funding
            )
          : null,

      movement:
        cloneData(
          movement
        ),

      closed,

    };

  }
  catch (error) {

    replaceState(
      stateBefore
    );


    try {

      saveState();

    }
    catch {

      /* Conservamos la restauración en memoria. */

    }


    throw error;

  }

}



/* =========================================================
   VALIDAR DEVOLUCIÓN DE TANQUES
========================================================= */

function validateTankReturn(
  balance,
  returned
) {

  const errors = [];

  const totalReturned =
    totalGasAmounts(
      returned
    );

  const totalOwed =
    totalGasAmounts(
      balance.tanksDue
    );


  if (
    totalReturned >
    totalOwed
  ) {

    errors.push(
      `No puedes devolver ${totalReturned} tanque(s) porque la cuenta solo debe ${totalOwed}.`
    );

  }

  return errors;

}



/* =========================================================
   DEVOLUCIÓN DE TANQUES PENDIENTES
========================================================= */

export function registerTankReturn({

  accountId,

  duragas = 0,

  kinggas = 0,

  note = '',

  createdAt =
    nowIso(),

}) {

  const stateBefore =
    cloneData(
      getState()
    );


  try {

    const day =
      requireActiveDay();


    const {
      account,
      balance,
    } =
      requireAccount(
        accountId
      );


    requireOpenAccount(
      account
    );


    requireConsistentAccount(
      balance
    );


    const returned = {

      [GAS_IDS.DURAGAS]:
        toNonNegativeInteger(
          duragas
        ),

      [GAS_IDS.KING_GAS]:
        toNonNegativeInteger(
          kinggas
        ),

    };


    const totalReturned =
      totalGasAmounts(
        returned
      );


    if (
      totalReturned <= 0
    ) {

      throw new Error(
        'Debes indicar al menos un tanque devuelto.'
      );

    }



    if (
      totalGasAmounts(
        balance.tanksDue
      ) <= 0
    ) {

      throw new Error(
        'Esta cuenta no tiene tanques pendientes.'
      );

    }



    const errors =
      validateTankReturn(
        balance,
        returned
      );


    if (
      errors.length > 0
    ) {

      throw new Error(
        errors.join(' ')
      );

    }



    const tanksDueBefore =
      cloneData(
        balance.tanksDue
      );



    /*
      Los tanques regresan físicamente
      como vacíos a la bodega.
    */

    receiveEmptyCylinders(
      returned
    );



    const remainingByGas = {

      [GAS_IDS.DURAGAS]:
        returned[GAS_IDS.DURAGAS],

      [GAS_IDS.KING_GAS]:
        returned[GAS_IDS.KING_GAS],

    };


    GAS_ID_LIST.forEach(
      gasId => {

        const matched =
          Math.min(
            remainingByGas[gasId],
            balance.tanksDue[gasId]
          );

        balance.tanksDue[gasId] =
          Math.max(
            0,
            balance.tanksDue[gasId] -
            matched
          );

        remainingByGas[gasId] =
          Math.max(
            0,
            remainingByGas[gasId] -
            matched
          );

      }
    );


    GAS_ID_LIST.forEach(
      gasId => {

        const otherGasId =
          gasId === GAS_IDS.DURAGAS
            ? GAS_IDS.KING_GAS
            : GAS_IDS.DURAGAS;

        const compensation =
          Math.min(
            remainingByGas[gasId],
            balance.tanksDue[otherGasId]
          );

        balance.tanksDue[otherGasId] =
          Math.max(
            0,
            balance.tanksDue[otherGasId] -
            compensation
          );

        remainingByGas[gasId] =
          Math.max(
            0,
            remainingByGas[gasId] -
            compensation
          );

      }
    );



    const detailParts = [];


    if (
      returned[
        GAS_IDS.DURAGAS
      ] > 0
    ) {

      detailParts.push(
        `${
          returned[
            GAS_IDS.DURAGAS
          ]
        } Duragas`
      );

    }


    if (
      returned[
        GAS_IDS.KING_GAS
      ] > 0
    ) {

      detailParts.push(
        `${
          returned[
            GAS_IDS.KING_GAS
          ]
        } King Gas`
      );

    }



    const movement =
      pushAccountMovement({

        dayId:
          day.id,

        account,

        type:
          MOVEMENT_TYPES
            .TANK_RETURN,

        detail:
          normalizeText(
            note
          ) ||
          `Devolución pendiente: ${detailParts.join(' + ')}`,

        value: 0,

        metadata: {

          returned:
            cloneData(
              returned
            ),

          tanksDueBefore,

          tanksDueAfter:
            cloneData(
              balance.tanksDue
            ),

        },

        createdAt,

      });



    const closed =
      syncAccountStatus(
        account,
        balance,
        createdAt
      );


    touchState();

    saveState();



    return {

      account:
        cloneData(
          account
        ),

      balance:
        cloneData(
          balance
        ),

      returned:
        cloneData(
          returned
        ),

      movement:
        cloneData(
          movement
        ),

      closed,

    };

  }
  catch (error) {

    replaceState(
      stateBefore
    );


    try {

      saveState();

    }
    catch {

      /* Estado restaurado al menos en memoria. */

    }


    throw error;

  }

}



/* =========================================================
   VALIDAR RETIRO DE RESERVA
========================================================= */

function validatePickup(
  balance,
  pickup
) {

  const errors = [];


  GAS_ID_LIST.forEach(
    gasId => {

      const quantity =
        pickup[gasId];


      const pending =
        balance
          .pickupDue[gasId];


      if (
        quantity >
        pending
      ) {

        const name =
          gasId ===
            GAS_IDS.DURAGAS

            ? 'Duragas'

            : 'King Gas';


        errors.push(
          `Solo tiene ${pending} ${name} pendiente(s) de retirar.`
        );

      }

    }
  );


  return errors;

}



/* =========================================================
   RETIRAR GAS YA PAGADO
========================================================= */

export function registerReservedPickup({

  accountId,

  duragas = 0,

  kinggas = 0,

  note = '',

  createdAt =
    nowIso(),

}) {

  const stateBefore =
    cloneData(
      getState()
    );


  try {

    const day =
      requireActiveDay();


    const {
      account,
      balance,
    } =
      requireAccount(
        accountId
      );


    requireOpenAccount(
      account
    );


    requireConsistentAccount(
      balance
    );


    const pickup = {

      [GAS_IDS.DURAGAS]:
        toNonNegativeInteger(
          duragas
        ),

      [GAS_IDS.KING_GAS]:
        toNonNegativeInteger(
          kinggas
        ),

    };


    const totalPickup =
      totalGasAmounts(
        pickup
      );


    if (
      totalPickup <= 0
    ) {

      throw new Error(
        'Debes indicar al menos un cilindro para retirar.'
      );

    }



    if (
      totalGasAmounts(
        balance.pickupDue
      ) <= 0
    ) {

      throw new Error(
        'Esta cuenta no tiene gas pendiente de retirar.'
      );

    }



    const errors =
      validatePickup(
        balance,
        pickup
      );


    if (
      errors.length > 0
    ) {

      throw new Error(
        errors.join(' ')
      );

    }



    const pickupDueBefore =
      cloneData(
        balance.pickupDue
      );



    /*
      IMPORTANTE:

      El lleno YA salió de disponibles
      al registrar la venta.

      Ahora solamente sale de reservados.
    */

    pickupReservedCylinders(
      pickup
    );



    GAS_ID_LIST.forEach(
      gasId => {

        balance.pickupDue[gasId] =
          Math.max(
            0,

            balance
              .pickupDue[gasId]

            -

            pickup[gasId]
          );

      }
    );



    const parts = [];


    if (
      pickup[
        GAS_IDS.DURAGAS
      ] > 0
    ) {

      parts.push(
        `${
          pickup[
            GAS_IDS.DURAGAS
          ]
        } Duragas`
      );

    }


    if (
      pickup[
        GAS_IDS.KING_GAS
      ] > 0
    ) {

      parts.push(
        `${
          pickup[
            GAS_IDS.KING_GAS
          ]
        } King Gas`
      );

    }



    const movement =
      pushAccountMovement({

        dayId:
          day.id,

        account,

        type:
          MOVEMENT_TYPES.PICKUP,

        detail:
          normalizeText(
            note
          ) ||
          `Retiro de gas ya pagado: ${parts.join(' + ')}`,

        /*
          Cero porque NO existe un nuevo ingreso.
        */

        value: 0,

        metadata: {

          pickup:
            cloneData(
              pickup
            ),

          pickupDueBefore,

          pickupDueAfter:
            cloneData(
              balance.pickupDue
            ),

          noNewSale:
            true,

          noNewRevenue:
            true,

        },

        createdAt,

      });



    const closed =
      syncAccountStatus(
        account,
        balance,
        createdAt
      );


    touchState();

    saveState();



    return {

      account:
        cloneData(
          account
        ),

      balance:
        cloneData(
          balance
        ),

      pickup:
        cloneData(
          pickup
        ),

      movement:
        cloneData(
          movement
        ),

      closed,

    };

  }
  catch (error) {

    replaceState(
      stateBefore
    );


    try {

      saveState();

    }
    catch {

      /* Estado restaurado. */

    }


    throw error;

  }

}



/* =========================================================
   OBTENER TODAS LAS CUENTAS ABIERTAS
========================================================= */

export function getOpenAccounts() {

  const state =
    getState();


  return sortNewestFirst(

    state.accounts

      .filter(
        account =>
          account.status ===
          ACCOUNT_STATUS.OPEN
      )

      .map(
        account => {

          const balance =
            state
              .accountBalances
              .find(
                item =>
                  item.accountId ===
                  account.id
              );


          return {

            ...cloneData(
              account
            ),

            balance:
              balance
                ? cloneData(
                    balance
                  )
                : {

                    moneyDue: 0,

                    tanksDue:
                      emptyGasMap(),

                    pickupDue:
                      emptyGasMap(),

                  },

          };

        }
      ),

    item =>
      item.createdAt

  );

}



/* =========================================================
   DETALLE DE UNA CUENTA
========================================================= */

export function getAccountDetail(
  accountId
) {

  const account =
    getAccountById(
      accountId
    );


  if (!account) {

    return null;

  }


  const balance =
    getAccountBalance(
      accountId
    );


  const sale =
    getSaleById(
      account.saleId
    );


  const movements =
    getState()
      .movements
      .filter(
        movement =>
          movement.metadata
            ?.accountId ===
            accountId
      );


  return {

    account:
      cloneData(
        account
      ),

    balance:
      balance
        ? cloneData(
            balance
          )
        : null,

    sale:
      sale
        ? cloneData(
            sale
          )
        : null,

    movements:
      cloneData(
        movements
      ),

  };

}



/* =========================================================
   RESUMEN DE PENDIENTES
========================================================= */

export function getAccountsSummary() {

  const open =
    getOpenAccounts();


  let moneyDue = 0;

  let duragasDue = 0;

  let kinggasDue = 0;

  let duragasPickup = 0;

  let kinggasPickup = 0;


  open.forEach(
    item => {

      const balance =
        item.balance;


      moneyDue =
        roundMoney(

          moneyDue

          +

          toNonNegativeNumber(
            balance.moneyDue
          )

        );


      duragasDue +=
        toNonNegativeInteger(
          balance
            .tanksDue?.[
              GAS_IDS.DURAGAS
            ]
        );


      kinggasDue +=
        toNonNegativeInteger(
          balance
            .tanksDue?.[
              GAS_IDS.KING_GAS
            ]
        );


      duragasPickup +=
        toNonNegativeInteger(
          balance
            .pickupDue?.[
              GAS_IDS.DURAGAS
            ]
        );


      kinggasPickup +=
        toNonNegativeInteger(
          balance
            .pickupDue?.[
              GAS_IDS.KING_GAS
            ]
        );

    }
  );


  return {

    openAccounts:
      open.length,

    moneyDue:

      roundMoney(
        moneyDue
      ),

    tanksDue: {

      [GAS_IDS.DURAGAS]:
        duragasDue,

      [GAS_IDS.KING_GAS]:
        kinggasDue,

      total:
        duragasDue +
        kinggasDue,

    },

    pickupDue: {

      [GAS_IDS.DURAGAS]:
        duragasPickup,

      [GAS_IDS.KING_GAS]:
        kinggasPickup,

      total:
        duragasPickup +
        kinggasPickup,

    },

  };

}



/* =========================================================
   CUENTAS DE UN CLIENTE
========================================================= */

export function getAccountsByCustomer(
  customer
) {

  const query =
    normalizeText(
      customer
    ).toLowerCase();


  if (!query) {

    return [];

  }


  return getState()
    .accounts
    .filter(
      account => {

        return normalizeText(
          account.customer
        )
          .toLowerCase()
          .includes(
            query
          );

      }
    );

}



/* =========================================================
   ¿QUÉ ACCIONES PERMITE UNA CUENTA?
========================================================= */

export function getAvailableAccountActions(
  accountId
) {

  const {
    account,
    balance,
  } =
    requireAccount(
      accountId
    );


  if (
    account.status ===
    ACCOUNT_STATUS.CLOSED
  ) {

    return {

      payment: false,

      tankReturn: false,

      pickup: false,

      inconsistent: false,

    };

  }


  const inconsistent =
    isAccountBalanceInconsistent(
      balance
    );


  if (
    inconsistent
  ) {

    return {

      payment: false,

      tankReturn: false,

      pickup: false,

      inconsistent: true,

    };

  }


  return {

    payment:
      roundMoney(
        balance.moneyDue
      ) > 0,

    tankReturn:
      totalGasAmounts(
        balance.tanksDue
      ) > 0,

    pickup:
      totalGasAmounts(
        balance.pickupDue
      ) > 0,

    inconsistent: false,

  };

}