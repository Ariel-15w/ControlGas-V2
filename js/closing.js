/* =========================================================
   CONTROLGAS
   CIERRE DIARIO

   Responsabilidades:
   - Preparar valores esperados para el cierre
   - Comparar caja esperada vs caja contada
   - Comparar inventario esperado vs contado
   - Mantener prestados identificados
   - Guardar pendientes existentes al cierre
   - Guardar bolsas Duragas / King Gas
   - Guardar ganancias del día
   - Guardar reposiciones del día
   - Cerrar definitivamente la jornada
   - NO borrar las bolsas
   - NO borrar inventario
   - NO borrar pendientes

   IMPORTANTE:

   El cierre es una fotografía/auditoría del día.

   Si existen diferencias físicas:
   - se registran
   - quedan visibles en el historial

   NO modificamos automáticamente el inventario lógico
   para "hacerlo cuadrar".

   Si realmente hay que corregir inventario,
   debe hacerse mediante AJUSTES para dejar trazabilidad.
========================================================= */

import {
  DAY_STATUS,
  GAS_IDS,
  GAS_ID_LIST,
  GAS_TYPES,
  INVENTORY_BUCKETS,
  MOVEMENT_TYPES,
} from './config.js';


import {
  getState,
  getActiveDay,
  getDayById,
  createMovementBase,
  replaceState,
  touchState,
} from './state.js';


import {
  getInventorySnapshot,
  getInventoryQuantity,
  calculateInventoryDifference,
  getPhysicalInventoryTotal,
  getLoanedInventoryTotal,
  getControlledInventoryTotal,
} from './inventory.js';


import {
  getDayFinanceSummary,
  getWalletSummary,
} from './finance.js';


import {
  getAccountsSummary,
} from './accounts.js';


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
   NOMBRE DE MARCA
========================================================= */

function getGasName(
  gasId
) {

  return (
    GAS_TYPES[gasId]?.name ??
    gasId
  );

}



/* =========================================================
   DÍA ACTIVO OBLIGATORIO
========================================================= */

function requireActiveDay() {

  const day =
    getActiveDay();


  if (!day) {

    throw new Error(
      'No existe una jornada abierta para cerrar.'
    );

  }


  if (
    day.status !==
    DAY_STATUS.OPEN
  ) {

    throw new Error(
      'La jornada ya está cerrada.'
    );

  }


  return day;

}



/* =========================================================
   INVENTARIO ESPERADO PARA CIERRE
========================================================= */

export function getExpectedClosingInventory() {

  return getInventorySnapshot();

}



/* =========================================================
   VALORES SUGERIDOS PARA EL FORMULARIO
========================================================= */

/*
  app.js utilizará esta función para rellenar
  automáticamente los campos del cierre con
  lo que el sistema espera encontrar.

  Ejemplo:

  Duragas
  Llenos       80
  Vacíos       90
  Reservados    5
  Prestados     3

  El usuario solo cambia un valor si físicamente
  encuentra una diferencia.
*/

export function getSuggestedClosingCounts() {

  const inventory =
    getInventorySnapshot();


  return {

    [GAS_IDS.DURAGAS]: {

      full:
        inventory[
          GAS_IDS.DURAGAS
        ].full,

      empty:
        inventory[
          GAS_IDS.DURAGAS
        ].empty,

      reserved:
        inventory[
          GAS_IDS.DURAGAS
        ].reserved,

      /*
        "Prestados" no están físicamente en bodega.

        Este valor se utiliza como confirmación
        del registro lógico.
      */

      loaned:
        inventory[
          GAS_IDS.DURAGAS
        ].loaned,

    },


    [GAS_IDS.KING_GAS]: {

      full:
        inventory[
          GAS_IDS.KING_GAS
        ].full,

      empty:
        inventory[
          GAS_IDS.KING_GAS
        ].empty,

      reserved:
        inventory[
          GAS_IDS.KING_GAS
        ].reserved,

      loaned:
        inventory[
          GAS_IDS.KING_GAS
        ].loaned,

    },

  };

}



/* =========================================================
   NORMALIZAR INVENTARIO CONTADO
========================================================= */

