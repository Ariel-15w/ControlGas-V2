/* =========================================================
   CONTROLGAS
   INVENTARIO

   Responsabilidades:
   - Consultar inventario actual
   - Modificar llenos
   - Modificar vacíos
   - Modificar reservados
   - Modificar prestados
   - Validar stock suficiente
   - Evitar cantidades negativas
   - Registrar intercambios entre marcas
   - Aplicar ventas
   - Aplicar retiros de reservas
   - Aplicar reposiciones
   - Aplicar préstamos y devoluciones
   - Aplicar ajustes

   IMPORTANTE:
   Este archivo NO calcula ganancias.
   finance.js será responsable de la parte económica.
========================================================= */

import {
  GAS_IDS,
  GAS_ID_LIST,
  INVENTORY_BUCKETS,
  INVENTORY_BUCKET_LABELS,
  INVENTORY_CONFIG,
  SALE_MODES,
} from './config.js';


import {
  getState,
  getGasInventory,
  getActiveDay,
  touchState,
} from './state.js';


import {
  cloneData,
  roundMoney,
  toInteger,
  toNonNegativeInteger,
  uid,
  nowIso,
} from './utils.js';



/* =========================================================
   VALIDAR MARCA
========================================================= */

function assertGasType(
  gasId
) {

  if (
    !GAS_ID_LIST.includes(
      gasId
    )
  ) {

    throw new Error(
      `Marca de gas inválida: ${gasId}`
    );

  }

}



/* =========================================================
   VALIDAR EXISTENCIA
========================================================= */

function assertBucket(
  bucket
) {

  const allowed =
    Object.values(
      INVENTORY_BUCKETS
    );


  if (
    !allowed.includes(
      bucket
    )
  ) {

    throw new Error(
      `Tipo de inventario inválido: ${bucket}`
    );

  }

}



/* =========================================================
   OBTENER INVENTARIO COMPLETO
========================================================= */

export function getInventory() {

  return getState().inventory;

}



/* =========================================================
   COPIA DEL INVENTARIO
========================================================= */

export function getInventorySnapshot() {

  return cloneData(
    getState().inventory
  );

}



/* =========================================================
   INVENTARIO POR MARCA
========================================================= */

export function getInventoryByGas(
  gasId
) {

  assertGasType(
    gasId
  );


  const inventory =
    getGasInventory(
      gasId
    );


  if (!inventory) {

    throw new Error(
      `No existe inventario para ${gasId}.`
    );

  }


  return inventory;

}



/* =========================================================
   CANTIDAD DE UNA EXISTENCIA
========================================================= */

export function getInventoryQuantity(
  gasId,
  bucket
) {

  assertGasType(
    gasId
  );


  assertBucket(
    bucket
  );


  return toNonNegativeInteger(
    getInventoryByGas(
      gasId
    )[bucket]
  );

}



/* =========================================================
   TOTAL CONTROLADO DE UNA MARCA
========================================================= */

/*
  Incluye:

  llenos
  + vacíos
  + reservados
  + prestados

  porque todos siguen siendo cilindros controlados.
*/

export function getControlledGasTotal(
  gasId
) {

  const gas =
    getInventoryByGas(
      gasId
    );


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

    (
      INVENTORY_CONFIG
        .countLoanedAsControlledProperty

        ? toNonNegativeInteger(
            gas.loaned
          )

        : 0
    )

  );

}



/* =========================================================
   TOTAL FÍSICO EN BODEGA POR MARCA
========================================================= */

/*
  Los prestados no están físicamente.

  Los reservados sí están físicamente
  dentro de la bodega, aunque ya tengan dueño.
*/

