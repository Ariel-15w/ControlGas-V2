/* =========================================================
   CONTROLGAS
   AJUSTES Y PRÉSTAMOS

   Responsabilidades:
   - Ajustar inventario con + / -
   - Exigir motivo del ajuste
   - Evitar inventario negativo
   - Registrar antes / después
   - Registrar préstamos
   - Registrar devoluciones de préstamos
   - Mantener los prestados dentro del patrimonio controlado
   - Registrar movimientos en historial
   - Guardar en localStorage

   IMPORTANTE:

   Los ajustes NO son ventas.
   Los préstamos NO son ventas.
   Las devoluciones NO son compras.

   Ninguna de estas operaciones genera ingreso
   ni ganancia por sí misma.
========================================================= */

import {
  ADJUSTMENT_DIRECTIONS,
  GAS_IDS,
  GAS_ID_LIST,
  GAS_TYPES,
  INVENTORY_BUCKETS,
  INVENTORY_BUCKET_LABELS,
  LOAN_ACTIONS,
  MOVEMENT_TYPES,
} from './config.js';


import {
  getState,
  getActiveDay,
  createMovementBase,
  replaceState,
  touchState,
} from './state.js';


import {
  getInventoryQuantity,
  getInventorySnapshot,
  applyInventoryAdjustment,
  lendCylinders,
  returnLoanedCylinders,
} from './inventory.js';


import {
  saveState,
} from './storage.js';


import {
  cloneData,
  normalizeText,
  nowIso,
  sortNewestFirst,
  toNonNegativeInteger,
  uid,
} from './utils.js';



/* =========================================================
   VALIDACIONES BÁSICAS
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
      `Marca inválida: ${gasId}`
    );

  }

}



function assertInventoryBucket(
  bucket
) {

  if (
    !Object.values(
      INVENTORY_BUCKETS
    ).includes(
      bucket
    )
  ) {

    throw new Error(
      `Tipo de inventario inválido: ${bucket}`
    );

  }

}



function getGasName(
  gasId
) {

  return (
    GAS_TYPES[gasId]?.name ??
    gasId
  );

}



function requireActiveDay() {

  const day =
    getActiveDay();


  if (!day) {

    throw new Error(
      'Debes abrir el día antes de registrar movimientos.'
    );

  }


  return day;

}



/* =========================================================
   PREVISUALIZAR AJUSTE
========================================================= */

/*
  Esta función NO modifica datos.

  Se utiliza para mostrar:

  Antes     20
  Operación -
  Cantidad   5
  Después   15
*/

export function calculateAdjustmentPreview({

  gasId =
    GAS_IDS.DURAGAS,

  bucket =
    INVENTORY_BUCKETS.FULL,

  direction =
    ADJUSTMENT_DIRECTIONS.INCREASE,

  quantity = 0,

}) {

  assertGasType(
    gasId
  );


  assertInventoryBucket(
    bucket
  );


  const qty =
    toNonNegativeInteger(
      quantity
    );


  const before =
    getInventoryQuantity(
      gasId,
      bucket
    );


  const delta =

    direction ===
      ADJUSTMENT_DIRECTIONS.DECREASE

      ? -qty

      : qty;


  const after =
    before +
    delta;


  return {

    gasId,

    gasName:
      getGasName(
        gasId
      ),

    bucket,

    bucketLabel:
      INVENTORY_BUCKET_LABELS[
        bucket
      ] ?? bucket,

    direction,

    operator:
      delta < 0
        ? '−'
        : '+',

    quantity:
      qty,

    before,

    delta,

    after,

    valid:
      after >= 0,

  };

}



/* =========================================================
   VALIDAR AJUSTE
========================================================= */

