/* =========================================================
   CONTROLGAS
   ESTADO CENTRAL DE LA APLICACIÓN

   Aquí se define la estructura general de datos.

   IMPORTANTE:
   - Este archivo NO guarda directamente en localStorage.
   - storage.js será quien cargue y guarde.
   - Los demás módulos trabajan sobre este estado.
========================================================= */
import {
  APP_CONFIG,
  DEFAULTS,
  DAY_STATUS,
  GAS_IDS,
  ROUTE_SELLER_CONFIG,
} from './config.js';

import {
  cloneData,
  ensureArray,
  ensureObject,
  nowIso,
  roundMoney,
  toNonNegativeInteger,
  toNonNegativeNumber,
} from './utils.js';



/* =========================================================
   INVENTARIO VACÍO
========================================================= */

export function createEmptyGasInventory() {

  return {

    full: 0,

    empty: 0,

    reserved: 0,

    loaned: 0,

    /*
      Cilindros que están físicamente
      con el vendedor de $2.

      Todavía NO son ventas.
    */
    route: 0,

    /*
      Cilindros apartados para el vendedor
      pero que todavía siguen en bodega.
    */
    routeReserved: 0,

  };

}


export function createEmptyInventory() {

  return {

    [GAS_IDS.DURAGAS]:
      createEmptyGasInventory(),

    [GAS_IDS.KING_GAS]:
      createEmptyGasInventory(),

  };

}



/* =========================================================
   BOLSAS DE REPOSICIÓN
========================================================= */

export function createEmptyWallets() {

  return {

    [GAS_IDS.DURAGAS]: 0,

    [GAS_IDS.KING_GAS]: 0,

  };

}



/* =========================================================
   TANQUES POR MARCA
========================================================= */

export function createEmptyGasQuantities() {

  return {

    [GAS_IDS.DURAGAS]: 0,

    [GAS_IDS.KING_GAS]: 0,

  };

}



/* =========================================================
   ESTADO INICIAL
========================================================= */

export function createInitialState() {

  const createdAt =
    nowIso();


  return {

    /* =====================================================
       METADATOS
    ===================================================== */

    meta: {

      schemaVersion:
        APP_CONFIG.schemaVersion,

      appVersion:
        APP_CONFIG.version,

      createdAt,

      updatedAt:
        createdAt,

    },



    /* =====================================================
       DÍA ACTIVO
    ===================================================== */

    activeDayId: null,



    /* =====================================================
       INVENTARIO ACTUAL

       Este es el estado operativo actual.

       inventory.js será responsable de modificarlo
       de forma controlada.
    ===================================================== */

    inventory:
      createEmptyInventory(),



    /* =====================================================
       BOLSAS ACTUALES DE REPOSICIÓN

       Ejemplo:

       wallets.duragas = 170
       wallets.kinggas = 148
    ===================================================== */

    wallets:
      createEmptyWallets(),

/*
  Bolsa única del método práctico.

  En este método se apartan $1.70
  por cada cilindro vendido,
  sin importar si es Duragas o King Gas.
*/
generalWallet: 0,
    /* =====================================================
       JORNADAS
    ===================================================== */

    days: [],



    /* =====================================================
       VENTAS

       sales:
       cabecera general de cada venta.

       saleLines:
       productos vendidos dentro de la venta.
    ===================================================== */

    sales: [],

    saleLines: [],



    /* =====================================================
       PENDIENTES
    ===================================================== */

    accounts: [],

    accountBalances: [],

/* =====================================================
   VENDEDOR DE $2
===================================================== */

routeAccounts: [],

routeTrips: [],

routeReservations: [],

    /* =====================================================
       REPOSICIONES
    ===================================================== */

    replenishments: [],

/*
  Pagos y obligaciones generadas
  por las reposiciones.

  Ejemplos:
  - Duragas $0.55 pagado al llegar.
  - Duragas $1.15 pendiente de factura.
  - King Gas $1.48 pagado completo.
*/
supplierPayments: [],

    /* =====================================================
       MOVIMIENTOS DE LAS BOLSAS

       Permite saber exactamente de dónde entró
       o salió el dinero reservado.
    ===================================================== */

    walletMovements: [],



    /* =====================================================
       GASTOS
    ===================================================== */

    expenses: [],



    /* =====================================================
       AJUSTES DE INVENTARIO
    ===================================================== */

    adjustments: [],



    /* =====================================================
       PRÉSTAMOS / DEVOLUCIONES DE CILINDROS
    ===================================================== */

    loans: [],



    /* =====================================================
       MOVIMIENTOS GENERALES

       Es la bitácora principal del sistema.
    ===================================================== */

    movements: [],



    /* =====================================================
       CIERRES
    ===================================================== */

    closings: [],



    /* =====================================================
       DATOS DE INTERFAZ
    ===================================================== */

    ui: {

      lastPrice:
        DEFAULTS.salePrice,

      activeView:
        'dashboard',

      historyMode:
        'days',

    },

  };

}



