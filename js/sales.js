/* =========================================================
   CONTROLGAS
   VENTAS

   Responsabilidades:
   - Calcular una venta antes de guardarla
   - Validar productos y stock
   - Efectivo / transferencia / fiado
   - Calcular vuelto
   - Calcular deuda de dinero
   - Calcular deuda de tanques
   - Permitir intercambio entre marcas
   - Permitir venta mixta
   - Entrega inmediata
   - Paga y retira después
   - Crear pendiente automáticamente
   - Modificar inventario
   - Financiar bolsas de reposición
   - Registrar venta y líneas
   - Registrar movimiento histórico
   - Guardar en localStorage

   IMPORTANTE:

   Una venta NO es lo mismo que un cobro.

   Una venta puede quedar:
   - completada
   - debiendo dinero
   - debiendo tanques
   - debiendo ambos
   - pagada y pendiente de retirar
========================================================= */

import {
  GAS_IDS,
  GAS_ID_LIST,
  GAS_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LIST,
  SALE_MODES,
  SALE_STATUS,
  SALE_STATUS_LABELS,
  ACCOUNT_TYPES,
  ACCOUNT_STATUS,
  MOVEMENT_TYPES,
  isValidSalePrice,
} from './config.js';


import {
  getState,
  getActiveDay,
  createAccountBalanceRecord,
  createMovementBase,
  getSaleById,
  getSaleLines,
  replaceState,
  touchState,
} from './state.js';


import {
  validateSaleStock,
  applySaleInventory,
  calculateTankDebtByGas,
  calculateTotalTankDebt,
  describeGasExchange,
} from './inventory.js';


import {
  calculateSaleFinancialPreview,
  calculateReserveFundingPlan,
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
  toNonNegativeInteger,
  toNonNegativeNumber,
  uid,
} from './utils.js';



/* =========================================================
   MARCA VACÍA
========================================================= */

function emptyGasMap() {

  return {

    [GAS_IDS.DURAGAS]: 0,

    [GAS_IDS.KING_GAS]: 0,

  };

}



/* =========================================================
   NORMALIZAR CANTIDADES
========================================================= */

export function normalizeSaleQuantities(
  quantities = {}
) {

  return {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        quantities[
          GAS_IDS.DURAGAS
        ]
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        quantities[
          GAS_IDS.KING_GAS
        ]
      ),

  };

}



/* =========================================================
   NORMALIZAR VACÍOS
========================================================= */

export function normalizeEmptyReceived(
  emptyReceived = {}
) {

  return {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        emptyReceived[
          GAS_IDS.DURAGAS
        ]
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        emptyReceived[
          GAS_IDS.KING_GAS
        ]
      ),

  };

}



/* =========================================================
   TOTAL DE UNIDADES
========================================================= */

export function getSaleUnitsTotal(
  quantities = {}
) {

  const normalized =
    normalizeSaleQuantities(
      quantities
    );


  return (

    normalized[
      GAS_IDS.DURAGAS
    ]

    +

    normalized[
      GAS_IDS.KING_GAS
    ]

  );

}



/* =========================================================
   TOTAL DE VACÍOS
========================================================= */

export function getEmptyReceivedTotal(
  emptyReceived = {}
) {

  const normalized =
    normalizeEmptyReceived(
      emptyReceived
    );


  return (

    normalized[
      GAS_IDS.DURAGAS
    ]

    +

    normalized[
      GAS_IDS.KING_GAS
    ]

  );

}



/* =========================================================
   CALCULAR PAGO
========================================================= */

