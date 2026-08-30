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
  ROUTE_SELLER_CONFIG,
  SALE_STATUS,
} from './config.js';

import {
  getState,
  getActiveDay,
  getAccountById,
  getAccountBalance,
  getSaleById,
  getSaleLines,

  getRouteAccountById,
  getRouteTripById,
  getRouteTripsByAccountId,
  getRouteReservationsByAccountId,

  createRouteAccountRecord,
  createRouteTripRecord,
  createRouteSettlementRecord,
  createRouteReservationRecord,

  createMovementBase,
  replaceState,
  touchState,
} from './state.js';

import {
  receiveEmptyCylinders,
  pickupReservedCylinders,

  dispatchRouteCylinders,
  settleRouteInventory,

  reserveRouteCylinders,
  releaseRouteReservedCylinders,
  pickupRouteReservedCylinders,

  calculateTankDebtByGas,
} from './inventory.js';

import {
  fundSaleReplacementReserve,
} from './finance.js';

import {
  registerSale,
} from './sales.js';

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
   OBTENER CUENTA DEL VENDEDOR DE $2
========================================================= */

function requireRouteAccount(
  accountId
) {

  const account =
    getRouteAccountById(
      accountId
    );


  if (!account) {

    throw new Error(
      'No se encontró la cuenta del vendedor de $2.'
    );

  }


  return account;

}


/* =========================================================
   CREAR CUENTA DEL VENDEDOR DE $2
========================================================= */

export function createRouteAccount({

  name,

  reference = '',

  createdAt =
    nowIso(),

}) {

  const cleanName =
    normalizeText(
      name
    );


  const cleanReference =
    normalizeText(
      reference
    );


  if (!cleanName) {

    throw new Error(
      'Debes indicar el nombre de la cuenta.'
    );

  }


  const account =
    createRouteAccountRecord({

      id:
        uid('route-account'),

      name:
        cleanName,

      reference:
        cleanReference,

      createdAt,

    });


  getState()
    .routeAccounts
    .push(
      account
    );


  touchState();

  saveState();


  return cloneData(
    account
  );

}


/* =========================================================
   BUSCAR CUENTAS DEL VENDEDOR DE $2
========================================================= */

export function searchRouteAccounts(
  search = ''
) {

  const query =
    normalizeText(
      search
    ).toLowerCase();


  const accounts =
    getState()
      .routeAccounts
      .filter(
        account =>
          account.active !== false
      );


  /*
    Si no escribió nada,
    mostramos todas las cuentas activas.
  */
  if (!query) {

    return sortNewestFirst(
      accounts.map(
        account =>
          cloneData(
            account
          )
      ),
      account =>
        account.createdAt
    );

  }


  return sortNewestFirst(

    accounts

      .filter(
        account => {

          const name =
            normalizeText(
              account.name
            ).toLowerCase();


          const reference =
            normalizeText(
              account.reference
            ).toLowerCase();


          return (
            name.includes(
              query
            )

            ||

            reference.includes(
              query
            )
          );

        }
      )

      .map(
        account =>
          cloneData(
            account
          )
      ),

    account =>
      account.createdAt

  );

}
/* =========================================================
   BUSCAR CUENTAS + MOSTRAR SALDO EXACTO
========================================================= */

export function searchRouteAccountSummaries(
  search = ''
) {

  const accounts =
    searchRouteAccounts(
      search
    );


  return accounts

    .map(
      account =>
        getRouteAccountSummary(
          account.id
        )
    )

    .filter(
      Boolean
    );

}
/* =========================================================
   INICIAR VIAJE DEL VENDEDOR DE $2
========================================================= */

export function startRouteTrip({

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


    const account =
      requireRouteAccount(
        accountId
      );


    if (
      account.active === false
    ) {

      throw new Error(
        'Esta cuenta del vendedor está desactivada.'
      );

    }


    const quantities = {

      [GAS_IDS.DURAGAS]:
        toNonNegativeInteger(
          duragas
        ),

      [GAS_IDS.KING_GAS]:
        toNonNegativeInteger(
          kinggas
        ),

    };


    const total =
      totalGasAmounts(
        quantities
      );


    if (
      total <= 0
    ) {

      throw new Error(
        'Debes indicar al menos un cilindro para iniciar el viaje.'
      );

    }


    /*
      Mueve:

      full  -> route

      Todavía NO registra ninguna venta.
    */
    const inventoryMovement =
      dispatchRouteCylinders(
        quantities
      );


    const trip =
      createRouteTripRecord({

        id:
          uid('route-trip'),

        accountId:
          account.id,

        dayId:
          day.id,

        createdAt,

        dispatched:
          quantities,

        note:
          normalizeText(
            note
          ),

      });


    getState()
      .routeTrips
      .push(
        trip
      );


    /*
      Registrar la salida en el historial.
    */
    const movement =
      createMovementBase({

        id:
          uid('mov'),

        dayId:
          day.id,

        type:
          MOVEMENT_TYPES
            .ROUTE_DISPATCH,

        createdAt,

        referenceId:
          trip.id,

        reference:
          account.name ||
          'Vendedor de $2',

        detail:
          `Salida con vendedor de $2: ${
            quantities[
              GAS_IDS.DURAGAS
            ]
          } Duragas + ${
            quantities[
              GAS_IDS.KING_GAS
            ]
          } King Gas`,

        value: 0,

        metadata: {

          routeAccountId:
            account.id,

          tripId:
            trip.id,

          quantities:
            cloneData(
              quantities
            ),

          totalCylinders:
            total,

          unitPrice:
            ROUTE_SELLER_CONFIG
              .unitPrice,

          noSaleYet:
            true,

        },

      });


    getState()
      .movements
      .push(
        movement
      );


    account.updatedAt =
      createdAt;


    touchState();

    saveState();


    return {

      account:
        cloneData(
          account
        ),

      trip:
        cloneData(
          trip
        ),

      quantities:
        cloneData(
          quantities
        ),

      inventoryMovement:
        cloneData(
          inventoryMovement
        ),

      movement:
        cloneData(
          movement
        ),

    };

  }
  catch (error) {

    /*
      Si cualquier parte falla,
      restauramos absolutamente todo.
    */
    replaceState(
      stateBefore
    );


    try {

      saveState();

    }
    catch {

      /* Estado restaurado en memoria. */

    }


    throw error;

  }

}

