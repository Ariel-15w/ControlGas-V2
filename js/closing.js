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


  function buildGasCounts(
    gasId
  ) {

    const gas =
      inventory?.[gasId] ??
      {};


    return {

      /*
        CONTEO FÍSICO EN BODEGA
      */

      full:
        toNonNegativeInteger(
          gas.full
        ),

      empty:
        toNonNegativeInteger(
          gas.empty
        ),

      reserved:
        toNonNegativeInteger(
          gas.reserved
        ),

      /*
        Apartados para el vendedor.

        Todavía están físicamente
        dentro de la bodega,
        por eso SÍ deben contarse.
      */

      routeReserved:
        toNonNegativeInteger(
          gas.routeReserved
        ),


      /*
        ESTOS DOS SON SOLO INFORMATIVOS.

        No se obliga al usuario a contarlos
        físicamente porque están fuera
        de la bodega.
      */

      loaned:
        toNonNegativeInteger(
          gas.loaned
        ),

      route:
        toNonNegativeInteger(
          gas.route
        ),

    };

  }


  return {

    [GAS_IDS.DURAGAS]:
      buildGasCounts(
        GAS_IDS.DURAGAS
      ),

    [GAS_IDS.KING_GAS]:
      buildGasCounts(
        GAS_IDS.KING_GAS
      ),

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

    /*
      CONTEO FÍSICO
    */

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
      También está físicamente
      dentro de la bodega.

      Si una interfaz antigua todavía
      no envía routeReserved,
      conservamos el valor esperado
      para evitar diferencias falsas.
    */

    routeReserved:
      toNonNegativeInteger(
        raw.routeReserved ??
        expected.routeReserved ??
        0
      ),


    /*
      PRESTADOS Y EN RUTA

      No son conteo físico de bodega.

      Conservamos siempre el valor lógico
      registrado por ControlGas aunque
      alguien manipule el formulario.
    */

    loaned:
      toNonNegativeInteger(
        expected.loaned ??
        0
      ),

    route:
      toNonNegativeInteger(
        expected.route ??
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
   TOTAL CONTROLADO DE UNA MARCA
========================================================= */

/*
  CONTROLADO significa:

  - lo que está en bodega
  - lo apartado para vendedor
  - lo que está actualmente en ruta
  - lo prestado

  Aunque no todo esté físicamente
  dentro del local, sigue siendo
  propiedad controlada por ControlGas.
*/

function getGasControlledTotal(
  inventory,
  gasId
) {

  const gas =
    inventory?.[gasId] ??
    {};


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
      gas.routeReserved
    )

    +

    toNonNegativeInteger(
      gas.route
    )

    +

    toNonNegativeInteger(
      gas.loaned
    )

  );

}



/* =========================================================
   TOTAL FÍSICO EN BODEGA
========================================================= */

/*
  Sí están físicamente:

  - llenos
  - vacíos
  - reservas normales
  - apartados para vendedor

  NO están físicamente:

  - cilindros en ruta
  - cilindros prestados
*/