export function validateAdjustment({

  gasId,

  bucket,

  direction,

  quantity,

  note,

}) {

  const errors = [];


  if (!getActiveDay()) {

    errors.push(
      'Debes abrir el día antes de registrar un ajuste.'
    );

  }


  if (
    !GAS_ID_LIST.includes(
      gasId
    )
  ) {

    errors.push(
      'Selecciona una marca válida.'
    );

  }


  if (
    !Object.values(
      INVENTORY_BUCKETS
    ).includes(
      bucket
    )
  ) {

    errors.push(
      'Selecciona una categoría válida de inventario.'
    );

  }


  if (
    direction !==
      ADJUSTMENT_DIRECTIONS.INCREASE &&
    direction !==
      ADJUSTMENT_DIRECTIONS.DECREASE
  ) {

    errors.push(
      'Selecciona si deseas aumentar o disminuir.'
    );

  }


  const qty =
    toNonNegativeInteger(
      quantity
    );


  if (
    qty <= 0
  ) {

    errors.push(
      'La cantidad del ajuste debe ser mayor que cero.'
    );

  }


  if (
    !normalizeText(
      note
    )
  ) {

    errors.push(
      'Debes escribir el motivo del ajuste.'
    );

  }


  let preview = null;


  if (
    GAS_ID_LIST.includes(
      gasId
    ) &&
    Object.values(
      INVENTORY_BUCKETS
    ).includes(
      bucket
    )
  ) {

    preview =
      calculateAdjustmentPreview({

        gasId,

        bucket,

        direction,

        quantity:
          qty,

      });


    if (
      !preview.valid
    ) {

      errors.push(
        `El ajuste dejaría ${preview.bucketLabel.toLowerCase()} de ${preview.gasName} en negativo.`
      );

    }

  }


  return {

    valid:
      errors.length === 0,

    errors,

    preview,

  };

}



/* =========================================================
   MOVIMIENTO GENERAL DE AJUSTE
========================================================= */