/* =========================================================
   ESTADO PRIVADO ACTUAL
========================================================= */

let state =
  createInitialState();

/* =========================================================
   OBTENER ESTADO
========================================================= */

/*
  Devuelve el objeto actual.

  Los módulos internos pueden trabajar con esta referencia.
*/

export function getState() {

  return state;

}



/*
  Devuelve una copia.

  Útil para exportaciones y respaldos.
*/

export function getStateSnapshot() {

  return cloneData(state);

}



/* =========================================================
   REEMPLAZAR ESTADO
========================================================= */

/*
  storage.js utilizará esta función después
  de cargar o importar datos.
*/

export function replaceState(
  newState
) {

  state =
    normalizeStateShape(
      newState
    );


  touchState();


  return state;

}



/* =========================================================
   REINICIAR ESTADO
========================================================= */

export function resetState() {

  state =
    createInitialState();


  return state;

}



/* =========================================================
   FECHA DE MODIFICACIÓN
========================================================= */

export function touchState() {

  if (!state.meta) {

    state.meta = {};

  }


  state.meta.schemaVersion =
    APP_CONFIG.schemaVersion;


  state.meta.appVersion =
    APP_CONFIG.version;


  state.meta.updatedAt =
    nowIso();


  if (!state.meta.createdAt) {

    state.meta.createdAt =
      state.meta.updatedAt;

  }

}



/* =========================================================
   DÍA ACTIVO
========================================================= */

export function getActiveDay() {

  if (!state.activeDayId) {

    return null;

  }


  return (
    state.days.find(
      day =>
        day.id ===
        state.activeDayId
    ) ?? null
  );

}



export function hasActiveDay() {

  const day =
    getActiveDay();


  return Boolean(
    day &&
    day.status ===
      DAY_STATUS.OPEN
  );

}



export function setActiveDayId(
  dayId
) {

  state.activeDayId =
    dayId || null;


  touchState();

}



/* =========================================================
   BUSCAR DÍA
========================================================= */

export function getDayById(
  dayId
) {

  if (!dayId) {

    return null;

  }


  return (
    state.days.find(
      day =>
        day.id ===
        dayId
    ) ?? null
  );

}



/* =========================================================
   BUSCAR VENTA
========================================================= */

export function getSaleById(
  saleId
) {

  if (!saleId) {

    return null;

  }


  return (
    state.sales.find(
      sale =>
        sale.id ===
        saleId
    ) ?? null
  );

}



/* =========================================================
   LÍNEAS DE UNA VENTA
========================================================= */

export function getSaleLines(
  saleId
) {

  return state.saleLines.filter(
    line =>
      line.saleId ===
      saleId
  );

}



/* =========================================================
   CUENTA PENDIENTE
========================================================= */

export function getAccountById(
  accountId
) {

  if (!accountId) {

    return null;

  }


  return (
    state.accounts.find(
      account =>
        account.id ===
        accountId
    ) ?? null
  );

}



/* =========================================================
   BALANCE DE UNA CUENTA
========================================================= */

export function getAccountBalance(
  accountId
) {

  if (!accountId) {

    return null;

  }


  return (
    state.accountBalances.find(
      balance =>
        balance.accountId ===
        accountId
    ) ?? null
  );

}



/* =========================================================
   CUENTA DE UNA VENTA
========================================================= */

export function getAccountBySaleId(
  saleId
) {

  if (!saleId) {

    return null;

  }


  return (
    state.accounts.find(
      account =>
        account.saleId ===
        saleId
    ) ?? null
  );

}

