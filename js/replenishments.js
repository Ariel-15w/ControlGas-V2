/* =========================================================
   CONTROLGAS
   REPOSICIONES

   Responsabilidades:
   - Registrar llegada del proveedor
   - Registrar cilindros llenos recibidos
   - Registrar vacíos entregados al proveedor
   - Usar el costo correcto según la marca
   - Consultar bolsa antes de pagar
   - Permitir aporte adicional
   - Registrar origen del aporte
   - Pagar la reposición desde la bolsa
   - Registrar transporte
   - Registrar otros costos
   - Actualizar inventario
   - Registrar historial
   - Guardar en localStorage

   IMPORTANTE:

   LA BOLSA DE REPOSICIÓN PAGA EL GAS.

   Transporte y otros costos se registran aparte
   como gastos reales del negocio.

   Ejemplo:

   Gas:              $170.00
   Transporte:         $5.00
   Otro gasto:         $2.00
                      -------
   Total operación:  $177.00

   Bolsa:
   solo disminuye los $170.00 correspondientes
   al costo de reposición del gas.

   Los $7.00 adicionales se registran como gastos.
========================================================= */

import {
  GAS_IDS,
  GAS_ID_LIST,
  GAS_TYPES,
  PAYMENT_METHODS,
  EXTRA_CONTRIBUTION_SOURCES,
  MOVEMENT_TYPES,
  getReplacementCost,
} from './config.js';


import {
  getState,
  getActiveDay,
  getReplenishmentById,
  createMovementBase,
  replaceState,
  touchState,
} from './state.js';


import {
  getInventoryQuantity,
  getInventorySnapshot,
  applyReplenishmentInventory,
} from './inventory.js';