/* =========================================================
   SALDO DE CILINDROS DE UN VIAJE
========================================================= */

export function getRouteTripRemaining(
  tripId
) {

  const trip =
    getRouteTripById(
      tripId
    );


  if (!trip) {

    return emptyGasMap();

  }


  const remaining =
    normalizeGasAmounts(
      trip.dispatched
    );


  const settlements =
    Array.isArray(
      trip.settlements
    )
      ? trip.settlements
      : [];


  settlements.forEach(
    settlement => {

      const sold =
        normalizeGasAmounts(
          settlement.sold
        );


      const returned =
        normalizeGasAmounts(
          settlement.returnedFull
        );


      GAS_ID_LIST.forEach(
        gasId => {

          remaining[gasId] =
            Math.max(
              0,

              remaining[gasId]

              -

              sold[gasId]

              -

              returned[gasId]
            );

        }
      );

    }
  );


  return remaining;

}

/* =========================================================
   RENDIR VIAJE DEL VENDEDOR DE $2
========================================================= */

export function settleRouteTrip({

  tripId,

  soldDuragas = 0,

  soldKinggas = 0,

  returnedDuragas = 0,

  returnedKinggas = 0,

  emptyDuragas = 0,

  emptyKinggas = 0,

  moneyPaid = 0,

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


    const trip =
      getRouteTripById(
        tripId
      );


    if (!trip) {

      throw new Error(
        'No se encontró el viaje del vendedor.'
      );

    }


    if (
      trip.active === false
    ) {

      throw new Error(
        'Este viaje ya fue terminado.'
      );

    }


    const account =
      requireRouteAccount(
        trip.accountId
      );


    const sold = {

      [GAS_IDS.DURAGAS]:
        toNonNegativeInteger(
          soldDuragas
        ),

      [GAS_IDS.KING_GAS]:
        toNonNegativeInteger(
          soldKinggas
        ),

    };


    const returnedFull = {

      [GAS_IDS.DURAGAS]:
        toNonNegativeInteger(
          returnedDuragas
        ),

      [GAS_IDS.KING_GAS]:
        toNonNegativeInteger(
          returnedKinggas
        ),

    };


    const emptyReceived = {

      [GAS_IDS.DURAGAS]:
        toNonNegativeInteger(
          emptyDuragas
        ),

      [GAS_IDS.KING_GAS]:
        toNonNegativeInteger(
          emptyKinggas
        ),

    };


    const totalSold =
      totalGasAmounts(
        sold
      );


    const totalReturned =
      totalGasAmounts(
        returnedFull
      );


    const totalEmpties =
      totalGasAmounts(
        emptyReceived
      );


    if (
      totalSold +
      totalReturned <= 0
    ) {

      throw new Error(
        'Debes indicar lo que vendió o los cilindros llenos que devolvió.'
      );

    }


    /*
      Verificamos el saldo DEL VIAJE,
      no solamente el inventario general.
    */
    const remainingBefore =
      getRouteTripRemaining(
        trip.id
      );


    GAS_ID_LIST.forEach(
      gasId => {

        const accounted =

          sold[gasId]

          +

          returnedFull[gasId];


        if (
          accounted >
          remainingBefore[gasId]
        ) {

          const gasName =

            gasId ===
              GAS_IDS.DURAGAS

              ? 'Duragas'

              : 'King Gas';


          throw new Error(
            `${gasName}: este viaje solo tiene ${remainingBefore[gasId]} cilindro(s) pendientes de rendir.`
          );

        }

      }
    );


/*
  El vendedor puede traer más vacíos que
  cilindros vendidos en ESTA rendición
  si ya tenía una deuda anterior de tanques.
*/
const priorTankDue =
  getRouteLinkedPendingAccounts(
    account.id
  )
    .reduce(
      (
        total,
        item
      ) => {

        return (

          total

          +

          totalGasAmounts(
            item.balance?.tanksDue
          )

        );

      },
      0
    );


const maxEmptiesAllowed =
  totalSold +
  priorTankDue;


if (
  totalEmpties >
  maxEmptiesAllowed
) {

  throw new Error(
    `Puede entregar máximo ${maxEmptiesAllowed} tanque(s): ${totalSold} de esta rendición + ${priorTankDue} de deuda anterior.`
  );

}


const saleEmptyReceived =
  emptyGasMap();


const extraEmptyReceived =
  cloneData(
    emptyReceived
  );


let currentSaleCapacity =
  totalSold;


GAS_ID_LIST.forEach(
  gasId => {

    if (
      currentSaleCapacity <= 0
    ) {

      return;

    }


    const applied =
      Math.min(
        extraEmptyReceived[
          gasId
        ],
        currentSaleCapacity
      );


    saleEmptyReceived[
      gasId
    ] =
      applied;


    extraEmptyReceived[
      gasId
    ] =
      Math.max(
        0,
        extraEmptyReceived[
          gasId
        ] -
        applied
      );


    currentSaleCapacity -=
      applied;

  }
);


const extraOldDebtTotal =
  totalGasAmounts(
    extraEmptyReceived
  );

    const expectedMoney =
      roundMoney(
        totalSold *
        ROUTE_SELLER_CONFIG.unitPrice
      );


   const payment =
  roundMoney(
    toNonNegativeNumber(
      moneyPaid
    )
  );


if (
  payment >
  expectedMoney + 0.005
) {

  throw new Error(
    `Por esta venta corresponden $${expectedMoney.toFixed(2)}. Si entrega dinero de una deuda anterior, regístralo después como abono de su cuenta.`
  );

}


if (
  totalSold === 0 &&
  payment > 0
) {

  throw new Error(
    'Si no vendió cilindros en esta rendición, el dinero de una deuda anterior debe registrarse como abono de su cuenta.'
  );

}


const settlementId =
  uid('route-settlement');
    /*
      IMPORTANTE:

      Los cilindros vendidos ya estaban en ROUTE,
      mientras que registerSale() trabaja desde FULL.

      Primero devolvemos temporalmente a FULL:
      - los que realmente vendió;
      - los que físicamente regresó.

      Después registerSale() descuenta solamente
      los vendidos.

      El resultado final queda correcto:

      vendido       -> sale del negocio
      devuelto lleno -> queda en full
      no rendido    -> continúa en route
    */
    const accountedToWarehouse =
      emptyGasMap();


    GAS_ID_LIST.forEach(
      gasId => {

        accountedToWarehouse[gasId] =

          sold[gasId]

          +

          returnedFull[gasId];

      }
    );


    settleRouteInventory({

      sold:
        emptyGasMap(),

      returnedFull:
        accountedToWarehouse,

      emptiesReceived:
        emptyGasMap(),

    });


    let saleResult =
      null;


    let sale =
      null;


    let pendingAccount =
      null;


    /*
      Si realmente vendió algo,
      recién AHORA creamos la venta.
    */
    if (
      totalSold > 0
    ) {

      saleResult =
        registerSale({

          customer:
            account.name,

          quantities:
            sold,

          emptyReceived:
  saleEmptyReceived,

          price:
            ROUTE_SELLER_CONFIG
              .unitPrice,

          paymentMethod:
            PAYMENT_METHODS.CASH,

          received:
            payment,

          note:
            normalizeText(
              note
            ) ||
            'Venta correspondiente a vendedor de $2',

          createdAt,

        });


      sale =
        getSaleById(
          saleResult.sale.id
        );


      if (sale) {

        /*
          Enlazamos la venta con su
          cuenta/viaje/rendición especial.
        */
        sale.routeAccountId =
          account.id;

        sale.routeTripId =
          trip.id;

        sale.routeSettlementId =
          settlementId;

        sale.source =
          'route_seller';


        /*
          Para historial dejamos el inventario
          realmente existente antes y después
          de TODA la rendición, no el estado
          temporal utilizado internamente.
        */
        sale.inventoryBefore =
          cloneData(
            stateBefore.inventory
          );

        sale.inventoryAfter =
          cloneData(
            getState().inventory
          );


        if (
          sale.accountId
        ) {

          pendingAccount =
            getAccountById(
              sale.accountId
            );


          if (
            pendingAccount
          ) {

            /*
              Esta sigue siendo una cuenta
              normal técnicamente para poder
              usar toda la lógica ya existente
              de abonos y tanques.

              Pero queda ligada al vendedor,
              de manera que después podremos
              mostrarla agrupada únicamente
              dentro de su cuenta.
            */
            pendingAccount.routeAccountId =
              account.id;

            pendingAccount.routeTripId =
              trip.id;

            pendingAccount.routeSettlementId =
              settlementId;

            pendingAccount.isRouteSellerAccount =
              true;

          }

        }

      }
/*
  Si sobraron vacíos después de cubrir
  la venta actual, pertenecen a deudas
  anteriores de ESTE vendedor.
*/
let oldTankReturnResult =
  null;


if (
  extraOldDebtTotal > 0
) {

  oldTankReturnResult =
    registerRouteTankReturn({

      accountId:
        account.id,

      duragas:
        extraEmptyReceived[
          GAS_IDS.DURAGAS
        ],

      kinggas:
        extraEmptyReceived[
          GAS_IDS.KING_GAS
        ],

      note:
        `Vacíos aplicados a deuda anterior durante rendición de viaje ${trip.id}`,

      createdAt,

    });

}
    }


    const settlement =
      createRouteSettlementRecord({

        id:
          settlementId,

        tripId:
          trip.id,

        dayId:
          day.id,

        createdAt,

        sold,

        returnedFull,

        emptiesReceived:
          emptyReceived,

        moneyPaid:
          payment,

        note:
          normalizeText(
            note
          ),

      });


    /*
      Información adicional para relacionarlo
      con la venta real y su pendiente.
    */
    settlement.saleId =
      sale?.id ??
      null;

    settlement.pendingAccountId =
      sale?.accountId ??
      null;

    settlement.moneyDue =
      roundMoney(
        sale?.moneyDue ??
        0
      );

    settlement.tanksDue =
      cloneData(
        sale?.tanksDue ??
        emptyGasMap()
      );


    if (
      !Array.isArray(
        trip.settlements
      )
    ) {

      trip.settlements = [];

    }


    trip.settlements.push(
      settlement
    );


    /*
      Comprobar qué quedó todavía
      con el vendedor de ESTE viaje.
    */
    const remainingAfter =
      getRouteTripRemaining(
        trip.id
      );


    const totalRemaining =
      totalGasAmounts(
        remainingAfter
      );


    if (
      totalRemaining === 0
    ) {

      trip.active =
        false;

      trip.closedAt =
        createdAt;

    }
    else {

      trip.active =
        true;

      trip.closedAt =
        null;

    }


    account.updatedAt =
      createdAt;


    /*
      Movimiento específico de rendición.
      value = 0 para no duplicar ingreso:
      la venta ya tiene su propio movimiento.
    */
    const movement =
      createMovementBase({

        id:
          uid('mov'),

        dayId:
          day.id,

        type:
          MOVEMENT_TYPES
            .ROUTE_SETTLEMENT,

        createdAt,

        referenceId:
          settlement.id,

        reference:
          account.name ||
          'Vendedor de $2',

        detail:
          `Rindió viaje: vendió ${totalSold}, devolvió ${totalReturned} lleno(s), entregó $${payment.toFixed(2)}`,

        value: 0,

        metadata: {

          routeAccountId:
            account.id,

          tripId:
            trip.id,

          settlementId:
            settlement.id,

          saleId:
            sale?.id ??
            null,

          sold:
            cloneData(
              sold
            ),

          returnedFull:
            cloneData(
              returnedFull
            ),

          emptyReceived:
            cloneData(
              emptyReceived
            ),

          expectedMoney,

          moneyPaid:
            payment,

          moneyDue:
            settlement.moneyDue,

          tanksDue:
            cloneData(
              settlement.tanksDue
            ),

          remainingAfter:
            cloneData(
              remainingAfter
            ),

        },

      });


    getState()
      .movements
      .push(
        movement
      );


    touchState();

    saveState();


    return {

      account:
        cloneData(
          account
        ),

      trip:
        cloneData(
          trip
        ),

      settlement:
        cloneData(
          settlement
        ),

      sale:
        sale
          ? cloneData(
              sale
            )
          : null,

      pendingAccount:
        pendingAccount
          ? cloneData(
              pendingAccount
            )
          : null,

      remaining:
        cloneData(
          remainingAfter
        ),

      movement:
        cloneData(
          movement
        ),

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

      /* Estado restaurado en memoria. */

    }


    throw error;

  }

}