export function getPhysicalGasTotal(
  gasId
) {

  const gas =
    getInventoryByGas(
      gasId
    );


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
   TOTAL GENERAL CONTROLADO
========================================================= */

export function getControlledInventoryTotal() {

  return (

    getControlledGasTotal(
      GAS_IDS.DURAGAS
    )

    +

    getControlledGasTotal(
      GAS_IDS.KING_GAS
    )

  );

}



/* =========================================================
   TOTAL FÍSICO GENERAL
========================================================= */

export function getPhysicalInventoryTotal() {

  return (

    getPhysicalGasTotal(
      GAS_IDS.DURAGAS
    )

    +

    getPhysicalGasTotal(
      GAS_IDS.KING_GAS
    )

  );

}



/* =========================================================
   TOTAL PRESTADO
========================================================= */

export function getLoanedInventoryTotal() {

  return (

    getInventoryQuantity(
      GAS_IDS.DURAGAS,
      INVENTORY_BUCKETS.LOANED
    )

    +

    getInventoryQuantity(
      GAS_IDS.KING_GAS,
      INVENTORY_BUCKETS.LOANED
    )

  );

}



/* =========================================================
   DISPONIBLES PARA VENDER
========================================================= */

export function getAvailableStock(
  gasId
) {

  return getInventoryQuantity(
    gasId,
    INVENTORY_BUCKETS.FULL
  );

}



/* =========================================================
   VALIDAR STOCK SUFICIENTE
========================================================= */

export function hasEnoughStock(
  gasId,
  quantity
) {

  assertGasType(
    gasId
  );


  const requested =
    toNonNegativeInteger(
      quantity
    );


  return (
    getAvailableStock(
      gasId
    ) >=
    requested
  );

}



/* =========================================================
   VALIDAR VARIAS MARCAS
========================================================= */

export function validateSaleStock(
  quantities = {}
) {

  const errors = [];


  GAS_ID_LIST.forEach(
    gasId => {

      const requested =
        toNonNegativeInteger(
          quantities[gasId]
        );


      const available =
        getAvailableStock(
          gasId
        );


      if (
        requested >
        available
      ) {

        errors.push(
          `${
            gasId === GAS_IDS.DURAGAS
              ? 'Duragas'
              : 'King Gas'
          }: solicitas ${requested} y solo hay ${available} disponibles.`
        );

      }

    }
  );


  return {

    valid:
      errors.length === 0,

    errors,

  };

}



/* =========================================================
   MODIFICAR EXISTENCIA
========================================================= */

/*
  Esta es la función interna central.

  delta puede ser:

  +5
  -3
*/

function changeInventoryQuantity(
  gasId,
  bucket,
  delta
) {

  assertGasType(
    gasId
  );


  assertBucket(
    bucket
  );


  const movement =
    toInteger(
      delta
    );


  if (
    movement === 0
  ) {

    return getInventoryQuantity(
      gasId,
      bucket
    );

  }


  const gas =
    getInventoryByGas(
      gasId
    );


  const before =
    toNonNegativeInteger(
      gas[bucket]
    );


  const after =
    before +
    movement;


  if (
    !INVENTORY_CONFIG
      .allowNegativeStock &&
    after < 0
  ) {

    throw new Error(
      `No hay suficientes ${INVENTORY_BUCKET_LABELS[bucket].toLowerCase()} de ${
        gasId === GAS_IDS.DURAGAS
          ? 'Duragas'
          : 'King Gas'
      }.`
    );

  }


  gas[bucket] =
    Math.max(
      0,
      after
    );


  touchState();


  return gas[bucket];

}



/* =========================================================
   ESTABLECER UNA EXISTENCIA
========================================================= */

export function setInventoryQuantity(
  gasId,
  bucket,
  quantity
) {

  assertGasType(
    gasId
  );


  assertBucket(
    bucket
  );


  const gas =
    getInventoryByGas(
      gasId
    );


  gas[bucket] =
    toNonNegativeInteger(
      quantity
    );


  touchState();


  return gas[bucket];

}



/* =========================================================
   ESTABLECER INVENTARIO COMPLETO
========================================================= */

export function setInventory(
  inventory
) {

  GAS_ID_LIST.forEach(
    gasId => {

      const source =
        inventory?.[gasId] ?? {};


      setInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.FULL,
        source.full
      );


      setInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.EMPTY,
        source.empty
      );


      setInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.RESERVED,
        source.reserved
      );


      setInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.LOANED,
        source.loaned
      );

    }
  );


  return getInventorySnapshot();

}



/* =========================================================
   APLICAR APERTURA
========================================================= */

export function applyOpeningInventory(
  openingInventory
) {

  return setInventory(
    openingInventory
  );

}



/* =========================================================
   VENTA - ENTREGAR LLENOS
========================================================= */