function normalizeClosingGasInventory(
  raw = {},
  expected = {}
) {

  return {

    full:
      toNonNegativeInteger(
        raw.full ??
        expected.full ??
        0
      ),

    empty:
      toNonNegativeInteger(
        raw.empty ??
        expected.empty ??
        0
      ),

    reserved:
      toNonNegativeInteger(
        raw.reserved ??
        expected.reserved ??
        0
      ),

    /*
      PRESTADOS NO SON CONTEO FÍSICO.

      Aunque alguien manipule el HTML,
      siempre conservamos el valor lógico
      registrado por ControlGas.
    */

    loaned:
      toNonNegativeInteger(
        expected.loaned ??
        0
      ),

  };

}


function normalizeClosingInventory(
  rawInventory = {}
) {

  const expected =
    getExpectedClosingInventory();


  return {

    [GAS_IDS.DURAGAS]:
      normalizeClosingGasInventory(

        rawInventory[
          GAS_IDS.DURAGAS
        ],

        expected[
          GAS_IDS.DURAGAS
        ]

      ),


    [GAS_IDS.KING_GAS]:
      normalizeClosingGasInventory(

        rawInventory[
          GAS_IDS.KING_GAS
        ],

        expected[
          GAS_IDS.KING_GAS
        ]

      ),

  };

}



/* =========================================================
   TOTAL DE UNA MARCA
========================================================= */

function getGasControlledTotal(
  inventory,
  gasId
) {

  const gas =
    inventory?.[gasId] ?? {};


  return (

    toNonNegativeInteger(
      gas.full
    )

    +

    toNonNegativeInteger(
      gas.empty
    )

    +

    toNonNegativeInteger(
      gas.reserved
    )

    +

    toNonNegativeInteger(
      gas.loaned
    )

  );

}



/* =========================================================
   TOTAL EN BODEGA
========================================================= */

function getGasWarehouseTotal(
  inventory,
  gasId
) {

  const gas =
    inventory?.[gasId] ?? {};


  /*
    Prestados se excluyen porque están fuera.
  */

  return (

    toNonNegativeInteger(
      gas.full
    )

    +

    toNonNegativeInteger(
      gas.empty
    )

    +

    toNonNegativeInteger(
      gas.reserved
    )

  );

}



/* =========================================================
   RESUMEN DE DIFERENCIAS POR MARCA
========================================================= */

function summarizeGasDifference({

  gasId,

  expected,

  counted,

  detailedDifference,

}) {

  const expectedControlled =
    getGasControlledTotal(
      expected,
      gasId
    );


  const countedControlled =
    getGasControlledTotal(
      counted,
      gasId
    );


  const expectedWarehouse =
    getGasWarehouseTotal(
      expected,
      gasId
    );


  const countedWarehouse =
    getGasWarehouseTotal(
      counted,
      gasId
    );


  return {

    gasId,

    gasName:
      getGasName(
        gasId
      ),

    expected: {

      ...cloneData(
        expected[gasId]
      ),

      warehouse:
        expectedWarehouse,

      controlled:
        expectedControlled,

    },


    counted: {

      ...cloneData(
        counted[gasId]
      ),

      warehouse:
        countedWarehouse,

      controlled:
        countedControlled,

    },


    differences:
      cloneData(
        detailedDifference[
          gasId
        ]
      ),


    warehouseDifference:
      countedWarehouse -
      expectedWarehouse,


    controlledDifference:
      countedControlled -
      expectedControlled,

  };

}



/* =========================================================
   ESTADO DE DIFERENCIA
========================================================= */

export function getDifferenceStatus(
  difference
) {

  const value =
    Number(
      difference
    ) || 0;


  if (
    value === 0
  ) {

    return 'exact';

  }


  if (
    value > 0
  ) {

    return 'surplus';

  }


  return 'shortage';

}



/* =========================================================
   TEXTO DE DIFERENCIA
========================================================= */

export function getDifferenceText(
  difference,
  unit = ''
) {

  const value =
    Number(
      difference
    ) || 0;


  if (
    value === 0
  ) {

    return 'Exacto';

  }


  if (
    value > 0
  ) {

    return `Sobran ${value}${unit ? ` ${unit}` : ''}`;

  }


  return `Faltan ${Math.abs(value)}${unit ? ` ${unit}` : ''}`;

}