/* =========================================================
   PENDIENTES NORMALES LIGADOS A VENDEDOR DE $2
========================================================= */

function getRouteLinkedPendingAccounts(
  routeAccountId
) {

  if (!routeAccountId) {

    return [];

  }


  const state =
    getState();


  return state.accounts

    .filter(
      account =>
        account.routeAccountId ===
        routeAccountId
    )

    .map(
      account => {

        const balance =
          state.accountBalances.find(
            item =>
              item.accountId ===
              account.id
          );


        return {

          account,

          balance:
            balance ?? null,

        };

      }
    );

}
/* =========================================================
   RESUMEN DE UNA CUENTA DEL VENDEDOR DE $2
========================================================= */

export function getRouteAccountSummary(
  accountId
) {

  const account =
    getRouteAccountById(
      accountId
    );


  if (!account) {

    return null;

  }


  /* =====================================================
     1. DEUDAS DE DINERO Y TANQUES
  ===================================================== */

  const linkedPending =
    getRouteLinkedPendingAccounts(
      account.id
    );


  let moneyDue = 0;


  const tanksDue =
    emptyGasMap();


  linkedPending.forEach(
    item => {

      const balance =
        item.balance;


      if (!balance) {

        return;

      }


      moneyDue =
        roundMoney(

          moneyDue

          +

          toNonNegativeNumber(
            balance.moneyDue
          )

        );


      GAS_ID_LIST.forEach(
        gasId => {

          tanksDue[gasId] +=
            toNonNegativeInteger(
              balance
                .tanksDue?.[gasId]
            );

        }
      );

    }
  );


  /* =====================================================
     2. CILINDROS QUE TODAVÍA TIENE EN RUTA
  ===================================================== */

  const route =
    emptyGasMap();


  const trips =
    getRouteTripsByAccountId(
      account.id
    );


  trips.forEach(
    trip => {

      const remaining =
        getRouteTripRemaining(
          trip.id
        );


      GAS_ID_LIST.forEach(
        gasId => {

          route[gasId] +=
            toNonNegativeInteger(
              remaining[gasId]
            );

        }
      );

    }
  );


  /* =====================================================
     3. CILINDROS QUE TIENE APARTADOS
  ===================================================== */

  const reserved =
    emptyGasMap();


  const reservations =
    getRouteReservationsByAccountId(
      account.id
    );


  reservations.forEach(
    reservation => {

      if (
        reservation.active ===
        false
      ) {

        return;

      }


      const remaining =
        normalizeGasAmounts(
          reservation.remaining
        );


      GAS_ID_LIST.forEach(
        gasId => {

          reserved[gasId] +=
            remaining[gasId];

        }
      );

    }
  );


  /* =====================================================
     4. TOTALES
  ===================================================== */

  const routeTotal =
    totalGasAmounts(
      route
    );


  const tanksDueTotal =
    totalGasAmounts(
      tanksDue
    );


  const reservedTotal =
    totalGasAmounts(
      reserved
    );


  const hasPending =

    moneyDue > 0

    ||

    tanksDueTotal > 0

    ||

    routeTotal > 0

    ||

    reservedTotal > 0;


  return {

    account:
      cloneData(
        account
      ),


    moneyDue:
      roundMoney(
        moneyDue
      ),


    tanksDue:
      cloneData(
        tanksDue
      ),

    tanksDueTotal,


    /*
      Cilindros que físicamente
      están todavía con esta persona.
    */
    route:
      cloneData(
        route
      ),

    routeTotal,


    /*
      Cilindros separados en bodega
      para esta persona.
    */
    reserved:
      cloneData(
        reserved
      ),

    reservedTotal,


    openTrips:
      trips.filter(
        trip =>
          trip.active !== false
      ).length,


    pendingAccounts:
      linkedPending.filter(
        item =>
          item.account.status ===
          ACCOUNT_STATUS.OPEN
      ).length,


    hasPending,

  };

}