function removeSoldFullCylinders(
  quantities
) {

  const validation =
    validateSaleStock(
      quantities
    );


  if (!validation.valid) {

    throw new Error(
      validation.errors.join(
        ' '
      )
    );

  }


  GAS_ID_LIST.forEach(
    gasId => {

      const quantity =
        toNonNegativeInteger(
          quantities[gasId]
        );


      if (
        quantity === 0
      ) {

        return;

      }


      changeInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.FULL,
        -quantity
      );

    }
  );

}



/* =========================================================
   RECIBIR VACÍOS
========================================================= */

export function receiveEmptyCylinders(
  emptyReceived = {}
) {

  GAS_ID_LIST.forEach(
    gasId => {

      const quantity =
        toNonNegativeInteger(
          emptyReceived[gasId]
        );


      if (
        quantity === 0
      ) {

        return;

      }


      changeInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.EMPTY,
        quantity
      );

    }
  );


  return getInventorySnapshot();

}



/* =========================================================
   RESERVAR LLENOS
========================================================= */

/*
  Cuando el cliente paga ahora
  pero retira después:

  full - cantidad
  reserved + cantidad
*/

function reserveFullCylinders(
  quantities = {}
) {

  const validation =
    validateSaleStock(
      quantities
    );


  if (!validation.valid) {

    throw new Error(
      validation.errors.join(
        ' '
      )
    );

  }


  GAS_ID_LIST.forEach(
    gasId => {

      const quantity =
        toNonNegativeInteger(
          quantities[gasId]
        );


      if (
        quantity === 0
      ) {

        return;

      }


      changeInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.FULL,
        -quantity
      );


      changeInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.RESERVED,
        quantity
      );

    }
  );

}



/* =========================================================
   APLICAR VENTA
========================================================= */

/*
  quantities:
  {
    duragas: 2,
    kinggas: 1
  }

  emptyReceived:
  {
    duragas: 1,
    kinggas: 2
  }

  Esto permite intercambio de marcas.
*/

export function applySaleInventory({

  quantities = {},

  emptyReceived = {},

  saleMode =
    SALE_MODES.NOW,

}) {

  /*
    Guardamos copia por seguridad.

    Si algo falla durante la operación,
    restauramos el inventario anterior.
  */

  const before =
    getInventorySnapshot();


  try {

    if (
      saleMode ===
      SALE_MODES.LATER
    ) {

      reserveFullCylinders(
        quantities
      );

    }
    else {

      removeSoldFullCylinders(
        quantities
      );

    }


    /*
      Los vacíos se reciben ahora
      incluso si el cliente retira después,
      porque según la operación acordada
      puede dejar los cilindros vacíos
      al momento de pagar.
    */

    receiveEmptyCylinders(
      emptyReceived
    );


    return {

      before,

      after:
        getInventorySnapshot(),

    };

  }
  catch (error) {

    setInventory(
      before
    );


    throw error;

  }

}



/* =========================================================
   RETIRO DE RESERVA
========================================================= */

/*
  IMPORTANTE:

  El cilindro ya fue descontado de full
  cuando se registró la venta.

  Por eso al retirar solamente hacemos:

  reserved - cantidad

  NO se descuenta full otra vez.
*/

export function pickupReservedCylinders(
  quantities = {}
) {

  const before =
    getInventorySnapshot();


  try {

    GAS_ID_LIST.forEach(
      gasId => {

        const quantity =
          toNonNegativeInteger(
            quantities[gasId]
          );


        if (
          quantity === 0
        ) {

          return;

        }


        const reserved =
          getInventoryQuantity(
            gasId,
            INVENTORY_BUCKETS.RESERVED
          );


        if (
          quantity >
          reserved
        ) {

          throw new Error(
            `No hay suficientes cilindros reservados de ${
              gasId === GAS_IDS.DURAGAS
                ? 'Duragas'
                : 'King Gas'
            }.`
          );

        }


        changeInventoryQuantity(
          gasId,
          INVENTORY_BUCKETS.RESERVED,
          -quantity
        );

      }
    );


    return {

      before,

      after:
        getInventorySnapshot(),

    };

  }
  catch (error) {

    setInventory(
      before
    );


    throw error;

  }

}



/* =========================================================
   REPOSICIÓN
========================================================= */

/*
  Ejemplo:

  Llegan:
  150 llenos Duragas

  Se llevan:
  150 vacíos Duragas

  Resultado:

  full +150
  empty -150
*/