/* =========================================================
   TEXTO DIFERENCIA DE CAJA
========================================================= */

export function getCashDifferenceText(
  difference
) {

  const value =
    roundMoney(
      difference
    );


  if (
    Math.abs(value) < 0.005
  ) {

    return 'Caja exacta';

  }


  if (
    value > 0
  ) {

    return `Sobra $${value.toFixed(2)} en caja`;

  }


  return `Falta $${Math.abs(value).toFixed(2)} en caja`;

}



/* =========================================================
   PREVISUALIZAR CIERRE
========================================================= */

/*
  Esta función NO modifica nada.
*/

export function calculateClosingPreview({

  cashCounted = 0,

  inventory = null,

}) {

  const day =
    getActiveDay();


  if (!day) {

    return null;

  }


  const finance =
    getDayFinanceSummary(
      day.id
    );


  const expectedInventory =
    getExpectedClosingInventory();


  const countedInventory =
    normalizeClosingInventory(

      inventory ??
      expectedInventory

    );


  const detailedDifference =
    calculateInventoryDifference(
      countedInventory
    );


  const byGas = {};


  GAS_ID_LIST.forEach(
    gasId => {

      byGas[gasId] =
        summarizeGasDifference({

          gasId,

          expected:
            expectedInventory,

          counted:
            countedInventory,

          detailedDifference,

        });

    }
  );


  const expectedCash =
    roundMoney(
      finance.cash.expected
    );


  const countedCash =
    roundMoney(
      toNonNegativeNumber(
        cashCounted
      )
    );


  const cashDifference =
    roundMoney(
      countedCash -
      expectedCash
    );


  const totalWarehouseExpected =

    getGasWarehouseTotal(
      expectedInventory,
      GAS_IDS.DURAGAS
    )

    +

    getGasWarehouseTotal(
      expectedInventory,
      GAS_IDS.KING_GAS
    );


  const totalWarehouseCounted =

    getGasWarehouseTotal(
      countedInventory,
      GAS_IDS.DURAGAS
    )

    +

    getGasWarehouseTotal(
      countedInventory,
      GAS_IDS.KING_GAS
    );


  const totalControlledExpected =

    getGasControlledTotal(
      expectedInventory,
      GAS_IDS.DURAGAS
    )

    +

    getGasControlledTotal(
      expectedInventory,
      GAS_IDS.KING_GAS
    );


  const totalControlledCounted =

    getGasControlledTotal(
      countedInventory,
      GAS_IDS.DURAGAS
    )

    +

    getGasControlledTotal(
      countedInventory,
      GAS_IDS.KING_GAS
    );


  const totalInventoryDifference =
    totalControlledCounted -
    totalControlledExpected;


  const warehouseDifference =
    totalWarehouseCounted -
    totalWarehouseExpected;


  const pending =
    getAccountsSummary();


  const wallets =
    getWalletSummary();


  const hasCashDifference =
    Math.abs(
      cashDifference
    ) >= 0.005;

const hasInventoryDifference =

  GAS_ID_LIST.some(
    gasId => {

      const item =
        byGas[gasId];


      /*
        Solo comparamos físicamente lo que
        debería encontrarse en la bodega.

        Los prestados están fuera y no
        deben producir un faltante.
      */

      return (

        item.differences.full
          .difference !== 0

        ||

        item.differences.empty
          .difference !== 0

        ||

        item.differences.reserved
          .difference !== 0

      );

    }
  );


  return {

    dayId:
      day.id,

    dateKey:
      day.dateKey,

    finance,

    wallets,

    pending,


    cash: {

      expected:
        expectedCash,

      counted:
        countedCash,

      difference:
        cashDifference,

      status:
        getDifferenceStatus(
          cashDifference
        ),

      text:
        getCashDifferenceText(
          cashDifference
        ),

    },


    inventory: {

      expected:
        cloneData(
          expectedInventory
        ),

      counted:
        cloneData(
          countedInventory
        ),

      byGas,

      warehouse: {

        expected:
          totalWarehouseExpected,

        counted:
          totalWarehouseCounted,

        difference:
          warehouseDifference,

      },

      controlled: {

        expected:
          totalControlledExpected,

        counted:
          totalControlledCounted,

        difference:
          totalInventoryDifference,

      },

    },


    hasCashDifference,

    hasInventoryDifference,

    hasAnyDifference:

      hasCashDifference ||
      hasInventoryDifference,

  };

}