/* =========================================================
   ABONAR DINERO A CUENTA DEL VENDEDOR DE $2
========================================================= */

export function registerRouteAccountPayment({

  accountId,

  amount,

  note = '',

  createdAt =
    nowIso(),

}) {

  const stateBefore =
    cloneData(
      getState()
    );


  try {

    requireActiveDay();


    const routeAccount =
      requireRouteAccount(
        accountId
      );


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


    /*
      Buscamos solamente las deudas de dinero
      relacionadas con ESTE vendedor.
    */
    const pendingAccounts =
      getRouteLinkedPendingAccounts(
        routeAccount.id
      )

        .filter(
          item => {

            return (

              item.account.status ===
                ACCOUNT_STATUS.OPEN

              &&

              roundMoney(
                toNonNegativeNumber(
                  item.balance?.moneyDue
                )
              ) > 0

            );

          }
        )

        /*
          Se pagan primero las deudas
          más antiguas.

          Ejemplo:

          Viaje 1 debe $2
          Viaje 2 debe $4
          Abona $4

          Resultado:
          Viaje 1 -> $0
          Viaje 2 -> $2
        */
        .sort(
          (a, b) => {

            return new Date(
              a.account.createdAt ?? 0
            ).getTime()

            -

            new Date(
              b.account.createdAt ?? 0
            ).getTime();

          }
        );


    const totalDue =
      roundMoney(

        pendingAccounts.reduce(
          (
            total,
            item
          ) => {

            return (

              total

              +

              toNonNegativeNumber(
                item.balance?.moneyDue
              )

            );

          },
          0
        )

      );


    if (
      totalDue <= 0
    ) {

      throw new Error(
        'Esta cuenta del vendedor no tiene dinero pendiente.'
      );

    }


    if (
      payment >
      totalDue + 0.005
    ) {

      throw new Error(
        `Esta persona debe $${totalDue.toFixed(2)}. No puedes registrar un abono mayor.`
      );

    }


    let remaining =
      payment;


    const allocations = [];


    /*
      Repartimos el dinero entre las
      deudas de esta misma persona.
    */
    for (
      const item
      of pendingAccounts
    ) {

      if (
        remaining <= 0.005
      ) {

        break;

      }


      const dueBefore =
        roundMoney(
          toNonNegativeNumber(
            item.balance.moneyDue
          )
        );


      if (
        dueBefore <= 0
      ) {

        continue;

      }


      const applied =
        roundMoney(
          Math.min(
            dueBefore,
            remaining
          )
        );


      const result =
        registerAccountPayment({

          accountId:
            item.account.id,

          amount:
            applied,

          paymentMethod:
            PAYMENT_METHODS.CASH,

          note:
            normalizeText(
              note
            ) ||
            `Abono de ${routeAccount.name} - vendedor de $2`,

          createdAt,

        });


      allocations.push({

        pendingAccountId:
          item.account.id,

        saleId:
          item.account.saleId,

        routeTripId:
          item.account.routeTripId ??
          null,

        amount:
          applied,

        moneyDueBefore:
          dueBefore,

        moneyDueAfter:
          roundMoney(
            result.balance.moneyDue
          ),

      });


      remaining =
        roundMoney(
          remaining -
          applied
        );

    }


    /*
      Por seguridad, no debe quedar dinero
      sin aplicar después de haber validado
      el total pendiente.
    */
    if (
      remaining > 0.005
    ) {

      throw new Error(
        `Quedaron $${remaining.toFixed(2)} sin aplicar al pendiente.`
      );

    }


    routeAccount.updatedAt =
      createdAt;


    touchState();

    saveState();


    return {

      account:
        cloneData(
          routeAccount
        ),

      payment,

      totalDueBefore:
        totalDue,

      totalDueAfter:
        roundMoney(
          Math.max(
            0,
            totalDue -
            payment
          )
        ),

      allocations:
        cloneData(
          allocations
        ),

      summary:
        getRouteAccountSummary(
          routeAccount.id
        ),

    };

  }
  catch (error) {

    /*
      Si falla una de las aplicaciones,
      volvemos al estado previo completo.
    */
    replaceState(
      stateBefore
    );


    try {

      saveState();

    }
    catch {

      /* Estado restaurado en memoria. */

    }


    throw error;

  }

}