export function applyReplenishmentInventory({

  gasId,

  quantity,

  emptyOut,

}) {

  assertGasType(
    gasId
  );


  const replenished =
    toNonNegativeInteger(
      quantity
    );


  const emptiesLeaving =
    toNonNegativeInteger(
      emptyOut
    );


  const before =
    getInventorySnapshot();


  try {

    const currentEmpty =
      getInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.EMPTY
      );


    if (
      emptiesLeaving >
      currentEmpty
    ) {

      throw new Error(
        `No puedes entregar ${emptiesLeaving} vacíos de ${
          gasId === GAS_IDS.DURAGAS
            ? 'Duragas'
            : 'King Gas'
        } porque solo existen ${currentEmpty}.`
      );

    }


    if (
      replenished > 0
    ) {

      changeInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.FULL,
        replenished
      );

    }


    if (
      emptiesLeaving > 0
    ) {

      changeInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.EMPTY,
        -emptiesLeaving
      );

    }


    return {

      before,

      after:
        getInventorySnapshot(),

    };

  }
  catch (error) {

    setInventory(
      before
    );


    throw error;

  }

}



/* =========================================================
   PRÉSTAMO DE CILINDRO
========================================================= */

/*
  Por ahora consideramos que el préstamo mueve
  un cilindro físico fuera de la bodega.

  La categoría de origen se especifica.

  Ejemplo:
  prestar un vacío:

  empty -1
  loaned +1
*/

export function lendCylinders({

  gasId,

  quantity,

  sourceBucket =
    INVENTORY_BUCKETS.EMPTY,

}) {

  assertGasType(
    gasId
  );


  assertBucket(
    sourceBucket
  );


  if (
    sourceBucket ===
    INVENTORY_BUCKETS.LOANED
  ) {

    throw new Error(
      'No puedes prestar desde la categoría Prestados.'
    );

  }


  const qty =
    toNonNegativeInteger(
      quantity
    );


  if (
    qty === 0
  ) {

    return {

      before:
        getInventorySnapshot(),

      after:
        getInventorySnapshot(),

    };

  }


  const available =
    getInventoryQuantity(
      gasId,
      sourceBucket
    );


  if (
    qty >
    available
  ) {

    throw new Error(
      `No existen suficientes cilindros en ${INVENTORY_BUCKET_LABELS[sourceBucket]}.`
    );

  }


  const before =
    getInventorySnapshot();


  try {

    changeInventoryQuantity(
      gasId,
      sourceBucket,
      -qty
    );


    changeInventoryQuantity(
      gasId,
      INVENTORY_BUCKETS.LOANED,
      qty
    );


    return {

      before,

      after:
        getInventorySnapshot(),

    };

  }
  catch (error) {

    setInventory(
      before
    );


    throw error;

  }

}



/* =========================================================
   DEVOLVER CILINDRO PRESTADO
========================================================= */

/*
  Cuando vuelve, necesitamos saber
  en qué estado físico regresa.

  Normalmente podrá regresar:

  - vacío
  - lleno
*/

export function returnLoanedCylinders({

  gasId,

  quantity,

  destinationBucket =
    INVENTORY_BUCKETS.EMPTY,

}) {

  assertGasType(
    gasId
  );


  assertBucket(
    destinationBucket
  );


  if (
    destinationBucket ===
    INVENTORY_BUCKETS.LOANED
  ) {

    throw new Error(
      'El destino de una devolución no puede ser Prestados.'
    );

  }


  const qty =
    toNonNegativeInteger(
      quantity
    );


  const loaned =
    getInventoryQuantity(
      gasId,
      INVENTORY_BUCKETS.LOANED
    );


  if (
    qty >
    loaned
  ) {

    throw new Error(
      `Solo existen ${loaned} cilindros prestados de ${
        gasId === GAS_IDS.DURAGAS
          ? 'Duragas'
          : 'King Gas'
      }.`
    );

  }


  const before =
    getInventorySnapshot();


  try {

    changeInventoryQuantity(
      gasId,
      INVENTORY_BUCKETS.LOANED,
      -qty
    );


    changeInventoryQuantity(
      gasId,
      destinationBucket,
      qty
    );


    return {

      before,

      after:
        getInventorySnapshot(),

    };

  }
  catch (error) {

    setInventory(
      before
    );


    throw error;

  }

}