/* =========================================================
   CUENTAS DEL VENDEDOR DE $2
========================================================= */

export function getRouteAccountById(
  accountId
) {

  if (!accountId) {

    return null;

  }


  return (
    state.routeAccounts.find(
      account =>
        account.id ===
        accountId
    ) ?? null
  );

}


/* =========================================================
   VIAJES DEL VENDEDOR DE $2
========================================================= */

export function getRouteTripById(
  tripId
) {

  if (!tripId) {

    return null;

  }


  return (
    state.routeTrips.find(
      trip =>
        trip.id ===
        tripId
    ) ?? null
  );

}


export function getRouteTripsByAccountId(
  accountId
) {

  if (!accountId) {

    return [];

  }


  return state.routeTrips.filter(
    trip =>
      trip.accountId ===
      accountId
  );

}


/* =========================================================
   APARTADOS DEL VENDEDOR DE $2
========================================================= */

export function getRouteReservationsByAccountId(
  accountId
) {

  if (!accountId) {

    return [];

  }


  return state.routeReservations.filter(
    reservation =>
      reservation.accountId ===
      accountId
  );

}

/* =========================================================
   REPOSICIÓN
========================================================= */

export function getReplenishmentById(
  replenishmentId
) {

  return (
    state.replenishments.find(
      item =>
        item.id ===
        replenishmentId
    ) ?? null
  );

}

/* =========================================================
   PAGOS / OBLIGACIONES DEL PROVEEDOR
========================================================= */

export function getSupplierPaymentById(
  paymentId
) {

  if (!paymentId) {

    return null;

  }


  return (
    state.supplierPayments.find(
      payment =>
        payment.id ===
        paymentId
    ) ?? null
  );

}


/*
  Permite obtener todos los pagos
  pertenecientes a una reposición.

  Una reposición Duragas podrá tener:

  1. pago de llegada $0.55;
  2. factura $1.15 pendiente o pagada.
*/
export function getSupplierPaymentsByReplenishmentId(
  replenishmentId
) {

  if (!replenishmentId) {

    return [];

  }


  return state.supplierPayments.filter(
    payment =>
      payment.replenishmentId ===
      replenishmentId
  );

}

/* =========================================================
   CIERRE
========================================================= */

export function getClosingById(
  closingId
) {

  return (
    state.closings.find(
      closing =>
        closing.id ===
        closingId
    ) ?? null
  );

}



/* =========================================================
   INVENTARIO DE UNA MARCA
========================================================= */

export function getGasInventory(
  gasId
) {

  return (
    state.inventory[gasId] ??
    null
  );

}



/* =========================================================
   BOLSA DE UNA MARCA
========================================================= */

export function getWalletBalance(
  gasId
) {

  return roundMoney(
    state.wallets[gasId] ?? 0
  );

}

/* =========================================================
   BOLSA GENERAL PRÁCTICA
========================================================= */

export function getGeneralWalletBalance() {

  return roundMoney(
    state.generalWallet ?? 0
  );

}

/* =========================================================
   NORMALIZAR INVENTARIO
========================================================= */
function normalizeGasInventory(
  value
) {

  const source =
    ensureObject(value);


  return {

    full:
      toNonNegativeInteger(
        source.full
      ),

    empty:
      toNonNegativeInteger(
        source.empty
      ),

    reserved:
      toNonNegativeInteger(
        source.reserved
      ),

    loaned:
      toNonNegativeInteger(
        source.loaned
      ),

    route:
      toNonNegativeInteger(
        source.route
      ),

    routeReserved:
      toNonNegativeInteger(
        source.routeReserved
      ),

  };

}

function normalizeInventory(
  value
) {

  const source =
    ensureObject(value);


  return {

    [GAS_IDS.DURAGAS]:
      normalizeGasInventory(
        source[
          GAS_IDS.DURAGAS
        ]
      ),

    [GAS_IDS.KING_GAS]:
      normalizeGasInventory(
        source[
          GAS_IDS.KING_GAS
        ]
      ),

  };

}

/* =========================================================
   NORMALIZAR BOLSA GENERAL
========================================================= */