function getGasWarehouseTotal(
  inventory,
  gasId
) {

  const gas =
    inventory?.[gasId] ??
    {};


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
      gas.routeReserved
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


  /* =====================================================
     FINANZAS
  ===================================================== */

  const finance =
    getDayFinanceSummary(
      day.id
    );


  /* =====================================================
     INVENTARIO
  ===================================================== */

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


  /* =====================================================
     CAJA
  ===================================================== */

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


  /* =====================================================
     TOTALES FÍSICOS DE BODEGA
  ===================================================== */

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


  /* =====================================================
     TOTALES CONTROLADOS
  ===================================================== */

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


  /* =====================================================
     CUENTAS PENDIENTES DE CLIENTES
  ===================================================== */

  const pending =
    getAccountsSummary();


  /* =====================================================
     OBLIGACIONES PENDIENTES DEL PROVEEDOR
  ===================================================== */

  const supplierPendingItems =
    (
      getState()
        .supplierPayments ??
      []
    ).filter(
      payment =>
        payment.status ===
        'pending'
    );


  const supplierPendingAmount =
    roundMoney(

      supplierPendingItems.reduce(
        (
          total,
          payment
        ) => {

          return (
            total +
            toNonNegativeNumber(
              payment.amount
            )
          );

        },
        0
      )

    );


  const supplierPending = {

    count:
      supplierPendingItems.length,

    amount:
      supplierPendingAmount,

    items:
      cloneData(
        supplierPendingItems
      ),

  };


  /* =====================================================
     BOLSAS
  ===================================================== */

  const wallets =
    getWalletSummary(
      day.id
    );


  /* =====================================================
     DIFERENCIAS
  ===================================================== */

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
          Solo revisamos físicamente
          lo que debería estar en bodega:

          - llenos
          - vacíos
          - reservas normales
          - apartados para vendedor

          NO revisamos físicamente:

          - prestados
          - en ruta
        */

        return (

          item.differences
            .full
            .difference !== 0

          ||

          item.differences
            .empty
            .difference !== 0

          ||

          item.differences
            .reserved
            .difference !== 0

          ||

          item.differences
            .routeReserved
            .difference !== 0

        );

      }
    );


  /* =====================================================
     RESULTADO
  ===================================================== */

  return {

    dayId:
      day.id,

    dateKey:
      day.dateKey,

    finance,

    wallets,

    pending,

    supplierPending,


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


  /* =====================================================
     JORNADA
  ===================================================== */

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


  if (
    day.status !==
    DAY_STATUS.OPEN
  ) {

    errors.push(
      'La jornada ya está cerrada.'
    );

  }


  /* =====================================================
     CAJA CONTADA
  ===================================================== */

  const cashIsEmpty =

    cashCounted === null

    ||

    cashCounted === undefined

    ||

    (
      typeof cashCounted ===
        'string'

      &&

      cashCounted.trim() ===
        ''
    );


  if (
    cashIsEmpty
  ) {

    errors.push(
      'Debes escribir cuánto efectivo contaste al final del día.'
    );

  }
  else {

    const cashNumber =
      Number(
        cashCounted
      );


    if (
      !Number.isFinite(
        cashNumber
      )
    ) {

      errors.push(
        'El efectivo contado debe ser un número válido.'
      );

    }
    else if (
      cashNumber < 0
    ) {

      errors.push(
        'El efectivo contado no puede ser negativo.'
      );

    }

  }


  /* =====================================================
     INVENTARIO RECIBIDO
  ===================================================== */

  if (
    !inventory ||
    typeof inventory !==
      'object'
  ) {

    errors.push(
      'No se recibió el inventario del cierre.'
    );

  }


  /* =====================================================
     VALIDAR CONTEOS FÍSICOS
  ===================================================== */

  GAS_ID_LIST.forEach(
    gasId => {

      const gas =
        inventory?.[
          gasId
        ];


      if (!gas) {

        errors.push(
          `Falta el conteo de ${getGasName(gasId)}.`
        );

        return;

      }


      /*
        Estos tres campos existen
        obligatoriamente en la interfaz actual.
      */

      const requiredBuckets = [

        INVENTORY_BUCKETS.FULL,

        INVENTORY_BUCKETS.EMPTY,

        INVENTORY_BUCKETS.RESERVED,

      ];


      requiredBuckets.forEach(
        bucket => {

          const value =
            gas[
              bucket
            ];


          const isEmpty =

            value === null

            ||

            value === undefined

            ||

            (
              typeof value ===
                'string'

              &&

              value.trim() ===
                ''
            );


          if (
            isEmpty
          ) {

            errors.push(
              `Falta completar ${bucket} de ${getGasName(gasId)}.`
            );

            return;

          }


          const number =
            Number(
              value
            );


          if (
            !Number.isFinite(
              number
            )
          ) {

            errors.push(
              `${bucket} de ${getGasName(gasId)} debe ser un número válido.`
            );

            return;

          }


          if (
            !Number.isInteger(
              number
            )
          ) {

            errors.push(
              `${bucket} de ${getGasName(gasId)} debe ser una cantidad entera de cilindros.`
            );

            return;

          }


          if (
            number < 0
          ) {

            errors.push(
              `El inventario de ${getGasName(gasId)} no puede ser negativo.`
            );

          }

        }
      );


      /*
        ROUTE_RESERVED también es físico.

        Todavía lo dejamos compatible
        con la interfaz anterior:

        - si app.js todavía no envía el campo,
          closing.js usa el valor lógico esperado;

        - cuando actualicemos la interfaz y el
          campo sí llegue, aquí validamos que
          sea un entero correcto.

        Así NO rompemos el sistema durante
        esta etapa de integración.
      */

      const routeReserved =
        gas[
          INVENTORY_BUCKETS
            .ROUTE_RESERVED
        ];


      const routeReservedWasProvided =

        routeReserved !== null

        &&

        routeReserved !== undefined

        &&

        !(
          typeof routeReserved ===
            'string'

          &&

          routeReserved.trim() ===
            ''
        );


      if (
        routeReservedWasProvided
      ) {

        const number =
          Number(
            routeReserved
          );


        if (
          !Number.isFinite(
            number
          )
        ) {

          errors.push(
            `Los apartados para vendedor de ${getGasName(gasId)} deben ser un número válido.`
          );

        }
        else if (
          !Number.isInteger(
            number
          )
        ) {

          errors.push(
            `Los apartados para vendedor de ${getGasName(gasId)} deben ser una cantidad entera de cilindros.`
          );

        }
        else if (
          number < 0
        ) {

          errors.push(
            `Los apartados para vendedor de ${getGasName(gasId)} no pueden ser negativos.`
          );

        }

      }

    }
  );


  /* =====================================================
     PREVIEW
  ===================================================== */

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
       CREAR REGISTRO DE CIERRE
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
        Modo financiero utilizado durante
        esta jornada.

        Queda congelado históricamente.
      */

      financialMode:
        preview.wallets
          ?.financialMode ??
        null,


      /*
        Fotografía financiera completa.
      */

      finance:
        cloneData(
          preview.finance
        ),


      /*
        Fotografía REAL de las bolsas.

        Incluye:

        - modo financiero
        - Bolsa General
        - Duragas
        - King Gas

        Las bolsas NO se reinician al cerrar.
      */

      wallets:
        cloneData(
          preview.wallets
        ),


      /*
        Caja esperada, contada
        y diferencia encontrada.
      */

      cash:
        cloneData(
          preview.cash
        ),


      /*
        Inventario:

        - esperado
        - contado
        - diferencias
        - físico en bodega
        - total controlado
      */

      inventory:
        cloneData(
          preview.inventory
        ),


      /*
        Cuentas pendientes de clientes
        existentes al momento del cierre.
      */

      pending:
        cloneData(
          preview.pending
        ),


      /*
        Obligaciones pendientes con proveedores.

        Ejemplo:
        factura Duragas de $1.15 por cilindro
        que todavía no haya sido pagada.
      */

      supplierPending:
        cloneData(
          preview.supplierPending
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
       MOVIMIENTO GENERAL DE CIERRE
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


    /* =====================================================
       RESULTADO
    ===================================================== */

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
        Devolvemos exactamente la fotografía
        financiera guardada en el cierre.

        NO usamos getState().wallets porque
        en modo GENERAL eso dejaría fuera
        información importante de Bolsa General.
      */

      wallets:
        cloneData(
          closing.wallets
        ),


      supplierPending:
        cloneData(
          closing.supplierPending
        ),


      inventory:
        getInventorySnapshot(),

    };

  }
  catch (error) {

    /*
      Si cualquier parte del cierre falla,
      restauramos completamente el estado.
    */

    replaceState(
      stateBefore
    );


    try {

      saveState();

    }
    catch {

      /*
        Si localStorage falla,
        mantenemos al menos la restauración
        dentro de la memoria actual.
      */

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