import {
  getGasWalletBalance,
  calculateReplacementCost,
  registerExtraContribution,
  payReplacementFromWallet,
  registerExpense,
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
  sumBy,
  toNonNegativeInteger,
  toNonNegativeNumber,
  uid,
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
   DÍA ACTIVO
========================================================= */

function requireActiveDay() {

  const day =
    getActiveDay();


  if (!day) {

    throw new Error(
      'Debes abrir el día antes de registrar una reposición.'
    );

  }


  return day;

}



/* =========================================================
   PREVISUALIZAR REPOSICIÓN
========================================================= */

/*
  Esta función NO modifica nada.

  app.js podrá ejecutarla cada vez que el usuario
  cambie:

  - marca
  - cantidad
  - vacíos entregados
  - transporte
  - otros costos
  - aporte adicional
*/

export function calculateReplenishmentPreview({

  gasId =
    GAS_IDS.DURAGAS,

  quantity = 0,

  emptyOut = 0,

  transportCost = 0,

  otherCost = 0,

  extraContribution = 0,

}) {

  assertGasType(
    gasId
  );


  const qty =
    toNonNegativeInteger(
      quantity
    );


  const empties =
    toNonNegativeInteger(
      emptyOut
    );


  const transport =
    roundMoney(
      toNonNegativeNumber(
        transportCost
      )
    );


  const other =
    roundMoney(
      toNonNegativeNumber(
        otherCost
      )
    );


  const extra =
    roundMoney(
      toNonNegativeNumber(
        extraContribution
      )
    );


  const unitCost =
    roundMoney(
      getReplacementCost(
        gasId
      )
    );


  const gasCost =
    calculateReplacementCost(
      gasId,
      qty
    );


  const additionalCosts =
    roundMoney(
      transport +
      other
    );


  /*
    Total de dinero involucrado en la operación.

    Esto NO significa que todo salga de la bolsa.
  */

  const totalPaid =
    roundMoney(
      gasCost +
      additionalCosts
    );


  const walletBefore =
    getGasWalletBalance(
      gasId
    );


  /*
    Cuánto faltaría si NO agregáramos
    ningún aporte adicional.
  */

  const extraNeededBeforeContribution =
    roundMoney(
      Math.max(
        0,
        gasCost -
        walletBefore
      )
    );


  const walletAvailable =
    roundMoney(
      walletBefore +
      extra
    );


  /*
    Si sigue faltando dinero después
    del aporte escrito por el usuario.
  */

  const remainingMissing =
    roundMoney(
      Math.max(
        0,
        gasCost -
        walletAvailable
      )
    );


  /*
    La bolsa después de pagar únicamente
    el costo del gas.
  */

  const walletAfter =
    roundMoney(
      Math.max(
        0,
        walletAvailable -
        gasCost
      )
    );


  const currentEmpty =
    getInventoryQuantity(
      gasId,
      'empty'
    );


  const currentFull =
    getInventoryQuantity(
      gasId,
      'full'
    );


  /*
    Diferencia de cilindros.

    Ejemplo:

    llegan 150 llenos
    salen 120 vacíos

    diferencia = +30

    No se convierte automáticamente en deuda.
    Solo queda registrada para auditoría.
  */

  const cylinderDifference =
    qty -
    empties;


  return {

    gasId,

    gasName:
      getGasName(
        gasId
      ),

    quantity:
      qty,

    emptyOut:
      empties,

    unitCost,

    gasCost,

    transportCost:
      transport,

    otherCost:
      other,

    additionalCosts,

    totalPaid,

    walletBefore,

    extraContribution:
      extra,

    extraNeededBeforeContribution,

    walletAvailable,

    remainingMissing,

    walletAfter,

    inventory: {

      fullBefore:
        currentFull,

      fullAfter:
        currentFull +
        qty,

      emptyBefore:
        currentEmpty,

      emptyAfter:
        currentEmpty -
        empties,

    },

    cylinderDifference,

    hasEnoughWallet:
      remainingMissing <= 0,

    hasEnoughEmpties:
      empties <=
      currentEmpty,

  };

}



/* =========================================================
   VALIDAR ORIGEN DE APORTE
========================================================= */

function isValidContributionSource(
  source
) {

  return Object.values(
    EXTRA_CONTRIBUTION_SOURCES
  ).includes(
    source
  );

}



/* =========================================================
   VALIDAR REPOSICIÓN
========================================================= */

export function validateReplenishment({

  gasId,

  quantity,

  emptyOut,

  transportCost = 0,

  otherCost = 0,

  extraContribution = 0,

  extraContributionSource = '',

}) {

  const errors = [];


  if (!getActiveDay()) {

    errors.push(
      'Debes abrir el día antes de registrar una reposición.'
    );

  }


  if (
    !GAS_ID_LIST.includes(
      gasId
    )
  ) {

    errors.push(
      'Debes seleccionar una marca válida.'
    );


    return {

      valid: false,

      errors,

      preview: null,

    };

  }


  const qty =
    toNonNegativeInteger(
      quantity
    );


  if (
    qty <= 0
  ) {

    errors.push(
      'La cantidad repuesta debe ser mayor que cero.'
    );

  }


  const empties =
    toNonNegativeInteger(
      emptyOut
    );


  const transport =
    toNonNegativeNumber(
      transportCost
    );


  const other =
    toNonNegativeNumber(
      otherCost
    );


  const extra =
    toNonNegativeNumber(
      extraContribution
    );


  if (
    transport < 0 ||
    other < 0 ||
    extra < 0
  ) {

    errors.push(
      'Los valores monetarios no pueden ser negativos.'
    );

  }


  if (
    extra > 0 &&
    !isValidContributionSource(
      extraContributionSource
    )
  ) {

    errors.push(
      'Debes indicar de dónde sale el aporte adicional.'
    );

  }


  const preview =
    calculateReplenishmentPreview({

      gasId,

      quantity:
        qty,

      emptyOut:
        empties,

      transportCost:
        transport,

      otherCost:
        other,

      extraContribution:
        extra,

    });


  if (
    !preview.hasEnoughEmpties
  ) {

    errors.push(
      `Intentas entregar ${preview.emptyOut} vacíos de ${preview.gasName}, pero solo existen ${preview.inventory.emptyBefore}.`
    );

  }


  if (
    !preview.hasEnoughWallet
  ) {

    errors.push(
      `A la bolsa ${preview.gasName} todavía le faltan $${preview.remainingMissing.toFixed(2)} para pagar esta reposición.`
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
   CREAR MOVIMIENTO GENERAL
========================================================= */

function createReplenishmentMovement(
  replenishment
) {

  const movement =
    createMovementBase({

      id:
        uid('mov'),

      dayId:
        replenishment.dayId,

      type:
        MOVEMENT_TYPES
          .REPLENISHMENT,

      createdAt:
        replenishment.createdAt,

      gasId:
        replenishment.gasId,

      referenceId:
        replenishment.id,

      reference:
        getGasName(
          replenishment.gasId
        ),

      detail:
        `Reposición: ${replenishment.quantity} lleno(s), ${replenishment.emptyOut} vacío(s) entregado(s)`,

      /*
        El valor mostrado aquí es el costo
        TOTAL de la operación.

        No se utiliza para volver a calcular
        la ganancia.
      */

      value:
        -replenishment.totalPaid,

      metadata: {

        replenishmentId:
          replenishment.id,

        quantity:
          replenishment.quantity,

        emptyOut:
          replenishment.emptyOut,

        unitCost:
          replenishment.unitCost,

        gasCost:
          replenishment.gasCost,

        transportCost:
          replenishment.transportCost,

        otherCost:
          replenishment.otherCost,

        additionalCosts:
          replenishment.additionalCosts,

        totalPaid:
          replenishment.totalPaid,

        walletBefore:
          replenishment.walletBefore,

        extraContribution:
          replenishment.extraContribution,

        extraContributionSource:
          replenishment
            .extraContributionSource,

        walletAfter:
          replenishment.walletAfter,

        cylinderDifference:
          replenishment
            .cylinderDifference,

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
   REGISTRAR REPOSICIÓN
========================================================= */

export function registerReplenishment({

  gasId =
    GAS_IDS.DURAGAS,

  quantity,

  emptyOut = 0,

  transportCost = 0,

  otherCost = 0,

  extraContribution = 0,

  extraContributionSource = '',

  /*
    Por ahora el formulario no pide una forma
    de pago aparte para transporte.

    Se considera efectivo de caja.
  */

  additionalCostPaymentMethod =
    PAYMENT_METHODS.CASH,

  note = '',

  createdAt =
    nowIso(),

}) {

  /*
    La reposición afecta:

    - inventario
    - bolsa
    - aportes
    - gastos
    - historial

    Por eso trabajamos de forma atómica.
  */

  const stateBefore =
    cloneData(
      getState()
    );


  try {

    const day =
      requireActiveDay();


    const validation =
      validateReplenishment({

        gasId,

        quantity,

        emptyOut,

        transportCost,

        otherCost,

        extraContribution,

        extraContributionSource,

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


    const replenishmentId =
      uid('replenishment');



    /* =====================================================
       1. INVENTARIO
    ===================================================== */

    const inventoryResult =
      applyReplenishmentInventory({

        gasId,

        quantity:
          preview.quantity,

        emptyOut:
          preview.emptyOut,

      });



    /* =====================================================
       2. APORTE ADICIONAL
    ===================================================== */

    let contributionMovement =
      null;


    if (
      preview.extraContribution > 0
    ) {

      contributionMovement =
        registerExtraContribution({

          gasId,

          amount:
            preview
              .extraContribution,

          source:
            extraContributionSource,

          dayId:
            day.id,

          referenceId:
            replenishmentId,

          note:
            `Aporte adicional para reposición de ${getGasName(gasId)}`,

          createdAt,

        });

    }



    /*
      Volvemos a consultar la bolsa después
      de registrar el aporte.
    */

    const walletAvailable =
      getGasWalletBalance(
        gasId
      );


    if (
      walletAvailable + 0.005 <
      preview.gasCost
    ) {

      throw new Error(
        `La bolsa ${getGasName(gasId)} no tiene suficiente dinero para pagar el gas.`
      );

    }



    /* =====================================================
       3. PAGAR GAS DESDE LA BOLSA
    ===================================================== */

    const walletPayment =
      payReplacementFromWallet({

        gasId,

        amount:
          preview.gasCost,

        dayId:
          day.id,

        replenishmentId,

        createdAt,

      });



    const walletAfter =
      getGasWalletBalance(
        gasId
      );



    /* =====================================================
       4. REGISTRAR TRANSPORTE
    ===================================================== */

    let transportExpense =
      null;


    if (
      preview.transportCost > 0
    ) {

      transportExpense =
        registerExpense({

          amount:
            preview.transportCost,

          gasId,

          category:
            'replenishment_transport',

          paymentMethod:
            additionalCostPaymentMethod,

          dayId:
            day.id,

          referenceId:
            replenishmentId,

          note:
            `Transporte de reposición ${getGasName(gasId)}`,

          createdAt,

        });

    }



    /* =====================================================
       5. REGISTRAR OTROS COSTOS
    ===================================================== */

    let otherExpense =
      null;


    if (
      preview.otherCost > 0
    ) {

      otherExpense =
        registerExpense({

          amount:
            preview.otherCost,

          gasId,

          category:
            'replenishment_other',

          paymentMethod:
            additionalCostPaymentMethod,

          dayId:
            day.id,

          referenceId:
            replenishmentId,

          note:
            `Costo adicional de reposición ${getGasName(gasId)}`,

          createdAt,

        });

    }



    /* =====================================================
       6. CREAR REGISTRO DE REPOSICIÓN
    ===================================================== */

    const replenishment = {

      id:
        replenishmentId,

      dayId:
        day.id,

      createdAt,

      gasId,

      gasName:
        getGasName(
          gasId
        ),

      quantity:
        preview.quantity,

      emptyOut:
        preview.emptyOut,


      /*
        Guardamos el costo unitario utilizado
        en esta operación.

        Aunque el costo cambie en el futuro,
        esta reposición conservará su valor histórico.
      */

      unitCost:
        preview.unitCost,

      gasCost:
        preview.gasCost,

      transportCost:
        preview.transportCost,

      otherCost:
        preview.otherCost,

      additionalCosts:
        preview.additionalCosts,

      /*
        Total económico de la operación.
      */

      totalPaid:
        preview.totalPaid,


      /*
        Dinero de la bolsa utilizado
        exclusivamente para comprar el gas.
      */

      walletPayment:
        preview.gasCost,

      walletBefore:
        preview.walletBefore,

      extraContribution:
        preview.extraContribution,

      extraContributionSource:
        preview.extraContribution > 0

          ? extraContributionSource

          : null,

      walletAvailableBeforePayment:
        roundMoney(

          preview.walletBefore

          +

          preview.extraContribution

        ),

      walletAfter:
        roundMoney(
          walletAfter
        ),


      /*
        Diferencia informativa entre llenos que
        llegaron y vacíos que salieron.
      */

      cylinderDifference:
        preview.cylinderDifference,


      additionalCostPaymentMethod,


      inventoryBefore:
        cloneData(
          inventoryResult.before
        ),

      inventoryAfter:
        cloneData(
          inventoryResult.after
        ),


      contributionMovementId:
        contributionMovement?.id ??
        null,

      walletPaymentMovementId:
        walletPayment?.id ??
        null,

      transportExpenseId:
        transportExpense?.id ??
        null,

      otherExpenseId:
        otherExpense?.id ??
        null,

      note:
        normalizeText(
          note
        ),

    };


    getState()
      .replenishments
      .push(
        replenishment
      );



    /* =====================================================
       7. MOVIMIENTO GENERAL
    ===================================================== */

    const movement =
      createReplenishmentMovement(
        replenishment
      );


    replenishment.movementId =
      movement.id;



    touchState();



    /* =====================================================
       8. GUARDAR
    ===================================================== */

    saveState();



    return {

      replenishment:
        cloneData(
          replenishment
        ),

      inventory:
        cloneData(
          inventoryResult
        ),

      wallet: {

        before:
          preview.walletBefore,

        contribution:
          preview.extraContribution,

        paid:
          preview.gasCost,

        after:
          walletAfter,

      },

      expenses: {

        transport:
          transportExpense
            ? cloneData(
                transportExpense
              )
            : null,

        other:
          otherExpense
            ? cloneData(
                otherExpense
              )
            : null,

      },

      preview:
        cloneData(
          preview
        ),

    };

  }
  catch (error) {

    /*
      Si cualquier paso falla,
      restauramos TODO el estado.
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
        al menos conservamos la restauración
        dentro de la memoria actual.
      */

    }


    throw error;

  }

}



/* =========================================================
   OBTENER REPOSICIÓN
========================================================= */

export function getReplenishmentDetail(
  replenishmentId
) {

  const replenishment =
    getReplenishmentById(
      replenishmentId
    );


  if (!replenishment) {

    return null;

  }


  const state =
    getState();


  const relatedMovements =
    state.movements.filter(
      movement => {

        return (

          movement.referenceId ===
            replenishmentId

          ||

          movement.metadata
            ?.replenishmentId ===
            replenishmentId

        );

      }
    );


  const expenses =
    state.expenses.filter(
      expense =>
        expense.referenceId ===
        replenishmentId
    );


  const walletMovements =
    state.walletMovements.filter(
      movement =>
        movement.referenceId ===
        replenishmentId
    );


  return {

    replenishment:
      cloneData(
        replenishment
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
        relatedMovements
      ),

  };

}



/* =========================================================
   REPOSICIONES DE UN DÍA
========================================================= */

export function getReplenishmentsByDay(
  dayId =
    getActiveDay()?.id
) {

  if (!dayId) {

    return [];

  }


  return sortNewestFirst(

    getState()
      .replenishments
      .filter(
        item =>
          item.dayId ===
          dayId
      ),

    item =>
      item.createdAt

  );

}



/* =========================================================
   REPOSICIONES RECIENTES
========================================================= */

export function getRecentReplenishments(
  limit = 5
) {

  const safeLimit =
    Math.max(
      0,
      toNonNegativeInteger(
        limit
      )
    );


  return sortNewestFirst(

    getState()
      .replenishments,

    item =>
      item.createdAt

  ).slice(
    0,
    safeLimit
  );

}



/* =========================================================
   RESUMEN DE REPOSICIONES
========================================================= */

export function getReplenishmentSummary(
  items =
    getState().replenishments
) {

  const source =
    Array.isArray(items)
      ? items
      : [];


  const byGas = {

    [GAS_IDS.DURAGAS]: {

      operations: 0,

      quantity: 0,

      emptyOut: 0,

      gasCost: 0,

      transportCost: 0,

      otherCost: 0,

      additionalCosts: 0,

      totalPaid: 0,

      extraContributions: 0,

    },


    [GAS_IDS.KING_GAS]: {

      operations: 0,

      quantity: 0,

      emptyOut: 0,

      gasCost: 0,

      transportCost: 0,

      otherCost: 0,

      additionalCosts: 0,

      totalPaid: 0,

      extraContributions: 0,

    },

  };


  source.forEach(
    item => {

      if (
        !byGas[
          item.gasId
        ]
      ) {

        return;

      }


      const target =
        byGas[
          item.gasId
        ];


      target.operations +=
        1;


      target.quantity +=
        toNonNegativeInteger(
          item.quantity
        );


      target.emptyOut +=
        toNonNegativeInteger(
          item.emptyOut
        );


      target.gasCost =
        roundMoney(

          target.gasCost

          +

          toNonNegativeNumber(
            item.gasCost
          )

        );


      target.transportCost =
        roundMoney(

          target.transportCost

          +

          toNonNegativeNumber(
            item.transportCost
          )

        );


      target.otherCost =
        roundMoney(

          target.otherCost

          +

          toNonNegativeNumber(
            item.otherCost
          )

        );


      target.additionalCosts =
        roundMoney(

          target.additionalCosts

          +

          toNonNegativeNumber(
            item.additionalCosts
          )

        );


      target.totalPaid =
        roundMoney(

          target.totalPaid

          +

          toNonNegativeNumber(
            item.totalPaid
          )

        );


      target.extraContributions =
        roundMoney(

          target.extraContributions

          +

          toNonNegativeNumber(
            item.extraContribution
          )

        );

    }
  );


  const totals = {

    operations:
      byGas[
        GAS_IDS.DURAGAS
      ].operations

      +

      byGas[
        GAS_IDS.KING_GAS
      ].operations,


    quantity:
      byGas[
        GAS_IDS.DURAGAS
      ].quantity

      +

      byGas[
        GAS_IDS.KING_GAS
      ].quantity,


    gasCost:
      roundMoney(

        byGas[
          GAS_IDS.DURAGAS
        ].gasCost

        +

        byGas[
          GAS_IDS.KING_GAS
        ].gasCost

      ),


    additionalCosts:
      roundMoney(

        byGas[
          GAS_IDS.DURAGAS
        ].additionalCosts

        +

        byGas[
          GAS_IDS.KING_GAS
        ].additionalCosts

      ),


    totalPaid:
      roundMoney(

        byGas[
          GAS_IDS.DURAGAS
        ].totalPaid

        +

        byGas[
          GAS_IDS.KING_GAS
        ].totalPaid

      ),


    extraContributions:
      roundMoney(

        byGas[
          GAS_IDS.DURAGAS
        ].extraContributions

        +

        byGas[
          GAS_IDS.KING_GAS
        ].extraContributions

      ),

  };


  return {

    byGas,

    totals,

  };

}



/* =========================================================
   RESUMEN DE REPOSICIONES DEL DÍA
========================================================= */

export function getCurrentDayReplenishmentSummary() {

  const day =
    getActiveDay();


  if (!day) {

    return getReplenishmentSummary(
      []
    );

  }


  return getReplenishmentSummary(

    getState()
      .replenishments
      .filter(
        item =>
          item.dayId ===
          day.id
      )

  );

}