export function calculateSalePayment({

  total,

  paymentMethod,

  received = 0,

}) {

  const saleTotal =
    roundMoney(
      toNonNegativeNumber(
        total
      )
    );


  /*
    TRANSFERENCIA

    La transferencia se considera exacta.
  */

  if (
    paymentMethod ===
    PAYMENT_METHODS.TRANSFER
  ) {

    return {

      received:
        saleTotal,

      paidNow:
        saleTotal,

      change: 0,

      moneyDue: 0,

    };

  }



  /*
    FIADO

    No se cobra nada ahora.
  */

  if (
    paymentMethod ===
    PAYMENT_METHODS.CREDIT
  ) {

    return {

      received: 0,

      paidNow: 0,

      change: 0,

      moneyDue:
        saleTotal,

    };

  }



  /*
    EFECTIVO
  */

  const cashReceived =
    roundMoney(
      toNonNegativeNumber(
        received
      )
    );


  const paidNow =
    roundMoney(
      Math.min(
        cashReceived,
        saleTotal
      )
    );


  const change =
    roundMoney(
      Math.max(
        0,
        cashReceived -
        saleTotal
      )
    );


  const moneyDue =
    roundMoney(
      Math.max(
        0,
        saleTotal -
        paidNow
      )
    );


  return {

    received:
      cashReceived,

    paidNow,

    change,

    moneyDue,

  };

}



/* =========================================================
   CALCULAR TIPO DE PENDIENTE
========================================================= */