/* =========================================================
   VALIDAR CIERRE
========================================================= */

export function validateClosing({

  cashCounted,

  inventory,

}) {

  const errors = [];


  const day =
    getActiveDay();


  if (!day) {

    errors.push(
      'No existe una jornada abierta.'
    );


    return {

      valid: false,

      errors,

      preview: null,

    };

  }


  /*
    Cero es válido.
    Vacío/null no lo es.
  */

  if (
    cashCounted === '' ||
    cashCounted === null ||
    cashCounted === undefined
  ) {

    errors.push(
      'Debes escribir cuánto efectivo contaste al final del día.'
    );

  }


  if (
    Number(
      cashCounted
    ) < 0
  ) {

    errors.push(
      'El efectivo contado no puede ser negativo.'
    );

  }


  if (
    !inventory ||
    typeof inventory !== 'object'
  ) {

    errors.push(
      'No se recibió el inventario del cierre.'
    );

  }


  /*
    Verificamos que llenos, vacíos y reservados
    hayan llegado para ambas marcas.

    Prestados puede omitirse y se usa
    automáticamente el valor lógico registrado.
  */

  GAS_ID_LIST.forEach(
    gasId => {

      const gas =
        inventory?.[gasId];


      if (!gas) {

        errors.push(
          `Falta el conteo de ${getGasName(gasId)}.`
        );


        return;

      }


      [
        INVENTORY_BUCKETS.FULL,
        INVENTORY_BUCKETS.EMPTY,
        INVENTORY_BUCKETS.RESERVED,
      ].forEach(
        bucket => {

          const value =
            gas[bucket];


          if (
            value === '' ||
            value === null ||
            value === undefined
          ) {

            errors.push(
              `Falta completar ${bucket} de ${getGasName(gasId)}.`
            );

          }


          if (
            Number(value) < 0
          ) {

            errors.push(
              `El inventario de ${getGasName(gasId)} no puede ser negativo.`
            );

          }

        }
      );

    }
  );


  const preview =

    errors.length === 0

      ? calculateClosingPreview({

          cashCounted,

          inventory,

        })

      : null;


  return {

    valid:
      errors.length === 0,

    errors,

    preview,

  };

}



/* =========================================================
   MOVIMIENTO DE CIERRE
========================================================= */