function normalizeGeneralWallet(
  value
) {

  return roundMoney(
    toNonNegativeNumber(
      value
    )
  );

}
/* =========================================================
   NORMALIZAR BOLSAS
========================================================= */

function normalizeWallets(
  value
) {

  const source =
    ensureObject(value);


  return {

    [GAS_IDS.DURAGAS]:
      roundMoney(
        toNonNegativeNumber(
          source[
            GAS_IDS.DURAGAS
          ]
        )
      ),

    [GAS_IDS.KING_GAS]:
      roundMoney(
        toNonNegativeNumber(
          source[
            GAS_IDS.KING_GAS
          ]
        )
      ),

  };

}



/* =========================================================
   NORMALIZAR INTERFAZ
========================================================= */

function normalizeUi(
  value
) {

  const source =
    ensureObject(value);


  return {

    lastPrice:
      Number(
        source.lastPrice ??
        DEFAULTS.salePrice
      ),

    activeView:
      String(
        source.activeView ??
        'dashboard'
      ),

    historyMode:
      String(
        source.historyMode ??
        'days'
      ),

  };

}



/* =========================================================
   NORMALIZAR ESTADO COMPLETO
========================================================= */

/*
  Esta función es muy importante.

  Si algún respaldo viejo no contiene una propiedad nueva,
  la agrega automáticamente con su valor predeterminado.

  Así evitamos errores como:

  Cannot read properties of undefined
*/

export function normalizeStateShape(
  rawState
) {

  const source =
    ensureObject(rawState);


  const meta =
    ensureObject(
      source.meta
    );


  const normalized = {

    meta: {

      schemaVersion:
        APP_CONFIG.schemaVersion,

      appVersion:
        APP_CONFIG.version,

      createdAt:
        meta.createdAt ??
        nowIso(),

      updatedAt:
        meta.updatedAt ??
        nowIso(),

    },


    activeDayId:
      source.activeDayId ??
      null,


    inventory:
      normalizeInventory(
        source.inventory
      ),


    wallets:
      normalizeWallets(
        source.wallets
      ),
     
generalWallet:
  normalizeGeneralWallet(
    source.generalWallet
  ),

     days:
      ensureArray(
        source.days
      ),


    sales:
      ensureArray(
        source.sales
      ),


    saleLines:
      ensureArray(
        source.saleLines
      ),


    accounts:
      ensureArray(
        source.accounts
      ),


    accountBalances:
      ensureArray(
        source.accountBalances
      ),
routeAccounts:
  ensureArray(
    source.routeAccounts
  ),


routeTrips:
  ensureArray(
    source.routeTrips
  ),


routeReservations:
  ensureArray(
    source.routeReservations
  ),

    replenishments:
      ensureArray(
        source.replenishments
      ),
     
supplierPayments:
  ensureArray(
    source.supplierPayments
  ),

    walletMovements:
      ensureArray(
        source.walletMovements
      ),


    expenses:
      ensureArray(
        source.expenses
      ),


    adjustments:
      ensureArray(
        source.adjustments
      ),


    loans:
      ensureArray(
        source.loans
      ),


    movements:
      ensureArray(
        source.movements
      ),


    closings:
      ensureArray(
        source.closings
      ),


    ui:
      normalizeUi(
        source.ui
      ),

  };


  /*
    Si activeDayId apunta a un día inexistente,
    se elimina para evitar un estado inválido.
  */

  if (
    normalized.activeDayId &&
    !normalized.days.some(
      day =>
        day.id ===
        normalized.activeDayId
    )
  ) {

    normalized.activeDayId =
      null;

  }


  return normalized;

}



/* =========================================================
   ESTRUCTURA DE UN DÍA

   Estas funciones no guardan nada.
   Solo crean objetos consistentes.
========================================================= */

export function createDayRecord({

  id,

  dateKey,

  openedAt,

  openingInventory,

  openingWallets,

  /*
    Saldo que tenía la Bolsa General
    al comenzar la jornada.
  */
  openingGeneralWallet = 0,

  /*
    Método financiero utilizado durante
    toda esta jornada.

    exact   = cálculo real por marca
    general = una sola bolsa a $1.70
              por cilindro vendido
  */
  financialMode =
    DEFAULTS.financialMode,

  openingCashFund = 0,

  note = '',

}) {
  return {

    id,

    dateKey,

    status:
      DAY_STATUS.OPEN,

    openedAt,

    closedAt:
      null,
financialMode,

    opening: {

      inventory:
        cloneData(
          openingInventory
        ),

      wallets:
        cloneData(
          openingWallets
        ),
generalWallet:
  roundMoney(
    toNonNegativeNumber(
      openingGeneralWallet
    )
  ),
      cashFund:
        roundMoney(
          openingCashFund
        ),

      note:
        String(note ?? ''),

    },


    closingId:
      null,

  };

}