/* =========================================================
   AJUSTE DE INVENTARIO
========================================================= */

export function applyInventoryAdjustment({

  gasId,

  bucket,

  direction,

  quantity,

}) {

  assertGasType(
    gasId
  );


  assertBucket(
    bucket
  );


  const qty =
    toNonNegativeInteger(
      quantity
    );


  if (
    qty === 0
  ) {

    throw new Error(
      'La cantidad del ajuste debe ser mayor que cero.'
    );

  }


  const delta =

    direction ===
    'decrease'

      ? -qty

      : qty;


  const beforeQuantity =
    getInventoryQuantity(
      gasId,
      bucket
    );


  const afterQuantity =
    beforeQuantity +
    delta;


  if (
    afterQuantity < 0
  ) {

    throw new Error(
      'El ajuste dejaría el inventario en negativo.'
    );

  }


  changeInventoryQuantity(
    gasId,
    bucket,
    delta
  );


  return {

    before:
      beforeQuantity,

    delta,

    after:
      getInventoryQuantity(
        gasId,
        bucket
      ),

  };

}



/* =========================================================
   DIFERENCIA ENTRE INVENTARIO ESPERADO Y FÍSICO
========================================================= */

export function calculateInventoryDifference(
  physicalInventory
) {

  const result = {};


  GAS_ID_LIST.forEach(
    gasId => {

      result[gasId] = {};


      Object.values(
        INVENTORY_BUCKETS
      ).forEach(
        bucket => {

          const expected =
            getInventoryQuantity(
              gasId,
              bucket
            );


          const physical =
            toNonNegativeInteger(
              physicalInventory
                ?.[gasId]
                ?.[bucket]
            );


          result[gasId][bucket] = {

            expected,

            physical,

            difference:
              physical -
              expected,

          };

        }
      );


      result[gasId].totalDifference =

        Object.values(
          INVENTORY_BUCKETS
        ).reduce(
          (
            total,
            bucket
          ) => {

            return (
              total +
              result[gasId][bucket]
                .difference
            );

          },
          0
        );

    }
  );


  return result;

}



/* =========================================================
   DETECTAR INTERCAMBIO DE MARCAS
========================================================= */

/*
  Ejemplo:

  Cliente compra:
  1 King Gas

  entrega:
  1 Duragas vacío

  Esto se considera un intercambio entre marcas.
*/

export function describeGasExchange({

  quantities = {},

  emptyReceived = {},

}) {

  const soldDuragas =
    toNonNegativeInteger(
      quantities[
        GAS_IDS.DURAGAS
      ]
    );


  const soldKingGas =
    toNonNegativeInteger(
      quantities[
        GAS_IDS.KING_GAS
      ]
    );


  const emptyDuragas =
    toNonNegativeInteger(
      emptyReceived[
        GAS_IDS.DURAGAS
      ]
    );


  const emptyKingGas =
    toNonNegativeInteger(
      emptyReceived[
        GAS_IDS.KING_GAS
      ]
    );


  const totalSold =
    soldDuragas +
    soldKingGas;


  const totalEmpty =
    emptyDuragas +
    emptyKingGas;


  if (
    totalSold === 0
  ) {

    return {

      type:
        'none',

      text:
        'Sin venta.',

    };

  }


  if (
    totalEmpty === 0
  ) {

    return {

      type:
        'missing',

      text:
        'El cliente no entregó tanques vacíos.',

    };

  }



  const sameBrandExchange =

    soldDuragas ===
      emptyDuragas

    &&

    soldKingGas ===
      emptyKingGas;


  if (
    sameBrandExchange
  ) {

    return {

      type:
        'same',

      text:
        'Intercambio normal: recibió vacíos de las mismas marcas.',

    };

  }



  const hasCrossBrandExchange =

    (
      soldDuragas >
      emptyDuragas

      &&

      emptyKingGas >
      soldKingGas
    )

    ||

    (
      soldKingGas >
      emptyKingGas

      &&

      emptyDuragas >
      soldDuragas
    );


  if (
    hasCrossBrandExchange
  ) {

    return {

      type:
        'cross',

      text:
        'Intercambio entre marcas detectado.',

    };

  }


  if (
    totalEmpty <
    totalSold
  ) {

    return {

      type:
        'missing',

      text:
        `Faltan ${
          totalSold -
          totalEmpty
        } tanque(s) por devolver.`,

    };

  }


  if (
    totalEmpty >
    totalSold
  ) {

    return {

      type:
        'extra',

      text:
        `Se recibieron ${
          totalEmpty -
          totalSold
        } tanque(s) adicional(es).`,

    };

  }


  return {

    type:
      'mixed',

    text:
      'Los vacíos recibidos tienen una combinación distinta de marcas.',

  };

}