function createClosingMovement(
  closing
) {

  const movement =
    createMovementBase({

      id:
        uid('mov'),

      dayId:
        closing.dayId,

      type:
        MOVEMENT_TYPES.CLOSING,

      createdAt:
        closing.closedAt,

      referenceId:
        closing.id,

      reference:
        `Cierre ${closing.dateKey}`,

      detail:
        closing.hasAnyDifference

          ? 'Jornada cerrada con diferencias registradas.'

          : 'Jornada cerrada sin diferencias.',

      value:
        closing.finance
          ?.sales
          ?.revenue ??
        0,

      metadata: {

        closingId:
          closing.id,

        salesRevenue:
          closing.finance
            ?.sales
            ?.revenue ??
          0,

        collected:
          closing.finance
            ?.collection
            ?.total ??
          0,

        expectedCash:
          closing.cash.expected,

        countedCash:
          closing.cash.counted,

        cashDifference:
          closing.cash.difference,

        inventoryDifference:
          closing.inventory
            .controlled
            .difference,

        warehouseDifference:
          closing.inventory
            .warehouse
            .difference,

        hasAnyDifference:
          closing.hasAnyDifference,

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
   CERRAR JORNADA
========================================================= */

export function closeDay({

  cashCounted,

  inventory,

  note = '',

  closedAt =
    nowIso(),

}) {

  /*
    El cierre toca:

    - día
    - cierres
    - movimientos
    - activeDayId

    Por seguridad, es atómico.
  */

  const stateBefore =
    cloneData(
      getState()
    );


  try {

    const day =
      requireActiveDay();


    const validation =
      validateClosing({

        cashCounted,

        inventory,

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


    const closingId =
      uid('closing');



    /* =====================================================
       CREAR REGISTRO
    ===================================================== */

    const closing = {

      id:
        closingId,

      dayId:
        day.id,

      dateKey:
        day.dateKey,

      openedAt:
        day.openedAt,

      closedAt,


      /*
        Fotografía financiera completa.
      */

      finance:
        cloneData(
          preview.finance
        ),


      /*
        Las bolsas NO se reinician.

        Solo guardamos la fotografía
        de cómo quedaron al cerrar.
      */

      wallets:
        cloneData(
          preview.wallets
        ),


      cash:
        cloneData(
          preview.cash
        ),


      inventory:
        cloneData(
          preview.inventory
        ),


      pending:
        cloneData(
          preview.pending
        ),


      hasCashDifference:
        preview.hasCashDifference,

      hasInventoryDifference:
        preview.hasInventoryDifference,

      hasAnyDifference:
        preview.hasAnyDifference,


      note:
        normalizeText(
          note
        ),

    };



    /* =====================================================
       GUARDAR CIERRE
    ===================================================== */

    getState()
      .closings
      .push(
        closing
      );



    /* =====================================================
       CERRAR DÍA
    ===================================================== */

    day.status =
      DAY_STATUS.CLOSED;


    day.closedAt =
      closedAt;


    day.closingId =
      closing.id;



    /* =====================================================
       MOVIMIENTO GENERAL
    ===================================================== */

    const movement =
      createClosingMovement(
        closing
      );


    closing.movementId =
      movement.id;



    /* =====================================================
       QUITAR DÍA ACTIVO
    ===================================================== */

    getState().activeDayId =
      null;


    touchState();



    /* =====================================================
       GUARDAR
    ===================================================== */

    saveState();



    return {

      closing:
        cloneData(
          closing
        ),

      movement:
        cloneData(
          movement
        ),

      /*
        Estas bolsas continúan disponibles
        para el siguiente día.
      */

      wallets:
        cloneData(
          getState().wallets
        ),

      inventory:
        getInventorySnapshot(),

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

      /* Mantener restauración en memoria. */

    }


    throw error;

  }

}

/* =========================================================
   ÚLTIMO INVENTARIO FÍSICO CERRADO
========================================================= */

/*
  Devuelve el conteo físico REAL del último cierre.

  Este valor servirá como referencia para la
  Apertura de la siguiente jornada.

  IMPORTANTE:

  - NO modifica cierres anteriores.
  - NO borra diferencias.
  - NO altera el historial.
  - Si todavía no existe ningún cierre,
    usa el inventario lógico actual.
*/

export function getLastClosingInventory() {

  const closings =
    sortNewestFirst(

      getState().closings,

      item =>
        item.closedAt

    );


  const lastClosing =
    closings[0];


  /*
    Si todavía no existe ningún cierre,
    utilizamos el inventario actual.
  */

  if (
    !lastClosing
  ) {

    return getInventorySnapshot();

  }


  /*
    Las versiones actuales guardan:

    closing.inventory.expected
    closing.inventory.counted

    Para la siguiente mañana nos interesa
    lo que REALMENTE se contó físicamente.
  */

  const counted =
    lastClosing
      .inventory
      ?.counted;


  if (
    !counted
  ) {

    /*
      Compatibilidad con cierres antiguos
      que quizás no tengan "counted".
    */

    return getInventorySnapshot();

  }


  return cloneData(
    counted
  );

}

/* =========================================================
   CIERRE DE UN DÍA
========================================================= */

export function getClosingByDay(
  dayId
) {

  if (!dayId) {

    return null;

  }


  const closing =
    getState()
      .closings
      .find(
        item =>
          item.dayId ===
          dayId
      );


  return closing
    ? cloneData(
        closing
      )
    : null;

}



/* =========================================================
   CIERRES RECIENTES
========================================================= */

export function getRecentClosings(
  limit = 20
) {

  return sortNewestFirst(

    getState()
      .closings,

    item =>
      item.closedAt

  ).slice(
    0,
    toNonNegativeInteger(
      limit
    )
  );

}



/* =========================================================
   DÍAS CERRADOS
========================================================= */

export function getClosedDays() {

  return sortNewestFirst(

    getState()
      .days
      .filter(
        day =>
          day.status ===
          DAY_STATUS.CLOSED
      ),

    day =>
      day.closedAt ??
      day.openedAt

  );

}



/* =========================================================
   DETALLE DE DÍA CERRADO
========================================================= */

export function getClosedDayDetail(
  dayId
) {

  const day =
    getDayById(
      dayId
    );


  if (!day) {

    return null;

  }


  const state =
    getState();


  const closing =
    state.closings.find(
      item =>
        item.dayId ===
        dayId
    );


  const sales =
    state.sales.filter(
      sale =>
        sale.dayId ===
        dayId
    );


  const saleIds =
    new Set(
      sales.map(
        sale =>
          sale.id
      )
    );


  const saleLines =
    state.saleLines.filter(
      line =>
        saleIds.has(
          line.saleId
        )
    );


  const replenishments =
    state.replenishments.filter(
      item =>
        item.dayId ===
        dayId
    );


  const adjustments =
    state.adjustments.filter(
      item =>
        item.dayId ===
        dayId
    );


  const loans =
    state.loans.filter(
      item =>
        item.dayId ===
        dayId
    );


  const expenses =
    state.expenses.filter(
      item =>
        item.dayId ===
        dayId
    );


  const walletMovements =
    state.walletMovements.filter(
      item =>
        item.dayId ===
        dayId
    );


  const movements =
    sortNewestFirst(

      state.movements.filter(
        item =>
          item.dayId ===
          dayId
      ),

      item =>
        item.createdAt

    );


  return {

    day:
      cloneData(
        day
      ),

    closing:
      closing
        ? cloneData(
            closing
          )
        : null,

    sales:
      cloneData(
        sales
      ),

    saleLines:
      cloneData(
        saleLines
      ),

    replenishments:
      cloneData(
        replenishments
      ),

    adjustments:
      cloneData(
        adjustments
      ),

    loans:
      cloneData(
        loans
      ),

    expenses:
      cloneData(
        expenses
      ),

    walletMovements:
      cloneData(
        walletMovements
      ),

    movements:
      cloneData(
        movements
      ),

  };

}



/* =========================================================
   RESUMEN DE DIFERENCIAS HISTÓRICAS
========================================================= */

export function getClosingDifferenceSummary() {

  const closings =
    getState().closings;


  let exactClosings = 0;

  let closingsWithCashDifference = 0;

  let closingsWithInventoryDifference = 0;


  closings.forEach(
    closing => {

      if (
        !closing.hasAnyDifference
      ) {

        exactClosings +=
          1;

      }


      if (
        closing.hasCashDifference
      ) {

        closingsWithCashDifference +=
          1;

      }


      if (
        closing.hasInventoryDifference
      ) {

        closingsWithInventoryDifference +=
          1;

      }

    }
  );


  return {

    totalClosings:
      closings.length,

    exactClosings,

    closingsWithCashDifference,

    closingsWithInventoryDifference,

  };

}



/* =========================================================
   DATOS DEL CIERRE ACTUAL PARA LA INTERFAZ
========================================================= */

export function getCurrentClosingData() {

  const day =
    getActiveDay();


  if (!day) {

    return null;

  }


  const finance =
    getDayFinanceSummary(
      day.id
    );


  const inventory =
    getExpectedClosingInventory();


  const wallets =
    getWalletSummary();


  const pending =
    getAccountsSummary();


  return {

    day:
      cloneData(
        day
      ),

    finance,

    inventory,

    wallets,

    pending,


    totals: {

      physical:
        getPhysicalInventoryTotal(),

      loaned:
        getLoanedInventoryTotal(),

      controlled:
        getControlledInventoryTotal(),

    },

  };

}