/* =========================================================
   ESTRUCTURA BASE DE CUENTA PENDIENTE
========================================================= */

export function createAccountBalanceRecord(
  accountId
) {

  return {

    accountId,

    moneyDue: 0,

    tanksDue:
      createEmptyGasQuantities(),

    pickupDue:
      createEmptyGasQuantities(),

  };

}

/* =========================================================
   ESTRUCTURA BASE DE CUENTA DEL VENDEDOR DE $2
========================================================= */

export function createRouteAccountRecord({

  id,

  name = '',

  reference = '',

  createdAt,

}) {

  return {

    id,

    name:
      String(
        name ?? ''
      ).trim(),

    reference:
      String(
        reference ?? ''
      ).trim(),

    active: true,

    createdAt,

    updatedAt:
      createdAt,

  };

}
/* =========================================================
   ESTRUCTURA DE VIAJE DEL VENDEDOR DE $2
========================================================= */

export function createRouteTripRecord({

  id,

  accountId,

  dayId,

  createdAt,

  dispatched = {},

  note = '',

}) {

  const quantities =
    ensureObject(
      dispatched
    );


  return {

    id,

    accountId,

    dayId,

    /*
      El vendedor vende cualquier marca
      a $2.00 por cilindro.
    */
    unitPrice:
      ROUTE_SELLER_CONFIG.unitPrice,


    /*
      Cilindros que salieron originalmente
      de la bodega con el vendedor.
    */
    dispatched: {

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

    },


    /*
      Aquí se registrarán las veces
      que el vendedor regrese a rendir.
    */
    settlements: [],


    createdAt,

    closedAt:
      null,

    active:
      true,

    note:
      String(
        note ?? ''
      ).trim(),

  };

}

/* =========================================================
   RENDICIÓN DE UN VIAJE DEL VENDEDOR DE $2
========================================================= */

export function createRouteSettlementRecord({

  id,

  tripId,

  dayId,

  createdAt,

  sold = {},

  returnedFull = {},

  emptiesReceived = {},

  moneyPaid = 0,

  note = '',

}) {

  const soldSource =
    ensureObject(
      sold
    );


  const returnedSource =
    ensureObject(
      returnedFull
    );


  const emptySource =
    ensureObject(
      emptiesReceived
    );


  const soldQuantities = {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        soldSource[
          GAS_IDS.DURAGAS
        ]
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        soldSource[
          GAS_IDS.KING_GAS
        ]
      ),

  };


  const returnedQuantities = {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        returnedSource[
          GAS_IDS.DURAGAS
        ]
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        returnedSource[
          GAS_IDS.KING_GAS
        ]
      ),

  };


  const emptyQuantities = {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        emptySource[
          GAS_IDS.DURAGAS
        ]
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        emptySource[
          GAS_IDS.KING_GAS
        ]
      ),

  };


  const totalSold =
    soldQuantities[
      GAS_IDS.DURAGAS
    ] +
    soldQuantities[
      GAS_IDS.KING_GAS
    ];


  const expectedMoney =
    roundMoney(
      totalSold *
      ROUTE_SELLER_CONFIG.unitPrice
    );


  return {

    id,

    tripId,

    dayId,

    sold:
      soldQuantities,

    /*
      Cilindros llenos que no vendió
      y que físicamente regresaron
      a la bodega.
    */
    returnedFull:
      returnedQuantities,

    /*
      Vacíos que realmente entregó.
      Pueden ser de cualquiera de las
      dos marcas.
    */
    emptiesReceived:
      emptyQuantities,

    totalSold,

    expectedMoney,

    /*
      Dinero que realmente entregó.

      Si entrega menos que expectedMoney,
      después quedará saldo pendiente
      solamente de esta cuenta.
    */
    moneyPaid:
      roundMoney(
        toNonNegativeNumber(
          moneyPaid
        )
      ),

    createdAt,

    note:
      String(
        note ?? ''
      ).trim(),

  };

}
/* =========================================================
   APARTADO PARA VENDEDOR DE $2
========================================================= */