/* =========================================================
   CALCULAR TANQUES PENDIENTES POR MARCA
========================================================= */

/*
  IMPORTANTE:

  Si el cliente entrega un vacío de otra marca,
  ese vacío sí cuenta como cilindro devuelto.

  Para determinar deuda por marca utilizamos primero
  coincidencia de marca y luego compensamos los cruces.

  Esto evita crear deuda falsa cuando hay intercambio.
*/

export function calculateTankDebtByGas({

  quantities = {},

  emptyReceived = {},

}) {

  let soldDuragas =
    toNonNegativeInteger(
      quantities[
        GAS_IDS.DURAGAS
      ]
    );


  let soldKingGas =
    toNonNegativeInteger(
      quantities[
        GAS_IDS.KING_GAS
      ]
    );


  let emptyDuragas =
    toNonNegativeInteger(
      emptyReceived[
        GAS_IDS.DURAGAS
      ]
    );


  let emptyKingGas =
    toNonNegativeInteger(
      emptyReceived[
        GAS_IDS.KING_GAS
      ]
    );



  /*
    Primero se compensan las mismas marcas.
  */

  const matchedDuragas =
    Math.min(
      soldDuragas,
      emptyDuragas
    );


  soldDuragas -=
    matchedDuragas;


  emptyDuragas -=
    matchedDuragas;



  const matchedKingGas =
    Math.min(
      soldKingGas,
      emptyKingGas
    );


  soldKingGas -=
    matchedKingGas;


  emptyKingGas -=
    matchedKingGas;



  /*
    Después compensamos intercambio de marca.

    Ejemplo:

    vendió 1 rosado
    recibió 1 amarillo

    El cliente no queda debiendo tanque.
  */

  const kingSoldForDuragasEmpty =
    Math.min(
      soldKingGas,
      emptyDuragas
    );


  soldKingGas -=
    kingSoldForDuragasEmpty;


  emptyDuragas -=
    kingSoldForDuragasEmpty;



  const duragasSoldForKingEmpty =
    Math.min(
      soldDuragas,
      emptyKingGas
    );


  soldDuragas -=
    duragasSoldForKingEmpty;


  emptyKingGas -=
    duragasSoldForKingEmpty;



  return {

    [GAS_IDS.DURAGAS]:
      Math.max(
        0,
        soldDuragas
      ),

    [GAS_IDS.KING_GAS]:
      Math.max(
        0,
        soldKingGas
      ),

  };

}



/* =========================================================
   TOTAL DE TANQUES PENDIENTES
========================================================= */

export function calculateTotalTankDebt(
  debt
) {

  return (

    toNonNegativeInteger(
      debt?.[
        GAS_IDS.DURAGAS
      ]
    )

    +

    toNonNegativeInteger(
      debt?.[
        GAS_IDS.KING_GAS
      ]
    )

  );

}



/* =========================================================
   RESUMEN PARA INTERFAZ
========================================================= */

export function getInventorySummary() {

  const duragas =
    getInventoryByGas(
      GAS_IDS.DURAGAS
    );


  const kinggas =
    getInventoryByGas(
      GAS_IDS.KING_GAS
    );


  return {

    duragas: {

      ...cloneData(
        duragas
      ),

      physical:
        getPhysicalGasTotal(
          GAS_IDS.DURAGAS
        ),

      controlled:
        getControlledGasTotal(
          GAS_IDS.DURAGAS
        ),

    },


    kinggas: {

      ...cloneData(
        kinggas
      ),

      physical:
        getPhysicalGasTotal(
          GAS_IDS.KING_GAS
        ),

      controlled:
        getControlledGasTotal(
          GAS_IDS.KING_GAS
        ),

    },


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