function determineAccountType({

  moneyDue,

  tanksDue,

  pickupDue,

}) {

  const owesMoney =
    roundMoney(
      moneyDue
    ) > 0;


  const owesTanks =
    calculateTotalTankDebt(
      tanksDue
    ) > 0;


  const owesPickup =

    getSaleUnitsTotal(
      pickupDue
    ) > 0;



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



/* =========================================================
   ESTADO DE VENTA
========================================================= */

function determineSaleStatus({

  moneyDue,

  tanksDue,

  pickupDue,

}) {

  const accountType =
    determineAccountType({

      moneyDue,

      tanksDue,

      pickupDue,

    });


  switch (
    accountType
  ) {

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
   COTIZAR / PREVISUALIZAR VENTA
========================================================= */

/*
  Esta función NO modifica datos.

  app.js podrá llamarla cada vez que el usuario
  toque +, -, precio, forma de pago, etc.
*/

export function calculateSalePreview({

  quantities = {},

  emptyReceived = {},

  price = 2.25,

  paymentMethod =
    PAYMENT_METHODS.CASH,

  received = 0,

  saleMode =
    SALE_MODES.NOW,

}) {

  const normalizedQuantities =
    normalizeSaleQuantities(
      quantities
    );


  const normalizedEmpty =
    normalizeEmptyReceived(
      emptyReceived
    );


  const financial =
    calculateSaleFinancialPreview({

      quantities:
        normalizedQuantities,

      price,

    });


  const payment =
    calculateSalePayment({

      total:
        financial.totalRevenue,

      paymentMethod,

      received,

    });


  const collectionPlan =
    calculateReserveFundingPlan({

      quantities:
        normalizedQuantities,

      price,

      amountCollected:
        payment.paidNow,

    });


  const tanksDue =
    calculateTankDebtByGas({

      quantities:
        normalizedQuantities,

      emptyReceived:
        normalizedEmpty,

    });


  const pickupDue =

    saleMode ===
      SALE_MODES.LATER

      ? cloneData(
          normalizedQuantities
        )

      : emptyGasMap();


  const status =
    determineSaleStatus({

      moneyDue:
        payment.moneyDue,

      tanksDue,

      pickupDue,

    });


  const exchange =
    describeGasExchange({

      quantities:
        normalizedQuantities,

      emptyReceived:
        normalizedEmpty,

    });



  /*
    Este valor es la ganancia teórica de los
    productos vendidos.

    Más adelante se diferencia de la ganancia
    efectivamente disponible cuando hay fiados.
  */

  return {

    quantities:
      normalizedQuantities,

    emptyReceived:
      normalizedEmpty,

    totalUnits:
      financial.totalUnits,

    price:
      roundMoney(price),

    total:
      financial.totalRevenue,

    paymentMethod,

    received:
      payment.received,

    paidNow:
      payment.paidNow,

    change:
      payment.change,

    moneyDue:
      payment.moneyDue,

    tanksDue,

    tanksDueTotal:
      calculateTotalTankDebt(
        tanksDue
      ),

    pickupDue,

    pickupDueTotal:
      getSaleUnitsTotal(
        pickupDue
      ),

    reserveRequired:
      financial.totalReserveRequired,

    grossProfit:
      financial.grossProfit,

    collectedProfit:
      collectionPlan
        .availableProfitFromCollection,

    byGas:
      financial.byGas,

    status,

    statusLabel:
      SALE_STATUS_LABELS[
        status
      ] ?? status,

    accountType:
      determineAccountType({

        moneyDue:
          payment.moneyDue,

        tanksDue,

        pickupDue,

      }),

    exchange,

  };

}



/* =========================================================
   VALIDAR VENTA
========================================================= */

export function validateSale({

  customer = '',

  quantities = {},

  emptyReceived = {},

  price,

  paymentMethod,

  received = 0,

  saleMode,

}) {

  const errors = [];


  const day =
    getActiveDay();


  if (!day) {

    errors.push(
      'Debes abrir el día antes de registrar ventas.'
    );

  }



  if (
    saleMode !==
      SALE_MODES.NOW &&
    saleMode !==
      SALE_MODES.LATER
  ) {

    errors.push(
      'El tipo de entrega no es válido.'
    );

  }
if (
  paymentMethod !==
    PAYMENT_METHODS.CASH
  &&
  paymentMethod !==
    PAYMENT_METHODS.CREDIT
) {

  errors.push(
    'Las ventas nuevas solo pueden registrarse en efectivo o fiado.'
  );

}
  if (
    !isValidSalePrice(
      price
    )
  ) {

    errors.push(
      'El precio debe ser $2.00, $2.25 o $2.50.'
    );

  }



  const normalizedQuantities =
    normalizeSaleQuantities(
      quantities
    );


  const units =
    getSaleUnitsTotal(
      normalizedQuantities
    );


  const normalizedEmpty =
    normalizeEmptyReceived(
      emptyReceived
    );


  const totalEmptyReceived =
    getEmptyReceivedTotal(
      normalizedEmpty
    );


  if (
    totalEmptyReceived >
    units
  ) {

    errors.push(
      `No puedes recibir ${totalEmptyReceived} tanque(s) vacíos si solamente entregaste ${units} cilindro(s) llenos.`
    );

  }


  if (
    units <= 0
  ) {

    errors.push(
      'Debes seleccionar al menos un cilindro.'
    );

  }



  const stockValidation =
    validateSaleStock(
      normalizedQuantities
    );


  if (
    !stockValidation.valid
  ) {

    errors.push(
      ...stockValidation.errors
    );

  }



  const preview =
    calculateSalePreview({

      quantities:
        normalizedQuantities,

      emptyReceived:
        normalizedEmpty,

      price,

      paymentMethod,

      received,

      saleMode,

    });



  /*
    "Paga y retira después" significa realmente
    que la venta debe quedar PAGADA.

    Evitamos crear combinaciones ambiguas como:

    - debe dinero
    - debe tanques
    - y además tiene gas por retirar
  */

  if (
    saleMode ===
      SALE_MODES.LATER
  ) {

    if (
      paymentMethod ===
      PAYMENT_METHODS.CREDIT
    ) {

      errors.push(
        'La opción "Paga y retira después" no puede registrarse como fiado.'
      );

    }


    if (
      preview.moneyDue > 0
    ) {

      errors.push(
        'Para reservar gas y retirarlo después, la venta debe quedar pagada completamente.'
      );

    }


    if (
      preview.tanksDueTotal > 0
    ) {

      errors.push(
        'Para "Paga y retira después", deben quedar registrados todos los tanques vacíos correspondientes.'
      );

    }

  }



  /*
    Cualquier pendiente necesita identificación
    del cliente.
  */

  if (
    preview.status !==
      SALE_STATUS.COMPLETED &&
    !normalizeText(
      customer
    )
  ) {

    errors.push(
      'Debes escribir el nombre o referencia del cliente porque la venta deja un pendiente.'
    );

  }



  return {

    valid:
      errors.length === 0,

    errors,

    preview,

  };

}



/* =========================================================
   CREAR LÍNEAS DE VENTA
========================================================= */

function createSaleLines({

  saleId,

  dayId,

  quantities,

  price,

  financialPreview,

  createdAt,

}) {

  const lines = [];


  GAS_ID_LIST.forEach(
    gasId => {

      const quantity =
        toNonNegativeInteger(
          quantities[gasId]
        );


      if (
        quantity <= 0
      ) {

        return;

      }


      const financial =
        financialPreview
          .byGas[gasId];


      lines.push({

        id:
          uid('line'),

        saleId,

        dayId,

        gasId,

        quantity,

        qty:
          quantity,

        unitPrice:
          roundMoney(
            price
          ),

        revenue:
          roundMoney(
            financial.revenue
          ),

        replacementCost:
          roundMoney(
            financial
              .replacementCost
          ),

        reserveRequired:
          roundMoney(
            financial
              .reserveRequired
          ),

        /*
          Se actualiza después de financiar
          las bolsas.
        */

        reserveFunded: 0,

        grossProfit:
          roundMoney(
            financial
              .grossProfit
          ),

        createdAt,

      });

    }
  );


  return lines;

}



/* =========================================================
   CREAR PENDIENTE AUTOMÁTICO
========================================================= */

function createPendingAccount({

  sale,

  accountType,

  moneyDue,

  tanksDue,

  pickupDue,

  createdAt,

}) {

  if (!accountType) {

    return null;

  }


  const state =
    getState();


  const accountId =
    uid('account');


  const account = {

    id:
      accountId,

    saleId:
      sale.id,

    dayId:
      sale.dayId,

    customer:
      sale.customer,

    type:
      accountType,

    status:
      ACCOUNT_STATUS.OPEN,

    createdAt,

    closedAt:
      null,

    original: {

      moneyDue:
        roundMoney(
          moneyDue
        ),

      tanksDue:
        cloneData(
          tanksDue
        ),

      pickupDue:
        cloneData(
          pickupDue
        ),

    },

  };


  const balance =
    createAccountBalanceRecord(
      accountId
    );


  balance.moneyDue =
    roundMoney(
      moneyDue
    );


  balance.tanksDue =
    cloneData(
      tanksDue
    );


  balance.pickupDue =
    cloneData(
      pickupDue
    );


  state.accounts.push(
    account
  );


  state.accountBalances.push(
    balance
  );


  touchState();


  return {

    account,

    balance,

  };

}



/* =========================================================
   CREAR MOVIMIENTO DE VENTA
========================================================= */

function createSaleMovement(
  sale
) {

  const state =
    getState();


  const detailParts = [];


  if (
    sale.quantities[
      GAS_IDS.DURAGAS
    ] > 0
  ) {

    detailParts.push(
      `${
        sale.quantities[
          GAS_IDS.DURAGAS
        ]
      } Duragas`
    );

  }


  if (
    sale.quantities[
      GAS_IDS.KING_GAS
    ] > 0
  ) {

    detailParts.push(
      `${
        sale.quantities[
          GAS_IDS.KING_GAS
        ]
      } King Gas`
    );

  }


  const movement =
    createMovementBase({

      id:
        uid('mov'),

      dayId:
        sale.dayId,

      type:
        MOVEMENT_TYPES.SALE,

      createdAt:
        sale.createdAt,

      referenceId:
        sale.id,

      reference:
        sale.customer ||
        'Venta mostrador',

      detail:
        `Venta: ${
          detailParts.join(' + ')
        }`,

      value:
        sale.total,

      metadata: {

        saleId:
          sale.id,

        quantities:
          cloneData(
            sale.quantities
          ),

        emptyReceived:
          cloneData(
            sale.emptyReceived
          ),

        paymentMethod:
          sale.paymentMethod,

        paidNow:
          sale.paidNow,

        moneyDue:
          sale.moneyDue,

        change:
          sale.change,

        tanksDue:
          cloneData(
            sale.tanksDue
          ),

        pickupDue:
          cloneData(
            sale.pickupDue
          ),

        saleMode:
          sale.saleMode,

        status:
          sale.status,

        exchangeType:
          sale.exchange?.type ??
          null,

      },

    });


  state.movements.push(
    movement
  );


  touchState();


  return movement;

}



/* =========================================================
   ACTUALIZAR RESERVA FINANCIADA EN LÍNEAS
========================================================= */

function applyReserveFundingToLines({

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
          allocation[gasId] ??
          0
        );


      const gasLines =
        lines.filter(
          line =>
            line.gasId ===
            gasId
        );


      gasLines.forEach(
        line => {

          if (
            remaining <= 0
          ) {

            return;

          }


          const required =
            roundMoney(
              line.reserveRequired ??
              0
            );


          const already =
            roundMoney(
              line.reserveFunded ??
              0
            );


          const pending =
            roundMoney(
              Math.max(
                0,
                required -
                already
              )
            );


          const amount =
            roundMoney(
              Math.min(
                pending,
                remaining
              )
            );


          line.reserveFunded =
            roundMoney(
              already +
              amount
            );


          remaining =
            roundMoney(
              remaining -
              amount
            );

        }
      );

    }
  );


  touchState();

}



/* =========================================================
   REGISTRAR VENTA
========================================================= */

export function registerSale({

  customer = '',

  quantities = {},

  emptyReceived = {},

  price = 2.25,

  paymentMethod =
    PAYMENT_METHODS.CASH,

  received = 0,

  saleMode =
    SALE_MODES.NOW,

  note = '',

  createdAt =
    nowIso(),

}) {

  /*
    Guardamos una copia de TODO el estado.

    Una venta toca:
    - inventario
    - ventas
    - líneas
    - bolsas
    - pendientes
    - movimientos

    Si cualquiera de esos pasos falla,
    restauramos todo.
  */

  const stateBefore =
    cloneData(
      getState()
    );


  try {

    const validation =
      validateSale({

        customer,

        quantities,

        emptyReceived,

        price,

        paymentMethod,

        received,

        saleMode,

      });


    if (
      !validation.valid
    ) {

      throw new Error(
        validation.errors.join(' ')
      );

    }


    const preview =
      validation.preview;


    const day =
      getActiveDay();


    if (!day) {

      throw new Error(
        'No existe una jornada abierta.'
      );

    }



    const saleId =
      uid('sale');



    /* =====================================================
       1. MODIFICAR INVENTARIO
    ===================================================== */

    const inventoryResult =
      applySaleInventory({

        quantities:
          preview.quantities,

        emptyReceived:
          preview.emptyReceived,

        saleMode,

      });



    /* =====================================================
       2. CREAR VENTA
    ===================================================== */

    const sale = {

      id:
        saleId,

      dayId:
        day.id,

      createdAt,

      customer:
        normalizeText(
          customer
        ),

      saleMode,

      quantities:
        cloneData(
          preview.quantities
        ),

      emptyReceived:
        cloneData(
          preview.emptyReceived
        ),

      totalUnits:
        preview.totalUnits,

      unitPrice:
        roundMoney(
          price
        ),

      price:
        roundMoney(
          price
        ),

      total:
        roundMoney(
          preview.total
        ),

      paymentMethod,

      /*
        "received" conserva cuánto entregó
        físicamente el cliente.

        Ejemplo:
        total = $4.50
        recibió = $5.00
      */

      received:
        roundMoney(
          preview.received
        ),

      /*
        paidNow no incluye el vuelto.
      */

      paidNow:
        roundMoney(
          preview.paidNow
        ),

      change:
        roundMoney(
          preview.change
        ),

      moneyDue:
        roundMoney(
          preview.moneyDue
        ),

      tanksDue:
        cloneData(
          preview.tanksDue
        ),

      pickupDue:
        cloneData(
          preview.pickupDue
        ),

      status:
        preview.status,

      accountType:
        preview.accountType,

      exchange:
        cloneData(
          preview.exchange
        ),

      reserveRequired: {

        [GAS_IDS.DURAGAS]:
          roundMoney(
            preview
              .byGas[
                GAS_IDS.DURAGAS
              ]
              .reserveRequired
          ),

        [GAS_IDS.KING_GAS]:
          roundMoney(
            preview
              .byGas[
                GAS_IDS.KING_GAS
              ]
              .reserveRequired
          ),

      },

      reserveFunded:
        emptyGasMap(),

      grossProfit: {

        [GAS_IDS.DURAGAS]:
          roundMoney(
            preview
              .byGas[
                GAS_IDS.DURAGAS
              ]
              .grossProfit
          ),

        [GAS_IDS.KING_GAS]:
          roundMoney(
            preview
              .byGas[
                GAS_IDS.KING_GAS
              ]
              .grossProfit
          ),

        total:
          roundMoney(
            preview.grossProfit
          ),

      },

      /*
        Esta cantidad refleja dinero cobrado
        que quedó libre después de financiar
        primero el costo de reposición.
      */

      realizedProfitFromCollection: 0,

      note:
        normalizeText(
          note
        ),

      inventoryBefore:
        cloneData(
          inventoryResult.before
        ),

      inventoryAfter:
        cloneData(
          inventoryResult.after
        ),

    };


    getState()
      .sales
      .push(
        sale
      );



    /* =====================================================
       3. CREAR LÍNEAS
    ===================================================== */

    const lines =
      createSaleLines({

        saleId:

          sale.id,

        dayId:
          day.id,

        quantities:
          preview.quantities,

        price,

        financialPreview:
          preview,

        createdAt,

      });


    getState()
      .saleLines
      .push(
        ...lines
      );



    /* =====================================================
       4. FINANCIAR BOLSAS CON DINERO REALMENTE COBRADO
    ===================================================== */

    const funding =
      fundSaleReplacementReserve({

        saleId:
          sale.id,

        dayId:
          day.id,

        quantities:
          preview.quantities,

        price,

        amountCollected:
          preview.paidNow,

        paymentMethod,

        alreadyFunded:
          sale.reserveFunded,

        createdAt,

      });


    sale.reserveFunded =
      cloneData(
        funding.allocation
      );


    sale.realizedProfitFromCollection =
      roundMoney(
        funding
          .availableProfitFromCollection
      );


    applyReserveFundingToLines({

      saleId:
        sale.id,

      allocation:
        funding.allocation,

    });



    /* =====================================================
       5. CREAR PENDIENTE AUTOMÁTICO
    ===================================================== */

    const pending =
      createPendingAccount({

        sale,

        accountType:
          preview.accountType,

        moneyDue:
          preview.moneyDue,

        tanksDue:
          preview.tanksDue,

        pickupDue:
          preview.pickupDue,

        createdAt,

      });


    sale.accountId =
      pending?.account?.id ??
      null;



    /* =====================================================
       6. MOVIMIENTO GENERAL
    ===================================================== */

    const movement =
      createSaleMovement(
        sale
      );


    sale.movementId =
      movement.id;



    /* =====================================================
       7. RECORDAR PRECIO
    ===================================================== */

    getState().ui.lastPrice =
      roundMoney(
        price
      );


    touchState();



    /* =====================================================
       8. GUARDAR
    ===================================================== */

    saveState();



    return {

      sale:
        cloneData(
          sale
        ),

      lines:
        cloneData(
          lines
        ),

      account:
        pending
          ? cloneData(
              pending
            )
          : null,

      funding:
        cloneData(
          funding
        ),

      inventory:
        cloneData(
          inventoryResult
        ),

      preview:
        cloneData(
          preview
        ),

    };

  }
  catch (error) {

    /*
      OPERACIÓN ATÓMICA

      Si algo falló después de mover inventario
      o dinero, volvemos exactamente al estado
      previo a la venta.
    */

    replaceState(
      stateBefore
    );


    try {

      saveState();

    }
    catch {

      /*
        Si localStorage también falla,
        mantenemos al menos la restauración
        en memoria.
      */

    }


    throw error;

  }

}



/* =========================================================
   OBTENER VENTA COMPLETA
========================================================= */

export function getSaleDetail(
  saleId
) {

  const sale =
    getSaleById(
      saleId
    );


  if (!sale) {

    return null;

  }


  return {

    sale:
      cloneData(
        sale
      ),

    lines:
      cloneData(
        getSaleLines(
          saleId
        )
      ),

  };

}



/* =========================================================
   VENTAS DEL DÍA
========================================================= */

export function getSalesByDay(
  dayId =
    getActiveDay()?.id
) {

  if (!dayId) {

    return [];

  }


  return getState()
    .sales
    .filter(
      sale =>
        sale.dayId ===
        dayId
    );

}



/* =========================================================
   VENTAS DEL DÍA ACTUAL
========================================================= */

export function getCurrentDaySales() {

  return getSalesByDay(
    getActiveDay()?.id
  );

}



/* =========================================================
   CLIENTES CONOCIDOS
========================================================= */

export function getKnownCustomers() {

  const names =
    getState()
      .sales
      .map(
        sale =>
          normalizeText(
            sale.customer
          )
      )
      .filter(Boolean);


  return [

    ...new Set(
      names
    ),

  ].sort(
    (
      first,
      second
    ) =>
      first.localeCompare(
        second,
        'es'
      )
  );

}



/* =========================================================
   DESCRIPCIÓN CORTA DE PRODUCTOS
========================================================= */

export function describeSaleProducts(
  sale
) {

  if (!sale) {

    return 'Sin productos';

  }


  const quantities =
    normalizeSaleQuantities(

      sale.quantities ?? {

        [GAS_IDS.DURAGAS]:
          0,

        [GAS_IDS.KING_GAS]:
          0,

      }

    );


  const parts = [];


  if (
    quantities[
      GAS_IDS.DURAGAS
    ] > 0
  ) {

    parts.push(
      `${
        quantities[
          GAS_IDS.DURAGAS
        ]
      } Duragas`
    );

  }


  if (
    quantities[
      GAS_IDS.KING_GAS
    ] > 0
  ) {

    parts.push(
      `${
        quantities[
          GAS_IDS.KING_GAS
        ]
      } King Gas`
    );

  }


  return (
    parts.join(' + ') ||
    'Sin productos'
  );

}



/* =========================================================
   DESCRIPCIÓN DE VACÍOS
========================================================= */

export function describeSaleEmpties(
  sale
) {

  const empties =
    normalizeEmptyReceived(
      sale?.emptyReceived
    );


  const parts = [];


  if (
    empties[
      GAS_IDS.DURAGAS
    ] > 0
  ) {

    parts.push(
      `${
        empties[
          GAS_IDS.DURAGAS
        ]
      } Duragas`
    );

  }


  if (
    empties[
      GAS_IDS.KING_GAS
    ] > 0
  ) {

    parts.push(
      `${
        empties[
          GAS_IDS.KING_GAS
        ]
      } King Gas`
    );

  }


  return (
    parts.join(' + ') ||
    'Ninguno'
  );

}



/* =========================================================
   SABER SI UNA VENTA TIENE PENDIENTE
========================================================= */

export function saleHasPending(
  sale
) {

  if (!sale) {

    return false;

  }


  return (
    sale.status !==
    SALE_STATUS.COMPLETED
  );

}



/* =========================================================
   RESUMEN SIMPLE DE VENTA
========================================================= */

export function getSaleSummary(
  saleId
) {

  const sale =
    getSaleById(
      saleId
    );


  if (!sale) {

    return null;

  }


  return {

    id:
      sale.id,

    customer:
      sale.customer ||
      'Venta mostrador',

    products:
      describeSaleProducts(
        sale
      ),

    empties:
      describeSaleEmpties(
        sale
      ),

    total:
      roundMoney(
        sale.total
      ),

    paidNow:
      roundMoney(
        sale.paidNow
      ),

    moneyDue:
      roundMoney(
        sale.moneyDue
      ),

    paymentMethod:
      sale.paymentMethod,

    status:
      sale.status,

    statusLabel:
      SALE_STATUS_LABELS[
        sale.status
      ] ??
      sale.status,

    createdAt:
      sale.createdAt,

  };

}