function createAdjustmentMovement(
  adjustment
) {

  const operator =

    adjustment.delta < 0

      ? '−'

      : '+';


  const movement =
    createMovementBase({

      id:
        uid('mov'),

      dayId:
        adjustment.dayId,

      type:
        MOVEMENT_TYPES.ADJUSTMENT,

      createdAt:
        adjustment.createdAt,

      gasId:
        adjustment.gasId,

      referenceId:
        adjustment.id,

      reference:
        getGasName(
          adjustment.gasId
        ),

      detail:
        `${adjustment.bucketLabel}: ${operator}${adjustment.quantity}. ${adjustment.note}`,

      value: 0,

      metadata: {

        adjustmentId:
          adjustment.id,

        bucket:
          adjustment.bucket,

        direction:
          adjustment.direction,

        quantity:
          adjustment.quantity,

        before:
          adjustment.before,

        delta:
          adjustment.delta,

        after:
          adjustment.after,

        noRevenue:
          true,

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
   REGISTRAR AJUSTE
========================================================= */

export function registerAdjustment({

  gasId,

  bucket,

  direction,

  quantity,

  note,

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


    const validation =
      validateAdjustment({

        gasId,

        bucket,

        direction,

        quantity,

        note,

      });


    if (
      !validation.valid
    ) {

      throw new Error(
        validation.errors.join(' ')
      );

    }


    const inventoryBefore =
      getInventorySnapshot();


    const inventoryResult =
      applyInventoryAdjustment({

        gasId,

        bucket,

        direction,

        quantity,

      });


    const inventoryAfter =
      getInventorySnapshot();


    const adjustment = {

      id:
        uid('adjustment'),

      dayId:
        day.id,

      createdAt,

      gasId,

      gasName:
        getGasName(
          gasId
        ),

      bucket,

      bucketLabel:
        INVENTORY_BUCKET_LABELS[
          bucket
        ] ?? bucket,

      direction,

      quantity:
        toNonNegativeInteger(
          quantity
        ),

      before:
        inventoryResult.before,

      delta:
        inventoryResult.delta,

      after:
        inventoryResult.after,

      note:
        normalizeText(
          note
        ),

      inventoryBefore:
        cloneData(
          inventoryBefore
        ),

      inventoryAfter:
        cloneData(
          inventoryAfter
        ),

    };


    getState()
      .adjustments
      .push(
        adjustment
      );


    const movement =
      createAdjustmentMovement(
        adjustment
      );


    adjustment.movementId =
      movement.id;


    touchState();

    saveState();


    return {

      adjustment:
        cloneData(
          adjustment
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
   PREVISUALIZAR PRÉSTAMO
========================================================= */

/*
  sourceBucket:

  De qué grupo sale el cilindro al prestarlo.

  Por defecto EMPTY porque el formulario actual
  está pensado para control de cilindros prestados,
  pero el parámetro queda preparado para ampliar
  después a FULL si fuera necesario.
*/

export function calculateLoanPreview({

  gasId =
    GAS_IDS.DURAGAS,

  action =
    LOAN_ACTIONS.LEND,

  quantity = 0,

  sourceBucket =
    INVENTORY_BUCKETS.EMPTY,

  destinationBucket =
    INVENTORY_BUCKETS.EMPTY,

}) {

  assertGasType(
    gasId
  );


  const qty =
    toNonNegativeInteger(
      quantity
    );


  if (
    action ===
    LOAN_ACTIONS.LEND
  ) {

    assertInventoryBucket(
      sourceBucket
    );


    const sourceBefore =
      getInventoryQuantity(
        gasId,
        sourceBucket
      );


    const loanedBefore =
      getInventoryQuantity(
        gasId,
        INVENTORY_BUCKETS.LOANED
      );


    return {

      gasId,

      gasName:
        getGasName(
          gasId
        ),

      action,

      quantity:
        qty,

      sourceBucket,

      sourceBefore,

      sourceAfter:
        sourceBefore -
        qty,

      loanedBefore,

      loanedAfter:
        loanedBefore +
        qty,

      valid:
        qty > 0 &&
        qty <= sourceBefore,

    };

  }



  /*
    DEVOLVER
  */

  assertInventoryBucket(
    destinationBucket
  );


  const loanedBefore =
    getInventoryQuantity(
      gasId,
      INVENTORY_BUCKETS.LOANED
    );


  const destinationBefore =
    getInventoryQuantity(
      gasId,
      destinationBucket
    );


  return {

    gasId,

    gasName:
      getGasName(
        gasId
      ),

    action,

    quantity:
      qty,

    destinationBucket,

    loanedBefore,

    loanedAfter:
      loanedBefore -
      qty,

    destinationBefore,

    destinationAfter:
      destinationBefore +
      qty,

    valid:
      qty > 0 &&
      qty <= loanedBefore,

  };

}



/* =========================================================
   VALIDAR PRÉSTAMO / DEVOLUCIÓN
========================================================= */

export function validateLoanAction({

  gasId,

  action,

  quantity,

  reference,

  sourceBucket =
    INVENTORY_BUCKETS.EMPTY,

  destinationBucket =
    INVENTORY_BUCKETS.EMPTY,

}) {

  const errors = [];


  if (!getActiveDay()) {

    errors.push(
      'Debes abrir el día antes de registrar préstamos.'
    );

  }


  if (
    !GAS_ID_LIST.includes(
      gasId
    )
  ) {

    errors.push(
      'Selecciona una marca válida.'
    );

  }


  if (
    action !==
      LOAN_ACTIONS.LEND &&
    action !==
      LOAN_ACTIONS.RETURN
  ) {

    errors.push(
      'Selecciona Prestar o Devolver.'
    );

  }


  const qty =
    toNonNegativeInteger(
      quantity
    );


  if (
    qty <= 0
  ) {

    errors.push(
      'La cantidad debe ser mayor que cero.'
    );

  }


  if (
    !normalizeText(
      reference
    )
  ) {

    errors.push(
      'Debes indicar a quién se prestó o quién devolvió el tanque.'
    );

  }


  let preview = null;


  if (
    GAS_ID_LIST.includes(
      gasId
    )
  ) {

    try {

      preview =
        calculateLoanPreview({

          gasId,

          action,

          quantity:
            qty,

          sourceBucket,

          destinationBucket,

        });


      if (
        !preview.valid
      ) {

        if (
          action ===
          LOAN_ACTIONS.LEND
        ) {

          errors.push(
            `No hay suficientes cilindros en ${INVENTORY_BUCKET_LABELS[sourceBucket] ?? sourceBucket}.`
          );

        }
        else {

          errors.push(
            `No hay suficientes cilindros prestados de ${getGasName(gasId)}.`
          );

        }

      }

    }
    catch (error) {

      errors.push(
        error.message
      );

    }

  }


  return {

    valid:
      errors.length === 0,

    errors,

    preview,

  };

}



/* =========================================================
   CREAR MOVIMIENTO DE PRÉSTAMO
========================================================= */

function createLoanMovement(
  loanRecord
) {

  const isLoan =
    loanRecord.action ===
    LOAN_ACTIONS.LEND;


  const movement =
    createMovementBase({

      id:
        uid('mov'),

      dayId:
        loanRecord.dayId,

      type:
        isLoan

          ? MOVEMENT_TYPES.LOAN

          : MOVEMENT_TYPES.LOAN_RETURN,

      createdAt:
        loanRecord.createdAt,

      gasId:
        loanRecord.gasId,

      referenceId:
        loanRecord.id,

      reference:
        loanRecord.reference,

      detail:
        isLoan

          ? `Préstamo de ${loanRecord.quantity} cilindro(s) ${getGasName(loanRecord.gasId)}`

          : `Devolución de ${loanRecord.quantity} cilindro(s) ${getGasName(loanRecord.gasId)}`,

      value: 0,

      metadata: {

        loanId:
          loanRecord.id,

        action:
          loanRecord.action,

        quantity:
          loanRecord.quantity,

        sourceBucket:
          loanRecord.sourceBucket,

        destinationBucket:
          loanRecord.destinationBucket,

        note:
          loanRecord.note,

        noRevenue:
          true,

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
   REGISTRAR PRÉSTAMO O DEVOLUCIÓN
========================================================= */

export function registerLoanAction({

  gasId,

  action,

  quantity,

  reference,

  note = '',

  /*
    Actualmente usaremos vacío como condición habitual.
    Queda parametrizado para no bloquear una futura mejora.
  */

  sourceBucket =
    INVENTORY_BUCKETS.EMPTY,

  destinationBucket =
    INVENTORY_BUCKETS.EMPTY,

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


    const validation =
      validateLoanAction({

        gasId,

        action,

        quantity,

        reference,

        sourceBucket,

        destinationBucket,

      });


    if (
      !validation.valid
    ) {

      throw new Error(
        validation.errors.join(' ')
      );

    }


    const qty =
      toNonNegativeInteger(
        quantity
      );


    const inventoryBefore =
      getInventorySnapshot();


    let inventoryResult;


    if (
      action ===
      LOAN_ACTIONS.LEND
    ) {

      inventoryResult =
        lendCylinders({

          gasId,

          quantity:
            qty,

          sourceBucket,

        });

    }
    else {

      inventoryResult =
        returnLoanedCylinders({

          gasId,

          quantity:
            qty,

          destinationBucket,

        });

    }


    const loanRecord = {

      id:
        uid('loan'),

      dayId:
        day.id,

      createdAt,

      gasId,

      gasName:
        getGasName(
          gasId
        ),

      action,

      quantity:
        qty,

      reference:
        normalizeText(
          reference
        ),

      note:
        normalizeText(
          note
        ),

      /*
        Guardamos ambos campos aunque uno no aplique.
        Esto facilita auditoría e historial.
      */

      sourceBucket:
        action ===
          LOAN_ACTIONS.LEND

          ? sourceBucket

          : null,

      destinationBucket:
        action ===
          LOAN_ACTIONS.RETURN

          ? destinationBucket

          : null,

      inventoryBefore:
        cloneData(
          inventoryBefore
        ),

      inventoryAfter:
        cloneData(
          inventoryResult.after
        ),

    };


    getState()
      .loans
      .push(
        loanRecord
      );


    const movement =
      createLoanMovement(
        loanRecord
      );


    loanRecord.movementId =
      movement.id;


    touchState();

    saveState();


    return {

      loan:
        cloneData(
          loanRecord
        ),

      inventory:
        cloneData(
          inventoryResult
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
   ATAJOS PARA PRESTAR
========================================================= */

export function registerLoan({

  gasId,

  quantity,

  reference,

  note = '',

  sourceBucket =
    INVENTORY_BUCKETS.EMPTY,

  createdAt =
    nowIso(),

}) {

  return registerLoanAction({

    gasId,

    action:
      LOAN_ACTIONS.LEND,

    quantity,

    reference,

    note,

    sourceBucket,

    createdAt,

  });

}



/* =========================================================
   ATAJO PARA DEVOLUCIÓN
========================================================= */

export function registerLoanReturn({

  gasId,

  quantity,

  reference,

  note = '',

  destinationBucket =
    INVENTORY_BUCKETS.EMPTY,

  createdAt =
    nowIso(),

}) {

  return registerLoanAction({

    gasId,

    action:
      LOAN_ACTIONS.RETURN,

    quantity,

    reference,

    note,

    destinationBucket,

    createdAt,

  });

}



/* =========================================================
   AJUSTES DE UN DÍA
========================================================= */

export function getAdjustmentsByDay(
  dayId =
    getActiveDay()?.id
) {

  if (!dayId) {

    return [];

  }


  return sortNewestFirst(

    getState()
      .adjustments
      .filter(
        adjustment =>
          adjustment.dayId ===
          dayId
      ),

    item =>
      item.createdAt

  );

}



/* =========================================================
   PRÉSTAMOS DE UN DÍA
========================================================= */

export function getLoansByDay(
  dayId =
    getActiveDay()?.id
) {

  if (!dayId) {

    return [];

  }


  return sortNewestFirst(

    getState()
      .loans
      .filter(
        loan =>
          loan.dayId ===
          dayId
      ),

    item =>
      item.createdAt

  );

}



/* =========================================================
   MOVIMIENTOS RECIENTES DE AJUSTES
========================================================= */

export function getRecentAdjustments(
  limit = 20
) {

  return sortNewestFirst(

    getState()
      .adjustments,

    item =>
      item.createdAt

  ).slice(
    0,
    toNonNegativeInteger(
      limit
    )
  );

}



/* =========================================================
   MOVIMIENTOS RECIENTES DE PRÉSTAMOS
========================================================= */

export function getRecentLoans(
  limit = 20
) {

  return sortNewestFirst(

    getState()
      .loans,

    item =>
      item.createdAt

  ).slice(
    0,
    toNonNegativeInteger(
      limit
    )
  );

}



/* =========================================================
   SALDO DE PRESTADOS POR MARCA
========================================================= */

export function getLoanedSummary() {

  return {

    [GAS_IDS.DURAGAS]:
      getInventoryQuantity(
        GAS_IDS.DURAGAS,
        INVENTORY_BUCKETS.LOANED
      ),

    [GAS_IDS.KING_GAS]:
      getInventoryQuantity(
        GAS_IDS.KING_GAS,
        INVENTORY_BUCKETS.LOANED
      ),

  };

}



/* =========================================================
   HISTORIAL UNIFICADO DE AJUSTES + PRÉSTAMOS
========================================================= */

export function getAdjustmentHistory(
  dayId = null
) {

  const state =
    getState();


  const adjustments =
    state.adjustments

      .filter(
        item =>
          !dayId ||
          item.dayId ===
            dayId
      )

      .map(
        item => ({

          kind:
            'adjustment',

          ...cloneData(
            item
          ),

        })
      );


  const loans =
    state.loans

      .filter(
        item =>
          !dayId ||
          item.dayId ===
            dayId
      )

      .map(
        item => ({

          kind:
            'loan',

          ...cloneData(
            item
          ),

        })
      );


  return sortNewestFirst(

    [
      ...adjustments,
      ...loans,
    ],

    item =>
      item.createdAt

  );

}