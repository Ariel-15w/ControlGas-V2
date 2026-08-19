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
       REPOSICIONES
    ===================================================== */

    replenishments: [],



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


    replenishments:
      ensureArray(
        source.replenishments
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


    opening: {

      inventory:
        cloneData(
          openingInventory
        ),

      wallets:
        cloneData(
          openingWallets
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