/* =========================================================
   DEVOLVER TANQUES A CUENTA DEL VENDEDOR DE $2
========================================================= */

export function registerRouteTankReturn({

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

    requireActiveDay();


    const routeAccount =
      requireRouteAccount(
        accountId
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


    /*
      Solo tomamos pendientes que pertenecen
      a ESTE vendedor y que todavía deben tanques.
    */
    const pendingAccounts =
      getRouteLinkedPendingAccounts(
        routeAccount.id
      )

        .filter(
          item => {

            return (

              item.account.status ===
                ACCOUNT_STATUS.OPEN

              &&

              totalGasAmounts(
                item.balance?.tanksDue
              ) > 0

            );

          }
        )

        /*
          Primero cancelamos las deudas
          más antiguas.
        */
        .sort(
          (a, b) => {

            return new Date(
              a.account.createdAt ?? 0
            ).getTime()

            -

            new Date(
              b.account.createdAt ?? 0
            ).getTime();

          }
        );


    const totalDue =
      pendingAccounts.reduce(
        (
          total,
          item
        ) => {

          return (

            total

            +

            totalGasAmounts(
              item.balance?.tanksDue
            )

          );

        },
        0
      );


    if (
      totalDue <= 0
    ) {

      throw new Error(
        'Esta cuenta del vendedor no tiene tanques pendientes.'
      );

    }


    if (
      totalReturned >
      totalDue
    ) {

      throw new Error(
        `Esta persona debe ${totalDue} tanque(s). No puedes registrar ${totalReturned}.`
      );

    }


    /*
      Estos son los vacíos físicos
      que todavía falta repartir.
    */
    const remainingReturned =
      cloneData(
        returned
      );


    const allocations = [];


    for (
      const item
      of pendingAccounts
    ) {

      if (
        totalGasAmounts(
          remainingReturned
        ) <= 0
      ) {

        break;

      }


      const debt =
        normalizeGasAmounts(
          item.balance.tanksDue
        );


      const accountDue =
        totalGasAmounts(
          debt
        );


      if (
        accountDue <= 0
      ) {

        continue;

      }


      const applied =
        emptyGasMap();


      /*
        PASO A:
        Intentamos primero compensar
        la misma marca.
      */

      applied[
        GAS_IDS.DURAGAS
      ] =
        Math.min(
          remainingReturned[
            GAS_IDS.DURAGAS
          ],
          debt[
            GAS_IDS.DURAGAS
          ]
        );


      applied[
        GAS_IDS.KING_GAS
      ] =
        Math.min(
          remainingReturned[
            GAS_IDS.KING_GAS
          ],
          debt[
            GAS_IDS.KING_GAS
          ]
        );


      let capacity =
        accountDue -
        totalGasAmounts(
          applied
        );


      /*
        PASO B:
        Si todavía debe tanques,
        permitimos intercambio entre marcas.
      */

      if (
        capacity > 0
      ) {

        const extraDuragas =
          Math.min(

            Math.max(
              0,

              remainingReturned[
                GAS_IDS.DURAGAS
              ]

              -

              applied[
                GAS_IDS.DURAGAS
              ]
            ),

            capacity
          );


        applied[
          GAS_IDS.DURAGAS
        ] +=
          extraDuragas;


        capacity -=
          extraDuragas;

      }


      if (
        capacity > 0
      ) {

        const extraKing =
          Math.min(

            Math.max(
              0,

              remainingReturned[
                GAS_IDS.KING_GAS
              ]

              -

              applied[
                GAS_IDS.KING_GAS
              ]
            ),

            capacity
          );


        applied[
          GAS_IDS.KING_GAS
        ] +=
          extraKing;

      }


      const appliedTotal =
        totalGasAmounts(
          applied
        );


      if (
        appliedTotal <= 0
      ) {

        continue;

      }


      const tanksDueBefore =
        cloneData(
          item.balance.tanksDue
        );


      /*
        Reutilizamos la función normal.

        Ella:
        - recibe físicamente los vacíos;
        - compensa la deuda;
        - permite cambio de marca;
        - actualiza la venta;
        - cierra el pendiente si corresponde.
      */
      const result =
        registerTankReturn({

          accountId:
            item.account.id,

          duragas:
            applied[
              GAS_IDS.DURAGAS
            ],

          kinggas:
            applied[
              GAS_IDS.KING_GAS
            ],

          note:
            normalizeText(
              note
            ) ||
            `Devolución de ${routeAccount.name} - vendedor de $2`,

          createdAt,

        });


      allocations.push({

        pendingAccountId:
          item.account.id,

        saleId:
          item.account.saleId,

        routeTripId:
          item.account.routeTripId ??
          null,

        returned:
          cloneData(
            applied
          ),

        tanksDueBefore,

        tanksDueAfter:
          cloneData(
            result.balance.tanksDue
          ),

      });


      GAS_ID_LIST.forEach(
        gasId => {

          remainingReturned[
            gasId
          ] =
            Math.max(

              0,

              remainingReturned[
                gasId
              ]

              -

              applied[
                gasId
              ]

            );

        }
      );

    }


    /*
      Esta protección evita que un vacío
      entre al inventario pero no quede
      aplicado a ninguna deuda.
    */
    if (
      totalGasAmounts(
        remainingReturned
      ) > 0
    ) {

      throw new Error(
        'Quedaron tanques sin aplicar a las deudas del vendedor.'
      );

    }


    routeAccount.updatedAt =
      createdAt;


    touchState();

    saveState();


    return {

      account:
        cloneData(
          routeAccount
        ),

      returned:
        cloneData(
          returned
        ),

      totalReturned,

      totalDueBefore:
        totalDue,

      totalDueAfter:
        Math.max(
          0,
          totalDue -
          totalReturned
        ),

      allocations:
        cloneData(
          allocations
        ),

      summary:
        getRouteAccountSummary(
          routeAccount.id
        ),

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

      /* Estado restaurado en memoria. */

    }


    throw error;

  }

}

   /* =========================================================
   OBTENER APARTADO DEL VENDEDOR
========================================================= */

function requireRouteReservation(
  reservationId
) {

  const reservation =
    getState()
      .routeReservations
      .find(
        item =>
          item.id ===
          reservationId
      );


  if (!reservation) {

    throw new Error(
      'No se encontró el apartado del vendedor.'
    );

  }


  return reservation;

}
   /* =========================================================
   APARTAR CILINDROS PARA VENDEDOR DE $2
========================================================= */

export function createRouteReservation({

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


    const account =
      requireRouteAccount(
        accountId
      );


    const quantities = {

      [GAS_IDS.DURAGAS]:
        toNonNegativeInteger(
          duragas
        ),

      [GAS_IDS.KING_GAS]:
        toNonNegativeInteger(
          kinggas
        ),

    };


    const total =
      totalGasAmounts(
        quantities
      );


    if (
      total <= 0
    ) {

      throw new Error(
        'Debes indicar al menos un cilindro para apartar.'
      );

    }


    /*
      Inventario:

      full
        ↓
      routeReserved

      Sigue dentro de la bodega.
    */
    const inventoryMovement =
      reserveRouteCylinders(
        quantities
      );


    const reservation =
      createRouteReservationRecord({

        id:
          uid('route-reservation'),

        accountId:
          account.id,

        dayId:
          day.id,

        createdAt,

        quantities,

        note:
          normalizeText(
            note
          ),

      });


    getState()
      .routeReservations
      .push(
        reservation
      );


    const movement =
      createMovementBase({

        id:
          uid('mov'),

        dayId:
          day.id,

        type:
          MOVEMENT_TYPES
            .ROUTE_RESERVE,

        createdAt,

        referenceId:
          reservation.id,

        reference:
          account.name ||
          'Vendedor de $2',

        detail:
          `Apartado para vendedor: ${
            quantities[GAS_IDS.DURAGAS]
          } Duragas + ${
            quantities[GAS_IDS.KING_GAS]
          } King Gas`,

        value: 0,

        metadata: {

          routeAccountId:
            account.id,

          reservationId:
            reservation.id,

          quantities:
            cloneData(
              quantities
            ),

          totalCylinders:
            total,

          noSale:
            true,

        },

      });


    getState()
      .movements
      .push(
        movement
      );


    account.updatedAt =
      createdAt;


    touchState();

    saveState();


    return {

      account:
        cloneData(
          account
        ),

      reservation:
        cloneData(
          reservation
        ),

      inventory:
        cloneData(
          inventoryMovement
        ),

      movement:
        cloneData(
          movement
        ),

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
   RETIRAR APARTADO Y ENVIARLO A RUTA
========================================================= */

export function pickupRouteReservation({

  reservationId,

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


    const reservation =
      requireRouteReservation(
        reservationId
      );


    if (
      reservation.active === false
    ) {

      throw new Error(
        'Este apartado ya está completado.'
      );

    }


    const account =
      requireRouteAccount(
        reservation.accountId
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


    if (
      totalGasAmounts(
        pickup
      ) <= 0
    ) {

      throw new Error(
        'Debes indicar al menos un cilindro para retirar.'
      );

    }


    const remaining =
      normalizeGasAmounts(
        reservation.remaining
      );


    GAS_ID_LIST.forEach(
      gasId => {

        if (
          pickup[gasId] >
          remaining[gasId]
        ) {

          const name =
            gasId ===
            GAS_IDS.DURAGAS
              ? 'Duragas'
              : 'King Gas';


          throw new Error(
            `Solo quedan ${remaining[gasId]} ${name} apartado(s).`
          );

        }

      }
    );


    /*
      routeReserved
          ↓
        route

      No toca full.
    */
    const inventoryMovement =
      pickupRouteReservedCylinders(
        pickup
      );


    GAS_ID_LIST.forEach(
      gasId => {

        reservation.remaining[gasId] =
          Math.max(
            0,
            remaining[gasId] -
            pickup[gasId]
          );

      }
    );


    /*
      Los cilindros retirados forman
      un viaje nuevo.
    */
    const trip =
      createRouteTripRecord({

        id:
          uid('route-trip'),

        accountId:
          account.id,

        dayId:
          day.id,

        createdAt,

        dispatched:
          pickup,

        note:
          normalizeText(
            note
          ) ||
          'Retiro de cilindros previamente apartados',

      });


    getState()
      .routeTrips
      .push(
        trip
      );


    if (
      totalGasAmounts(
        reservation.remaining
      ) === 0
    ) {

      reservation.active =
        false;

      reservation.completedAt =
        createdAt;

    }


    const movement =
      createMovementBase({

        id:
          uid('mov'),

        dayId:
          day.id,

        type:
          MOVEMENT_TYPES
            .ROUTE_DISPATCH,

        createdAt,

        referenceId:
          trip.id,

        reference:
          account.name ||
          'Vendedor de $2',

        detail:
          `Retiró apartado: ${
            pickup[GAS_IDS.DURAGAS]
          } Duragas + ${
            pickup[GAS_IDS.KING_GAS]
          } King Gas`,

        value: 0,

        metadata: {

          routeAccountId:
            account.id,

          reservationId:
            reservation.id,

          tripId:
            trip.id,

          quantities:
            cloneData(
              pickup
            ),

          fromReservation:
            true,

          noSaleYet:
            true,

        },

      });


    getState()
      .movements
      .push(
        movement
      );


    account.updatedAt =
      createdAt;


    touchState();

    saveState();


    return {

      reservation:
        cloneData(
          reservation
        ),

      trip:
        cloneData(
          trip
        ),

      inventory:
        cloneData(
          inventoryMovement
        ),

      movement:
        cloneData(
          movement
        ),

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
   LIBERAR APARTADO DEL VENDEDOR
========================================================= */

export function releaseRouteReservation({

  reservationId,

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


    const reservation =
      requireRouteReservation(
        reservationId
      );


    if (
      reservation.active === false
    ) {

      throw new Error(
        'Este apartado ya está completado.'
      );

    }


    const account =
      requireRouteAccount(
        reservation.accountId
      );


    const release = {

      [GAS_IDS.DURAGAS]:
        toNonNegativeInteger(
          duragas
        ),

      [GAS_IDS.KING_GAS]:
        toNonNegativeInteger(
          kinggas
        ),

    };


    if (
      totalGasAmounts(
        release
      ) <= 0
    ) {

      throw new Error(
        'Debes indicar al menos un cilindro para liberar.'
      );

    }


    const remaining =
      normalizeGasAmounts(
        reservation.remaining
      );


    GAS_ID_LIST.forEach(
      gasId => {

        if (
          release[gasId] >
          remaining[gasId]
        ) {

          throw new Error(
            'No puedes liberar más cilindros de los que siguen apartados.'
          );

        }

      }
    );


    /*
      routeReserved
          ↓
        full
    */
    const inventoryMovement =
      releaseRouteReservedCylinders(
        release
      );


    GAS_ID_LIST.forEach(
      gasId => {

        reservation.remaining[gasId] =
          Math.max(
            0,
            remaining[gasId] -
            release[gasId]
          );

      }
    );


    if (
      totalGasAmounts(
        reservation.remaining
      ) === 0
    ) {

      reservation.active =
        false;

      reservation.completedAt =
        createdAt;

    }


    const movement =
      createMovementBase({

        id:
          uid('mov'),

        dayId:
          day.id,

        type:
          MOVEMENT_TYPES
            .ROUTE_RELEASE,

        createdAt,

        referenceId:
          reservation.id,

        reference:
          account.name ||
          'Vendedor de $2',

        detail:
          `Liberó apartado: ${
            release[GAS_IDS.DURAGAS]
          } Duragas + ${
            release[GAS_IDS.KING_GAS]
          } King Gas`,

        value: 0,

        metadata: {

          routeAccountId:
            account.id,

          reservationId:
            reservation.id,

          quantities:
            cloneData(
              release
            ),

        },

      });


    getState()
      .movements
      .push(
        movement
      );


    account.updatedAt =
      createdAt;


    touchState();

    saveState();


    return {

      reservation:
        cloneData(
          reservation
        ),

      inventory:
        cloneData(
          inventoryMovement
        ),

      movement:
        cloneData(
          movement
        ),

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