export function createRouteReservationRecord({

  id,

  accountId,

  dayId,

  createdAt,

  quantities = {},

  note = '',

}) {

  const source =
    ensureObject(
      quantities
    );


  const reservedQuantities = {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        source[
          GAS_IDS.DURAGAS
        ]
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        source[
          GAS_IDS.KING_GAS
        ]
      ),

  };


  return {

    id,

    accountId,

    dayId,

    /*
      Cantidad originalmente apartada
      para este vendedor.
    */
    quantities:
      cloneData(
        reservedQuantities
      ),

    /*
      Cantidad que todavía sigue
      apartada y falta retirar.

      Permite retirar solo una parte
      sin perder el resto del apartado.
    */
    remaining:
      cloneData(
        reservedQuantities
      ),

    createdAt,

    completedAt:
      null,

    active:
      true,

    note:
      String(
        note ?? ''
      ).trim(),

  };

}
/* =========================================================
   ESTRUCTURA DE PAGO / OBLIGACIÓN DEL PROVEEDOR
========================================================= */

export function createSupplierPaymentRecord({

  id,

  replenishmentId,

  dayId,

  gasId,

  type,

  status,

  quantity = 0,

  unitCost = 0,

  amount = 0,

  createdAt,

  paidAt = null,

  note = '',

}) {

  return {

    id,

    replenishmentId,

    dayId,

    gasId,

    /*
      Ejemplos:
      duragas_arrival
      duragas_invoice
      kinggas_total
      extra_cylinders
    */
    type,

    /*
      pending / paid
    */
    status,

    quantity:
      toNonNegativeInteger(
        quantity
      ),

    unitCost:
      roundMoney(
        toNonNegativeNumber(
          unitCost
        )
      ),

    amount:
      roundMoney(
        toNonNegativeNumber(
          amount
        )
      ),

    createdAt,

    paidAt,

    note:
      String(
        note ?? ''
      ).trim(),

  };

}

/* =========================================================
   ESTRUCTURA BASE DE MOVIMIENTO
========================================================= */

export function createMovementBase({

  id,

  dayId,

  type,

  createdAt,

  gasId = null,

  referenceId = null,

  reference = '',

  detail = '',

  value = 0,

  metadata = {},

}) {

  return {

    id,

    dayId,

    type,

    createdAt,

    gasId,

    referenceId,

    reference:
      String(
        reference ?? ''
      ),

    detail:
      String(
        detail ?? ''
      ),

    value:
      roundMoney(value),

    metadata:
      ensureObject(metadata),

  };

}


/* =========================================================
   VALIDACIÓN BÁSICA DEL ESTADO
========================================================= */

/*
  Más adelante storage.js puede ejecutar esta función
  después de cargar datos.

  Devuelve una lista de problemas encontrados.
*/

export function auditState() {

  const problems = [];


  if (
    !state.meta ||
    state.meta.schemaVersion !==
      APP_CONFIG.schemaVersion
  ) {

    problems.push(
      'La versión del esquema no coincide.'
    );

  }


  if (
    !state.inventory[
      GAS_IDS.DURAGAS
    ]
  ) {

    problems.push(
      'Falta el inventario de Duragas.'
    );

  }


  if (
    !state.inventory[
      GAS_IDS.KING_GAS
    ]
  ) {

    problems.push(
      'Falta el inventario de King Gas.'
    );

  }


  if (
    state.wallets[
      GAS_IDS.DURAGAS
    ] < 0
  ) {

    problems.push(
      'La bolsa Duragas tiene saldo negativo.'
    );

  }


  if (
    state.wallets[
      GAS_IDS.KING_GAS
    ] < 0
  ) {

    problems.push(
      'La bolsa King Gas tiene saldo negativo.'
    );

  }


  if (
    state.activeDayId &&
    !getActiveDay()
  ) {

    problems.push(
      'El día activo no existe.'
    );

  }


  return problems;

}
