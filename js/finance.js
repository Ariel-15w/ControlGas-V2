/* =========================================================
   CONTROLGAS
   FINANZAS

   Responsabilidades:
   - Calcular ventas por marca
   - Calcular costo de reposición
   - Calcular ganancia por marca
   - Administrar Bolsa Duragas
   - Administrar Bolsa King Gas
   - Registrar aportes adicionales
   - Registrar gastos
   - Diferenciar:
       venta
       cobrado
       efectivo
       transferencia
       dinero apartado
       ganancia
   - Calcular caja esperada
   - Preparar resumen financiero del día

   REGLA CONTABLE IMPORTANTE:

   El pago al proveedor por el gas NO vuelve a descontarse
   como gasto de la ganancia si ese costo ya fue separado
   al momento de la venta.

   Ejemplo:

   Venta Duragas:        $2.50
   Costo reposición:    -$1.70
   Ganancia:             $0.80

   Cuando después pagamos esos $1.70 al proveedor,
   simplemente utilizamos el dinero que ya estaba
   apartado en la bolsa.

   No volvemos a restar $1.70 de la ganancia.
========================================================= */
import {
  GAS_IDS,
  GAS_ID_LIST,
  GAS_TYPES,
  PAYMENT_METHODS,
  MOVEMENT_TYPES,
  WALLET_MOVEMENT_TYPES,
  EXTRA_CONTRIBUTION_SOURCES,
  FINANCIAL_MODES,
  GENERAL_RESERVE_PER_UNIT,
  getReplacementCost,
} from './config.js';

import {
  getState,
  getActiveDay,
  getWalletBalance,
  getGeneralWalletBalance,
  getSaleById,
  getSaleLines,
  getSupplierPaymentById,
  createMovementBase,
  createProfitDistributionRecord,
  touchState,
} from './state.js';

import {
  cloneData,
  nowIso,
  roundMoney,
  sumBy,
  toNumber,
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
      `Marca inválida: ${gasId}`
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
   OBTENER BOLSAS
========================================================= */

export function getWallets() {

  return getState().wallets;

}
export function getWalletsSnapshot() {

  return cloneData(
    getState().wallets
  );

}

/* =========================================================
   MÉTODO FINANCIERO DE LA JORNADA
========================================================= */

export function getFinancialMode(
  dayId =
    getActiveDay()?.id ??
    null
) {

  if (!dayId) {

    return FINANCIAL_MODES.EXACT;

  }


  const day =
    getState()
      .days
      .find(
        item =>
          item.id ===
          dayId
      );


  return (
    day?.financialMode ??
    FINANCIAL_MODES.EXACT
  );

}
/* =========================================================
   RESERVA UNITARIA SEGÚN MÉTODO FINANCIERO
========================================================= */

export function getSaleReserveUnitCost(
  gasId,
  dayId =
    getActiveDay()?.id ??
    null
) {

  assertGasType(
    gasId
  );


  const mode =
    getFinancialMode(
      dayId
    );


  if (
    mode ===
    FINANCIAL_MODES.GENERAL
  ) {

    return roundMoney(
      GENERAL_RESERVE_PER_UNIT
    );

  }


  return roundMoney(
    getReplacementCost(
      gasId
    )
  );

}
/* =========================================================
   SALDO DE BOLSA
========================================================= */

export function getGasWalletBalance(
  gasId
) {

  assertGasType(
    gasId
  );


  return roundMoney(
    getWalletBalance(
      gasId
    )
  );

}



/* =========================================================
   EQUIVALENCIA DE LA BOLSA
========================================================= */

/*
  Ejemplo:

  Bolsa Duragas:
  $170

  $170 / $1.70 = 100 reposiciones.
*/

export function getWalletEquivalentUnits(
  gasId
) {

  assertGasType(
    gasId
  );


  const balance =
    getGasWalletBalance(
      gasId
    );


  const cost =
    getReplacementCost(
      gasId
    );


  if (
    cost <= 0
  ) {

    return 0;

  }


  return Math.floor(
    balance /
    cost
  );

}

/* =========================================================
   DESGLOSE DE BOLSA POR JORNADA
========================================================= */

/*
  La bolsa sigue siendo UNA sola bolsa real.

  Pero para mostrarla y usarla correctamente
  distinguimos el origen del dinero:

  1. Saldo que ya existía al abrir el día.
  2. Aportes adicionales del día.
  3. Reserva generada durante el día.

  REGLA DE CONSUMO:

  Al pagar una reposición se utiliza:

  1. Primero el saldo anterior.
  2. Después los aportes adicionales.
  3. Finalmente la reserva generada hoy.
*/
export function getWalletDayBreakdown(

  gasId,

  dayId =
    getActiveDay()?.id ??
    null

) {

  assertGasType(
    gasId
  );


  const state =
    getState();


  const currentBalance =
    getGasWalletBalance(
      gasId
    );


  /*
    Si no hay jornada activa,
    todo el dinero existente se considera
    saldo acumulado/anterior.
  */

  if (
    !dayId
  ) {

    return {

      gasId,

      openingBalance:
        currentBalance,

      previousRemaining:
        currentBalance,

      todayReserveAdded:
        0,

      todayReserveRemaining:
        0,

      contributionsAdded:
        0,

      contributionsRemaining:
        0,

      spentToday:
        0,

      usedFromPrevious:
        0,

      usedFromToday:
        0,

      usedFromContributions:
        0,

      balance:
        currentBalance,

    };

  }


  const day =
    state.days.find(
      item =>
        item.id ===
        dayId
    );


  /*
    Movimientos de ESTA bolsa durante
    ESTA jornada.

    IMPORTANTE:
    mantenemos el orden del array porque
    corresponde al orden real en que fueron
    registrados los movimientos.
  */

  const movements =
    state.walletMovements.filter(
      movement =>

        movement.dayId ===
          dayId

        &&

        movement.gasId ===
          gasId
    );



  /* =====================================================
     SALDO QUE EXISTÍA AL ABRIR EL DÍA
  ===================================================== */

  let openingBalance;


  if (
    day?.opening?.wallets?.[gasId] !==
      undefined
  ) {

    openingBalance =
      roundMoney(
        toNonNegativeNumber(
          day.opening.wallets[gasId]
        )
      );

  }
  else {

    /*
      Compatibilidad con datos antiguos.

      Si existe un movimiento de saldo inicial,
      utilizamos ese valor.
    */

    const openingMovement =
      movements.find(
        movement =>

          movement.type ===
            WALLET_MOVEMENT_TYPES
              .OPENING_BALANCE

          &&

          movement.amount > 0
      );


    if (
      openingMovement
    ) {

      openingBalance =
        roundMoney(
          toNonNegativeNumber(
            openingMovement.amount
          )
        );

    }
    else {

      /*
        Última protección para respaldos antiguos:

        saldo al abrir =
        saldo actual - movimiento neto del día
      */

      const netMovement =
        roundMoney(
          sumBy(
            movements,
            movement =>
              toNumber(
                movement.amount
              )
          )
        );


      openingBalance =
        roundMoney(
          Math.max(
            0,
            currentBalance -
            netMovement
          )
        );

    }

  }



  /* =====================================================
     BOLSILLOS INTERNOS

     Todos siguen formando UNA sola bolsa real.
  ===================================================== */

  let previousRemaining =
    openingBalance;


  let todayReserveAdded =
    0;


  let todayReserveRemaining =
    0;


  let contributionsAdded =
    0;


  let contributionsRemaining =
    0;


  let spentToday =
    0;


  let usedFromPrevious =
    0;


  let usedFromToday =
    0;


  let usedFromContributions =
    0;



  /* =====================================================
     RECORRER MOVIMIENTOS EN ORDEN REAL
  ===================================================== */

  movements.forEach(
    movement => {

      const amount =
        roundMoney(
          toNumber(
            movement.amount
          )
        );


      /*
        El saldo inicial ya está incluido
        en openingBalance.

        No debemos volver a sumarlo.
      */

      if (
        movement.type ===
          WALLET_MOVEMENT_TYPES
            .OPENING_BALANCE
      ) {

        return;

      }



      /* ===============================================
         DINERO GENERADO POR VENTAS / COBROS
      =============================================== */

      if (
        amount > 0

        &&

        movement.type ===
          WALLET_MOVEMENT_TYPES
            .SALE_RESERVE
      ) {

        todayReserveAdded =
          roundMoney(
            todayReserveAdded +
            amount
          );


        todayReserveRemaining =
          roundMoney(
            todayReserveRemaining +
            amount
          );


        return;

      }



      /* ===============================================
         APORTE ADICIONAL
      =============================================== */

      if (
        amount > 0

        &&

        movement.type ===
          WALLET_MOVEMENT_TYPES
            .EXTRA_CONTRIBUTION
      ) {

        contributionsAdded =
          roundMoney(
            contributionsAdded +
            amount
          );


        contributionsRemaining =
          roundMoney(
            contributionsRemaining +
            amount
          );


        return;

      }



      /*
        Solo las salidas necesitan distribuirse
        entre los diferentes orígenes.
      */

      if (
        amount >= 0
      ) {

        return;

      }


      let remainingSpend =
        roundMoney(
          Math.abs(
            amount
          )
        );


      spentToday =
        roundMoney(
          spentToday +
          remainingSpend
        );



      /* ===============================================
         1. SALDO ANTERIOR
      =============================================== */

      const fromPrevious =
        roundMoney(
          Math.min(
            previousRemaining,
            remainingSpend
          )
        );


      previousRemaining =
        roundMoney(
          Math.max(
            0,
            previousRemaining -
            fromPrevious
          )
        );


      usedFromPrevious =
        roundMoney(
          usedFromPrevious +
          fromPrevious
        );


      remainingSpend =
        roundMoney(
          Math.max(
            0,
            remainingSpend -
            fromPrevious
          )
        );

/* ===============================================
   2. APORTES ADICIONALES
=============================================== */

const fromContributions =
  roundMoney(
    Math.min(
      contributionsRemaining,
      remainingSpend
    )
  );


contributionsRemaining =
  roundMoney(
    Math.max(
      0,
      contributionsRemaining -
      fromContributions
    )
  );


usedFromContributions =
  roundMoney(
    usedFromContributions +
    fromContributions
  );


remainingSpend =
  roundMoney(
    Math.max(
      0,
      remainingSpend -
      fromContributions
    )
  );



/* ===============================================
   3. RESERVA GENERADA HOY
=============================================== */

const fromToday =
  roundMoney(
    Math.min(
      todayReserveRemaining,
      remainingSpend
    )
  );


todayReserveRemaining =
  roundMoney(
    Math.max(
      0,
      todayReserveRemaining -
      fromToday
    )
  );


usedFromToday =
  roundMoney(
    usedFromToday +
    fromToday
  );


remainingSpend =
  roundMoney(
    Math.max(
      0,
      remainingSpend -
      fromToday
    )
  );

    }
  );



  /* =====================================================
     PROTECCIÓN PARA DATOS ANTIGUOS / CORRECCIONES
  ===================================================== */

  const reconstructedBalance =
    roundMoney(

      previousRemaining

      +

      todayReserveRemaining

      +

      contributionsRemaining

    );


  const difference =
    roundMoney(
      currentBalance -
      reconstructedBalance
    );


  /*
    Si existe dinero no clasificado debido
    a una versión antigua del sistema,
    lo tratamos como saldo previo para no
    perder disponibilidad de la bolsa.
  */

  if (
    difference > 0.005
  ) {

    previousRemaining =
      roundMoney(
        previousRemaining +
        difference
      );

    openingBalance =
      roundMoney(
        openingBalance +
        difference
      );

  }



  return {

    gasId,

    openingBalance,

    previousRemaining,

    todayReserveAdded,

    todayReserveRemaining,

    contributionsAdded,

    contributionsRemaining,

    spentToday,

    usedFromPrevious,

    usedFromToday,

    usedFromContributions,

    /*
      Saldo REAL de la bolsa.
    */

    balance:
      currentBalance,

  };

}
/* =========================================================
   ESTABLECER BOLSA
========================================================= */

/*
  Principalmente para:
  - migraciones
  - restauraciones
  - correcciones controladas

  Las operaciones normales deberían usar
  addMoneyToWallet() o spendWalletMoney().
*/

export function setWalletBalance(
  gasId,
  amount
) {

  assertGasType(
    gasId
  );


  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  getState().wallets[gasId] =
    value;


  touchState();


  return value;

}



/* =========================================================
   CREAR MOVIMIENTO GENERAL
========================================================= */

function pushGeneralMovement({

  dayId,

  type,

  gasId = null,

  referenceId = null,

  reference = '',

  detail = '',

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

      gasId,

      referenceId,

      reference,

      detail,

      value,

      metadata,

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
   REGISTRAR MOVIMIENTO DE BOLSA
========================================================= */

function createWalletMovement({

  gasId,

  amount,

  type,

  dayId = null,

  referenceId = null,

  note = '',

  source = null,

  paymentMethod = null,

  impactsCash = false,

  metadata = {},

  createdAt =
    nowIso(),

}) {

  assertGasType(
    gasId
  );


  const state =
    getState();


  const currentBalance =
    getGasWalletBalance(
      gasId
    );


  const movementAmount =
    roundMoney(
      toNumber(
        amount
      )
    );


  const balanceAfter =
    roundMoney(
      currentBalance +
      movementAmount
    );


  if (
    balanceAfter < -0.001
  ) {

    throw new Error(
      `La bolsa ${getGasName(gasId)} no tiene suficiente dinero.`
    );

  }


  const walletMovement = {

    id:
      uid('wallet'),

    dayId:
      dayId ??
      getActiveDay()?.id ??
      null,

    gasId,

    type,

    amount:
      movementAmount,

    balanceBefore:
      currentBalance,

    balanceAfter:
      Math.max(
        0,
        balanceAfter
      ),

    referenceId,

    source,

    paymentMethod,

    impactsCash:
      Boolean(
        impactsCash
      ),

    note:
      String(
        note ?? ''
      ),

    metadata:
      cloneData(
        metadata
      ),

    createdAt,

  };


  state.wallets[gasId] =
    walletMovement
      .balanceAfter;


  state.walletMovements.push(
    walletMovement
  );


  pushGeneralMovement({

    dayId:
      walletMovement.dayId,

    type:
      MOVEMENT_TYPES.WALLET,

    gasId,

    referenceId,

    reference:
      getGasName(
        gasId
      ),

    detail:
      note ||
      (
        movementAmount >= 0

          ? `Ingreso a bolsa ${getGasName(gasId)}`

          : `Salida de bolsa ${getGasName(gasId)}`
      ),

    value:
      movementAmount,

    metadata: {

      walletMovementId:
        walletMovement.id,

      walletMovementType:
        type,

      balanceBefore:
        walletMovement
          .balanceBefore,

      balanceAfter:
        walletMovement
          .balanceAfter,

      source,

      paymentMethod,

      impactsCash:
        Boolean(
          impactsCash
        ),

      ...metadata,

    },

    createdAt,

  });


  touchState();


  return walletMovement;

}



/* =========================================================
   AGREGAR DINERO A UNA BOLSA
========================================================= */

export function addMoneyToWallet({

  gasId,

  amount,

  type =
    WALLET_MOVEMENT_TYPES
      .SALE_RESERVE,

  dayId = null,

  referenceId = null,

  note = '',

  source = null,

  paymentMethod = null,

  impactsCash = false,

  metadata = {},

  createdAt =
    nowIso(),

}) {

  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  if (
    value <= 0
  ) {

    return null;

  }


  return createWalletMovement({

    gasId,

    amount:
      value,

    type,

    dayId,

    referenceId,

    note,

    source,

    paymentMethod,

    impactsCash,

    metadata,

    createdAt,

  });

}

/* =========================================================
   AGREGAR DINERO A LA BOLSA GENERAL
========================================================= */

export function addMoneyToGeneralWallet({

  amount,

  type =
    WALLET_MOVEMENT_TYPES
      .SALE_RESERVE,

  dayId = null,

  referenceId = null,

  note = '',

  source = null,

  paymentMethod = null,

  impactsCash = false,

  metadata = {},

  createdAt =
    nowIso(),

}) {

  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  if (
    value <= 0
  ) {

    return null;

  }


  const state =
    getState();


  const currentBalance =
    getGeneralWalletBalance();


  const effectiveDayId =
    dayId ??
    getActiveDay()?.id ??
    null;


  const movement = {

    id:
      uid('wallet'),

    dayId:
      effectiveDayId,

    gasId:
      null,

    generalWallet:
      true,

    type,

    amount:
      value,

    balanceBefore:
      currentBalance,

    balanceAfter:
      roundMoney(
        currentBalance +
        value
      ),

    referenceId,

    source,

    paymentMethod,

    impactsCash:
      Boolean(
        impactsCash
      ),

    note:
      String(
        note ?? ''
      ),

    metadata:
      cloneData({
        ...(metadata ?? {}),
        generalWallet: true,
      }),

    createdAt,

  };


  state.generalWallet =
    movement.balanceAfter;


  state.walletMovements.push(
    movement
  );


  pushGeneralMovement({

    dayId:
      effectiveDayId,

    type:
      MOVEMENT_TYPES.WALLET,

    gasId:
      null,

    referenceId,

    reference:
      'Bolsa General',

    detail:
      note ||
      'Ingreso a Bolsa General',

    value,

    metadata: {

      walletMovementId:
        movement.id,

      walletMovementType:
        type,

      balanceBefore:
        currentBalance,

      balanceAfter:
        movement.balanceAfter,

      source,

      paymentMethod,

      impactsCash:
        Boolean(
          impactsCash
        ),

      generalWallet:
        true,

      ...(metadata ?? {}),

    },

    createdAt,

  });


  touchState();


  return movement;

}

/* =========================================================
   RETIRAR DINERO DE LA BOLSA GENERAL
========================================================= */

export function spendGeneralWalletMoney({

  amount,

  type =
    WALLET_MOVEMENT_TYPES
      .REPLENISHMENT_PAYMENT,

  dayId = null,

  referenceId = null,

  note = '',

 metadata = {},

allowCommitted =
  false,

createdAt =
  nowIso(),
}) {

  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  if (
    value <= 0
  ) {

    return null;

  }


  const state =
    getState();

const currentBalance =
  getGeneralWalletBalance();

const committed =
  getSupplierCommittedAmount({
    financialMode:
      FINANCIAL_MODES.GENERAL,
  });
   
const available =
  allowCommitted

    ? currentBalance

    : roundMoney(
        Math.max(
          0,
          currentBalance -
          committed
        )
      );


if (
  value >
  available + 0.005
) {

  throw new Error(
    `La Bolsa General tiene $${currentBalance.toFixed(2)}, pero solo $${available.toFixed(2)} están disponibles. Hay $${committed.toFixed(2)} comprometidos con el proveedor.`
  );

}

  const effectiveDayId =
    dayId ??
    getActiveDay()?.id ??
    null;


  const balanceAfter =
    roundMoney(
      Math.max(
        0,
        currentBalance -
        value
      )
    );


  const movement = {

    id:
      uid('wallet'),

    dayId:
      effectiveDayId,

    gasId:
      null,

    generalWallet:
      true,

    type,

    amount:
      -value,

    balanceBefore:
      currentBalance,

    balanceAfter,

    referenceId,

    source:
      'general_wallet',

    paymentMethod:
      null,

    impactsCash:
      false,

    note:
      String(
        note ?? ''
      ),

    metadata:
      cloneData({
        ...(metadata ?? {}),
        generalWallet: true,
      }),

    createdAt,

  };


  state.generalWallet =
    balanceAfter;


  state.walletMovements.push(
    movement
  );


  pushGeneralMovement({

    dayId:
      effectiveDayId,

    type:
      MOVEMENT_TYPES.WALLET,

    gasId:
      null,

    referenceId,

    reference:
      'Bolsa General',

    detail:
      note ||
      'Salida de Bolsa General',

    value:
      -value,

    metadata: {

      walletMovementId:
        movement.id,

      walletMovementType:
        type,

      balanceBefore:
        currentBalance,

      balanceAfter,

      impactsCash:
        false,

      generalWallet:
        true,

      ...(metadata ?? {}),

    },

    createdAt,

  });


  touchState();


  return movement;

}

/* =========================================================
   RETIRAR DINERO DE UNA BOLSA
========================================================= */

export function spendWalletMoney({

  gasId,

  amount,

  type =
    WALLET_MOVEMENT_TYPES
      .REPLENISHMENT_PAYMENT,

  dayId = null,

  referenceId = null,

  note = '',

metadata = {},

allowCommitted =
  false,

createdAt =
  nowIso(),
}) {

  assertGasType(
    gasId
  );


  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  if (
    value <= 0
  ) {

    return null;

  }


const currentBalance =
  getGasWalletBalance(
    gasId
  );

const committed =
  getSupplierCommittedAmount({
    gasId,
    financialMode:
      FINANCIAL_MODES.EXACT,
  });

const available =
  allowCommitted

    ? currentBalance

    : roundMoney(
        Math.max(
          0,
          currentBalance -
          committed
        )
      );


if (
  value >
  available + 0.005
) {

  throw new Error(
    `La bolsa ${getGasName(gasId)} tiene $${currentBalance.toFixed(2)}, pero solo $${available.toFixed(2)} están disponibles. Hay $${committed.toFixed(2)} comprometidos con el proveedor.`
  );

}
  return createWalletMovement({

    gasId,

    amount:
      -value,

    type,

    dayId,

    referenceId,

    note,

    /*
      El dinero sale directamente de la bolsa.
      No vuelve a afectar la caja del día.
    */

    impactsCash:
      false,

    metadata,

    createdAt,

  });

}



/* =========================================================
   COSTO DE REPOSICIÓN DE UNA CANTIDAD
========================================================= */

export function calculateReplacementCost(
  gasId,
  quantity
) {

  assertGasType(
    gasId
  );


  const qty =
    toNonNegativeInteger(
      quantity
    );


  return roundMoney(

    qty *

    getReplacementCost(
      gasId
    )

  );

}

/* =========================================================
   PLAN DE PAGO AL PROVEEDOR
========================================================= */

export function calculateSupplierPaymentPlan({

  gasId,

  quantity,

}) {

  assertGasType(
    gasId
  );


  const qty =
    toNonNegativeInteger(
      quantity
    );


  const gasConfig =
    GAS_TYPES[
      gasId
    ] ?? {};


  const totalCost =
    calculateReplacementCost(
      gasId,
      qty
    );


  /*
    =====================================================
    DURAGAS

    $0.55 se paga cuando llega el carro.
    $1.15 queda comprometido para la factura.
    =====================================================
  */

  if (
    gasId ===
    GAS_IDS.DURAGAS
  ) {

    const arrivalUnitCost =
      roundMoney(
        toNonNegativeNumber(
          gasConfig.arrivalCost
        )
      );


    const invoiceUnitCost =
      roundMoney(
        toNonNegativeNumber(
          gasConfig.invoiceCost
        )
      );


    const arrivalAmount =
      roundMoney(
        qty *
        arrivalUnitCost
      );


    const invoiceAmount =
      roundMoney(
        qty *
        invoiceUnitCost
      );


    return {

      gasId,

      quantity:
        qty,

      totalCost,

      paidNow: {

        unitCost:
          arrivalUnitCost,

        amount:
          arrivalAmount,

      },

      pending: {

        unitCost:
          invoiceUnitCost,

        amount:
          invoiceAmount,

      },

      committedAmount:
        invoiceAmount,

    };

  }


  /*
    =====================================================
    KING GAS

    Se paga completo en una sola operación.
    =====================================================
  */

  const singlePaymentUnitCost =
    roundMoney(
      toNonNegativeNumber(
        gasConfig.singlePaymentCost ??
        getReplacementCost(
          gasId
        )
      )
    );


  const singlePaymentAmount =
    roundMoney(
      qty *
      singlePaymentUnitCost
    );


  return {

    gasId,

    quantity:
      qty,

    totalCost,

    paidNow: {

      unitCost:
        singlePaymentUnitCost,

      amount:
        singlePaymentAmount,

    },

    pending: {

      unitCost:
        0,

      amount:
        0,

    },

    committedAmount:
      0,

  };

}

/* =========================================================
   DINERO COMPROMETIDO CON EL PROVEEDOR
========================================================= */
export function getSupplierCommittedAmount({

  gasId = null,

  financialMode = null,

} = {}) {

  if (
    gasId !== null
  ) {

    assertGasType(
      gasId
    );

  }


  const state =
    getState();


  const pendingPayments =
    (
      state.supplierPayments ??
      []
    ).filter(
      payment => {

        if (
          payment.status !==
          'pending'
        ) {

          return false;

        }


        const paymentMode =
          getFinancialMode(
            payment.dayId ??
            null
          );


        if (
          financialMode !== null &&
          paymentMode !== financialMode
        ) {

          return false;

        }


        if (
          gasId &&
          payment.gasId !== gasId
        ) {

          return false;

        }


        return true;

      }
    );


  return roundMoney(
    sumBy(
      pendingPayments,
      payment =>
        payment.amount ??
        0
    )
  );

}
/* =========================================================
   DINERO REALMENTE DISPONIBLE PARA NUEVA REPOSICIÓN
========================================================= */

export function getAvailableReplacementWalletBalance({

  gasId = null,

  dayId =
    getActiveDay()?.id ??
    null,

} = {}) {

  const financialMode =
    getFinancialMode(
      dayId
    );


  if (
    financialMode ===
    FINANCIAL_MODES.GENERAL
  ) {

    const balance =
      getGeneralWalletBalance();


   const committed =
  getSupplierCommittedAmount({
    financialMode:
      FINANCIAL_MODES.GENERAL,
  });
    return {

      financialMode:
        FINANCIAL_MODES.GENERAL,

      balance,

      committed,

      available:
        roundMoney(
          Math.max(
            0,
            balance -
            committed
          )
        ),

    };

  }


  assertGasType(
    gasId
  );


  const balance =
    getGasWalletBalance(
      gasId
    );

const committed =
  getSupplierCommittedAmount({
    gasId,
    financialMode:
      FINANCIAL_MODES.EXACT,
  });
  return {

    financialMode:
      FINANCIAL_MODES.EXACT,

    gasId,

    balance,

    committed,

    available:
      roundMoney(
        Math.max(
          0,
          balance -
          committed
        )
      ),

  };

}

/* =========================================================
   GANANCIA UNITARIA
========================================================= */

export function calculateUnitProfit(
  gasId,
  salePrice
) {

  assertGasType(
    gasId
  );


  return roundMoney(

    toNonNegativeNumber(
      salePrice
    )

    -

    getReplacementCost(
      gasId
    )

  );

}



/* =========================================================
   DESGLOSE FINANCIERO DE UNA VENTA
========================================================= */

export function calculateSaleFinancialPreview({

  quantities = {},

  price = 0,

  dayId =
    getActiveDay()?.id ??
    null,

}) {

  const unitPrice =
    roundMoney(
      toNonNegativeNumber(
        price
      )
    );


  const byGas = {};


  let totalUnits = 0;

  let totalRevenue = 0;

  let totalReserve = 0;

  let totalProfit = 0;


  GAS_ID_LIST.forEach(
    gasId => {

      const quantity =
        toNonNegativeInteger(
          quantities[gasId]
        );


      const revenue =
        roundMoney(
          quantity *
          unitPrice
        );

const reserve =
  roundMoney(
    quantity *
    getSaleReserveUnitCost(
      gasId,
      dayId
    )
  );
  const realReplacementCost =
  calculateReplacementCost(
    gasId,
    quantity
  );


const profit =
  roundMoney(
    revenue -
    realReplacementCost
  );
      byGas[gasId] = {

        quantity,

        unitPrice,

        revenue,

        replacementCost:
          getReplacementCost(
            gasId
          ),

        reserveRequired:
          reserve,

        grossProfit:
          profit,

      };


      totalUnits +=
        quantity;


      totalRevenue =
        roundMoney(
          totalRevenue +
          revenue
        );


      totalReserve =
        roundMoney(
          totalReserve +
          reserve
        );


      totalProfit =
        roundMoney(
          totalProfit +
          profit
        );

    }
  );


  return {

    byGas,

    totalUnits,

    unitPrice,

    totalRevenue,

    totalReserveRequired:
      totalReserve,

    grossProfit:
      totalProfit,

  };

}



/* =========================================================
   DISTRIBUIR DINERO COBRADO HACIA LAS BOLSAS
========================================================= */

/*
  Este punto es MUY importante.

  Una venta fiada no puede llenar físicamente
  una bolsa de dinero porque todavía no se cobró.

  Por eso:

  - calculamos cuánto debería reservarse
  - calculamos cuánto realmente se puede financiar
    con el dinero que ya fue cobrado

  Si después el cliente paga su deuda,
  accounts.js podrá volver a llamar esta función
  para completar la parte faltante.
*/

export function calculateReserveFundingPlan({

  quantities = {},

  price = 0,

  amountCollected = 0,

  alreadyFunded = {},

  dayId =
    getActiveDay()?.id ??
    null,

}) {
const preview =
  calculateSaleFinancialPreview({

    quantities,

    price,

    dayId,

  });

  const collected =
    roundMoney(
      toNonNegativeNumber(
        amountCollected
      )
    );


  const outstanding = {};


  let totalOutstanding = 0;


  GAS_ID_LIST.forEach(
    gasId => {

      const required =
        preview
          .byGas[gasId]
          .reserveRequired;


      const funded =
        roundMoney(
          toNonNegativeNumber(
            alreadyFunded[gasId]
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


      outstanding[gasId] =
        pending;


      totalOutstanding =
        roundMoney(
          totalOutstanding +
          pending
        );

    }
  );



  const amountForReserve =
    roundMoney(
      Math.min(
        collected,
        totalOutstanding
      )
    );


  const allocation = {

    [GAS_IDS.DURAGAS]: 0,

    [GAS_IDS.KING_GAS]: 0,

  };


  /*
    Distribución proporcional.

    Esto evita favorecer siempre una marca
    cuando una venta contiene Duragas + King Gas.
  */

  if (
    amountForReserve > 0 &&
    totalOutstanding > 0
  ) {

    let allocated = 0;


    GAS_ID_LIST.forEach(
      (
        gasId,
        index
      ) => {

        const pending =
          outstanding[gasId];


        if (
          pending <= 0
        ) {

          return;

        }


        /*
          La última marca recibe cualquier centavo
          restante generado por redondeos.
        */

        if (
          index ===
          GAS_ID_LIST.length - 1
        ) {

          allocation[gasId] =
            roundMoney(
              Math.min(
                pending,
                amountForReserve -
                allocated
              )
            );


          return;

        }


        const proportion =
          pending /
          totalOutstanding;


        const amount =
          roundMoney(
            Math.min(
              pending,
              amountForReserve *
              proportion
            )
          );


        allocation[gasId] =
          amount;


        allocated =
          roundMoney(
            allocated +
            amount
          );

      }
    );



    /*
      Corregimos un posible centavo restante.
    */

    let difference =
      roundMoney(

        amountForReserve

        -

        (
          allocation[
            GAS_IDS.DURAGAS
          ]

          +

          allocation[
            GAS_IDS.KING_GAS
          ]
        )

      );


    if (
      difference > 0
    ) {

      for (
        const gasId
        of GAS_ID_LIST
      ) {

        const capacity =
          roundMoney(

            outstanding[gasId]

            -

            allocation[gasId]

          );


        if (
          capacity <= 0
        ) {

          continue;

        }


        const add =
          Math.min(
            capacity,
            difference
          );


        allocation[gasId] =
          roundMoney(
            allocation[gasId] +
            add
          );


        difference =
          roundMoney(
            difference -
            add
          );


        if (
          difference <= 0
        ) {

          break;

        }

      }

    }

  }



  const allocatedTotal =
    roundMoney(

      allocation[
        GAS_IDS.DURAGAS
      ]

      +

      allocation[
        GAS_IDS.KING_GAS
      ]

    );


  const availableProfitFromCollection =
    roundMoney(
      Math.max(
        0,
        collected -
        allocatedTotal
      )
    );


  return {

    preview,

    collected,

    outstandingBefore:
      outstanding,

    allocation,

    allocatedTotal,

    availableProfitFromCollection,

    unallocatedCollection:
      availableProfitFromCollection,

  };

}



/* =========================================================
   FINANCIAR RESERVA DE UNA VENTA
========================================================= */

/*
  Esta función SÍ modifica las bolsas.

  Debe llamarse después de haber validado
  correctamente la venta.
*/

export function fundSaleReplacementReserve({

  saleId,

  dayId = null,

  quantities = {},

  price = 0,

  amountCollected = 0,

  paymentMethod =
    PAYMENT_METHODS.CASH,

  alreadyFunded = {},

  createdAt =
    nowIso(),

}) {

 const plan =
  calculateReserveFundingPlan({

    quantities,

    price,

    amountCollected,

    alreadyFunded,

    dayId:
      dayId ??
      getActiveDay()?.id ??
      null,

  });
  const movements = [];

const effectiveDayId =
  dayId ??
  getActiveDay()?.id ??
  null;


const financialMode =
  getFinancialMode(
    effectiveDayId
  );


if (
  financialMode ===
  FINANCIAL_MODES.GENERAL
) {

  const amount =
    roundMoney(
      plan.allocatedTotal
    );


  if (
    amount > 0
  ) {

    const movement =
      addMoneyToGeneralWallet({

        amount,

        type:
          WALLET_MOVEMENT_TYPES
            .SALE_RESERVE,

        dayId:
          effectiveDayId,

        referenceId:
          saleId,

        note:
          'Dinero apartado de venta en Bolsa General',

        source:
          'sale',

        paymentMethod,

        impactsCash:
          paymentMethod ===
          PAYMENT_METHODS.CASH,

        metadata: {

          saleId,

          allocation:
            cloneData(
              plan.allocation
            ),

          financialMode:
            FINANCIAL_MODES.GENERAL,

        },

        createdAt,

      });


    if (movement) {

      movements.push(
        movement
      );

    }

  }


  return {

    ...plan,

    financialMode:
      FINANCIAL_MODES.GENERAL,

    walletMovements:
      movements,

  };

}
  GAS_ID_LIST.forEach(
    gasId => {

      const amount =
        plan.allocation[
          gasId
        ];


      if (
        amount <= 0
      ) {

        return;

      }


      const movement =
        addMoneyToWallet({

          gasId,

          amount,

          type:
            WALLET_MOVEMENT_TYPES
              .SALE_RESERVE,

          dayId,

          referenceId:
            saleId,

          note:
            `Dinero apartado de venta para reponer ${getGasName(gasId)}`,

          source:
            'sale',

          paymentMethod,

          /*
            Si fue efectivo, asumimos que esta parte
            del dinero se separa físicamente de caja.
          */

          impactsCash:
            paymentMethod ===
            PAYMENT_METHODS.CASH,

          metadata: {

            saleId,

          },

          createdAt,

        });


      if (movement) {

        movements.push(
          movement
        );

      }

    }
  );


  return {

    ...plan,

    walletMovements:
      movements,

  };

}



/* =========================================================
   APORTE ADICIONAL PARA REPOSICIÓN
========================================================= */

/*
  Ejemplo:

  Bolsa amarilla: $170
  Necesito pagar:  $255

  Aporte extra:     $85

  El dinero NO desaparece.
  Queda registrado como entrada a la bolsa.
*/

export function registerExtraContribution({

  gasId,

  amount,

  source,

  dayId = null,

  referenceId = null,

  note = '',

  createdAt =
    nowIso(),

}) {

  assertGasType(
    gasId
  );


  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  if (
    value <= 0
  ) {

    throw new Error(
      'El aporte adicional debe ser mayor que cero.'
    );

  }


  if (
    !Object.values(
      EXTRA_CONTRIBUTION_SOURCES
    ).includes(
      source
    )
  ) {

    throw new Error(
      'Debes indicar de dónde salió el aporte adicional.'
    );

  }



  /*
    Si sale de caja o de ganancia física disponible,
    consideramos que reduce el dinero de caja
    y pasa a la bolsa.

    Si es aporte externo no reduce la caja del negocio.
  */

  const impactsCash =

    source ===
      EXTRA_CONTRIBUTION_SOURCES.CASH

    ||

    source ===
      EXTRA_CONTRIBUTION_SOURCES.PROFIT;
const effectiveDayId =
  dayId ??
  getActiveDay()?.id ??
  null;


const financialMode =
  getFinancialMode(
    effectiveDayId
  );


const walletMovement =

  financialMode ===
    FINANCIAL_MODES.GENERAL

    ? addMoneyToGeneralWallet({

        amount:
          value,

        type:
          WALLET_MOVEMENT_TYPES
            .EXTRA_CONTRIBUTION,

        dayId:
          effectiveDayId,

        referenceId,

        note:
          note ||
          `Aporte adicional para reposición de ${getGasName(gasId)}`,

        source,

        impactsCash,

        metadata: {

          extraContribution:
            true,

          gasId,

          financialMode:
            FINANCIAL_MODES.GENERAL,

        },

        createdAt,

      })

    : addMoneyToWallet({

        gasId,

        amount:
          value,

        type:
          WALLET_MOVEMENT_TYPES
            .EXTRA_CONTRIBUTION,

        dayId:
          effectiveDayId,

        referenceId,

        note:
          note ||
          `Aporte adicional para reposición de ${getGasName(gasId)}`,

        source,

        impactsCash,

        metadata: {

          extraContribution:
            true,

          financialMode:
            FINANCIAL_MODES.EXACT,

        },

        createdAt,

      });

  pushGeneralMovement({

    dayId:
      dayId ??
      getActiveDay()?.id ??
      null,

    type:
      MOVEMENT_TYPES
        .EXTRA_CONTRIBUTION,

    gasId,

    referenceId,

    reference:
      getGasName(
        gasId
      ),

    detail:
      note ||
      'Aporte adicional para comprar más gas.',

    value:
      value,

    metadata: {

      source,

      walletMovementId:
        walletMovement?.id ??
        null,

      impactsCash,

    },

    createdAt,

  });


  return walletMovement;

}



/* =========================================================
   PAGAR GAS REPUESTO DESDE LA BOLSA
========================================================= */
export function payReplacementFromWallet({

  gasId,

  amount,

  dayId = null,

 replenishmentId = null,

allowCommitted =
  false,

createdAt =
  nowIso(),
}) {

  assertGasType(
    gasId
  );


  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  if (
    value <= 0
  ) {

    return null;

  }


  const effectiveDayId =
    dayId ??
    getActiveDay()?.id ??
    null;

const financialMode =
  getFinancialMode(
    effectiveDayId
  );


if (
  financialMode ===
  FINANCIAL_MODES.GENERAL
) {

  return spendGeneralWalletMoney({

    amount:
      value,

    type:
      WALLET_MOVEMENT_TYPES
        .REPLENISHMENT_PAYMENT,

    dayId:
      effectiveDayId,

    referenceId:
      replenishmentId,

    note:
      `Pago de reposición ${getGasName(gasId)} desde Bolsa General`,

metadata: {

  replenishmentId,

  gasId,

  financialMode:
    FINANCIAL_MODES.GENERAL,

},

allowCommitted,

createdAt,

  });

}
  /*
    =====================================================
    COMPOSICIÓN DE LA BOLSA ANTES DEL PAGO
    =====================================================
  */

  const breakdown =
    getWalletDayBreakdown(
      gasId,
      effectiveDayId
    );

const walletInfo =
  getAvailableReplacementWalletBalance({
    gasId,
    dayId:
      effectiveDayId,
  });


const available =
  allowCommitted

    ? walletInfo.balance

    : walletInfo.available;


if (
  value >
  available + 0.005
) {

  throw new Error(
    `La bolsa ${getGasName(gasId)} solo tiene $${available.toFixed(2)} disponibles y necesitas $${value.toFixed(2)}.`
  );

}
  let remaining =
    value;


  /*
    =====================================================
    1. CONSUMIR PRIMERO SALDO ANTERIOR
    =====================================================
  */

  const fromPrevious =
    roundMoney(
      Math.min(
        breakdown.previousRemaining,
        remaining
      )
    );


  remaining =
    roundMoney(
      Math.max(
        0,
        remaining -
        fromPrevious
      )
    );

/*
  =====================================================
  2. DESPUÉS APORTES ADICIONALES
  =====================================================
*/

const fromContributions =
  roundMoney(
    Math.min(
      breakdown.contributionsRemaining,
      remaining
    )
  );


remaining =
  roundMoney(
    Math.max(
      0,
      remaining -
      fromContributions
    )
  );



/*
  =====================================================
  3. FINALMENTE RESERVA GENERADA HOY
  =====================================================
*/

const fromToday =
  roundMoney(
    Math.min(
      breakdown.todayReserveRemaining,
      remaining
    )
  );


remaining =
  roundMoney(
    Math.max(
      0,
      remaining -
      fromToday
    )
  );

  /*
    En funcionamiento normal remaining debe quedar 0.

    Este campo queda guardado como protección para
    datos antiguos, migraciones o correcciones manuales.
  */

  const fromOtherPreviousBalance =
    roundMoney(
      remaining
    );



  /* =====================================================
     SALDOS DESPUÉS DEL PAGO
  ===================================================== */

  const previousAfter =
    roundMoney(
      Math.max(
        0,
        breakdown.previousRemaining -
        fromPrevious
      )
    );


  const todayAfter =
    roundMoney(
      Math.max(
        0,
        breakdown.todayReserveRemaining -
        fromToday
      )
    );


  const contributionsAfter =
    roundMoney(
      Math.max(
        0,
        breakdown.contributionsRemaining -
        fromContributions
      )
    );

  /*
    =====================================================
    HACER EL PAGO REAL

    Seguimos utilizando spendWalletMoney(),
    por lo que NO rompemos la lógica existente.

    Solamente agregamos trazabilidad.
    =====================================================
  */

  return spendWalletMoney({

    gasId,

    amount:
      value,

    type:
      WALLET_MOVEMENT_TYPES
        .REPLENISHMENT_PAYMENT,

    dayId:
      effectiveDayId,

    referenceId:
      replenishmentId,

    note:
      `Pago de reposición ${getGasName(gasId)}`,

    metadata: {

      replenishmentId,


      /*
        De dónde salió el dinero.
      */

      fundingOrigin: {

        previous:
          fromPrevious,

        today:
          fromToday,

        contributions:
          fromContributions,

        otherPrevious:
          fromOtherPreviousBalance,

      },


      /*
        Cómo estaba la bolsa antes.
      */

      walletBeforeBreakdown: {

        previous:
          breakdown.previousRemaining,

        today:
          breakdown.todayReserveRemaining,

        contributions:
          breakdown.contributionsRemaining,

        total:
          available,

      },


      /*
        Cómo queda después de este pago.
      */

      walletAfterBreakdown: {

        previous:
          previousAfter,

        today:
          todayAfter,

        contributions:
          contributionsAfter,

        total:
          roundMoney(
            Math.max(
              0,
              available -
              value
            )
          ),

      },

    },

    createdAt,
allowCommitted,
  });

}

/* =========================================================
   REGISTRAR GASTO
========================================================= */

/*
  Ejemplos futuros:

  - transporte Duragas
  - transporte King Gas
  - otro gasto de bodega

  Estos SÍ reducen la ganancia.

  El costo de comprar nuevamente el gas NO se registra
  aquí porque ya fue considerado como costo de reposición
  en cada venta.
*/

export function registerExpense({

  amount,

  gasId = null,

  category = 'other',

  paymentMethod =
    PAYMENT_METHODS.CASH,

  dayId = null,

  referenceId = null,

  note = '',

  createdAt =
    nowIso(),

}) {

  if (
    gasId !== null
  ) {

    assertGasType(
      gasId
    );

  }


  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  if (
    value <= 0
  ) {

    throw new Error(
      'El gasto debe ser mayor que cero.'
    );

  }


  const expense = {

    id:
      uid('expense'),

    dayId:
      dayId ??
      getActiveDay()?.id ??
      null,

    gasId,

    category,

    amount:
      value,

    paymentMethod,

    referenceId,

    note:
      String(
        note ?? ''
      ),

    createdAt,

  };


  getState()
    .expenses
    .push(
      expense
    );


  pushGeneralMovement({

    dayId:
      expense.dayId,

    type:
      MOVEMENT_TYPES.EXPENSE,

    gasId,

    referenceId,

    reference:
      gasId
        ? getGasName(
            gasId
          )
        : 'Gasto general',

    detail:
      note ||
      category,

    value:
      -value,

    metadata: {

      expenseId:
        expense.id,

      category,

      paymentMethod,

    },

    createdAt,

  });


  touchState();


  return expense;

}



/* =========================================================
   OBTENER GASTOS DEL DÍA
========================================================= */

export function getDayExpenses(
  dayId
) {

  return getState()
    .expenses
    .filter(
      expense =>
        expense.dayId ===
        dayId
    );

}



/* =========================================================
   OBTENER VENTAS DE UN DÍA
========================================================= */

export function getDaySales(
  dayId
) {

  return getState()
    .sales
    .filter(
      sale =>
        sale.dayId ===
        dayId
    );

}



/* =========================================================
   LÍNEAS DE VENTA DE UN DÍA
========================================================= */

export function getDaySaleLines(
  dayId
) {

  const saleIds =
    new Set(

      getDaySales(
        dayId
      )
      .map(
        sale =>
          sale.id
      )

    );


  return getState()
    .saleLines
    .filter(
      line =>
        saleIds.has(
          line.saleId
        )
    );

}



/* =========================================================
   VALORES FINANCIEROS DE UNA LÍNEA
========================================================= */

/*
  Permite que finance.js siga funcionando incluso
  si una línea migrada no contiene todos los campos
  financieros nuevos.
*/

function getLineFinancialValues(
  line
) {

  const gasId =
    line.gasId ??
    line.gasType;


  if (
    !GAS_ID_LIST.includes(
      gasId
    )
  ) {

    return null;

  }


  const quantity =
    toNonNegativeInteger(

      line.quantity ??

      line.qty

    );


  const unitPrice =
    roundMoney(
      toNonNegativeNumber(

        line.unitPrice ??

        line.price

      )
    );


  const revenue =
    roundMoney(

      line.revenue !== undefined

        ? toNonNegativeNumber(
            line.revenue
          )

        : quantity *
          unitPrice

    );


  const reserveRequired =
    roundMoney(

      line.reserveRequired !== undefined

        ? toNonNegativeNumber(
            line.reserveRequired
          )

        : calculateReplacementCost(
            gasId,
            quantity
          )

    );


 const grossProfit =
  roundMoney(

    line.grossProfit !== undefined

      ? toNumber(
          line.grossProfit
        )

      : revenue -
        (
          quantity *
          getReplacementCost(
            gasId
          )
        )

  );
  return {

    gasId,

    quantity,

    unitPrice,

    revenue,

    reserveRequired,

    grossProfit,

  };

}



/* =========================================================
   COBROS POSTERIORES DE PENDIENTES
========================================================= */

/*
  accounts.js registrará pagos posteriores como
  movimientos generales con:

  type: payment

  metadata:
  {
    paymentMethod,
    amount
  }

  Así esos cobros se incluyen en caja,
  pero NO generan una nueva venta.
*/

function getDayAccountPayments(
  dayId
) {

  return getState()
    .movements
    .filter(
      movement => {

        return (

          movement.dayId ===
            dayId

          &&

          movement.type ===
            MOVEMENT_TYPES.PAYMENT

        );

      }
    );

}



/* =========================================================
   DINERO ENVIADO A LAS BOLSAS DESDE CAJA
========================================================= */

function getDayCashTransferredToWallets(
  dayId
) {

  return roundMoney(

    sumBy(

      getState()
        .walletMovements
        .filter(
          movement => {

            return (

              movement.dayId ===
                dayId

              &&

              movement.amount > 0

              &&

              movement.impactsCash ===
                true

            );

          }
        ),

      movement =>
        movement.amount

    )

  );

}



/* =========================================================
   APORTES DE GANANCIA REINVERTIDA
========================================================= */

function getProfitReinvested(
  dayId,
  gasId = null
) {

  return roundMoney(

    sumBy(

      getState()
        .walletMovements
        .filter(
          movement => {

            if (
              movement.dayId !==
              dayId
            ) {

              return false;

            }


            if (
              movement.type !==
              WALLET_MOVEMENT_TYPES
                .EXTRA_CONTRIBUTION
            ) {

              return false;

            }


            if (
              movement.source !==
              EXTRA_CONTRIBUTION_SOURCES
                .PROFIT
            ) {

              return false;

            }


           if (
  gasId &&
  movement.gasId !== gasId &&
  movement.metadata?.gasId !== gasId
) {

  return false;

}

            return true;

          }
        ),

      movement =>
        movement.amount

    )

  );

}



/* =========================================================
   RESUMEN FINANCIERO DEL DÍA
========================================================= */

export function getDayFinanceSummary(
  dayId =
    getActiveDay()?.id
) {

  if (!dayId) {

    return createEmptyFinanceSummary();

  }


  const state =
    getState();


  const sales =
    getDaySales(
      dayId
    );


  const saleLines =
    getDaySaleLines(
      dayId
    );


  const expenses =
    getDayExpenses(
      dayId
    );


  const paymentMovements =
    getDayAccountPayments(
      dayId
    );



  /* =======================================================
     VENTAS POR MARCA
  ======================================================= */

  const byGas = {

    [GAS_IDS.DURAGAS]: {

      units: 0,

      revenue: 0,

      reserveRequired: 0,

      grossProfit: 0,

      expenses: 0,

      netProfit: 0,

      profitReinvested: 0,

      availableProfit: 0,

      collectedProfit: 0,

    },


    [GAS_IDS.KING_GAS]: {

      units: 0,

      revenue: 0,

      reserveRequired: 0,

      grossProfit: 0,

      expenses: 0,

      netProfit: 0,

      profitReinvested: 0,

      availableProfit: 0,

      collectedProfit: 0,

    },

  };


  saleLines.forEach(
    line => {

      const values =
        getLineFinancialValues(
          line
        );


      if (!values) {

        return;

      }


      const target =
        byGas[
          values.gasId
        ];


      target.units +=
        values.quantity;


      target.revenue =
        roundMoney(
          target.revenue +
          values.revenue
        );


      target.reserveRequired =
        roundMoney(
          target.reserveRequired +
          values.reserveRequired
        );


      target.grossProfit =
        roundMoney(
          target.grossProfit +
          values.grossProfit
        );

    }
  );



  /* =======================================================
     GASTOS POR MARCA
  ======================================================= */

  let generalExpenses = 0;


  expenses.forEach(
    expense => {

      const value =
        roundMoney(
          expense.amount
        );


      if (
        expense.gasId &&
        byGas[
          expense.gasId
        ]
      ) {

        byGas[
          expense.gasId
        ].expenses =
          roundMoney(

            byGas[
              expense.gasId
            ].expenses

            +

            value

          );

      }
      else {

        generalExpenses =
          roundMoney(
            generalExpenses +
            value
          );

      }

    }
  );



  GAS_ID_LIST.forEach(
    gasId => {

      const item =
        byGas[
          gasId
        ];


      item.netProfit =
        roundMoney(

          item.grossProfit

          -

          item.expenses

        );


      item.profitReinvested =
        getProfitReinvested(
          dayId,
          gasId
        );


      /*
        "Ganancia disponible" significa:
        lo ganado menos lo que ya decidimos
        reinvertir expresamente.

        La reinversión NO es una pérdida.
        Simplemente deja de estar disponible
        para sacar como efectivo.
      */

      item.availableProfit =
        roundMoney(

          item.netProfit

          -

          item.profitReinvested

        );

    }
  );



  /* =======================================================
     INGRESOS POR VENTAS
  ======================================================= */

  const salesRevenue =
    roundMoney(

      sumBy(
        sales,
        sale =>
          sale.total ??
          sale.totalAmount ??
          0
      )

    );



  /*
    Cuánto dinero efectivamente se cobró
    al registrar las ventas.
  */

  const collectedFromSales =
    roundMoney(

      sumBy(
        sales,
        sale =>
          sale.paidNow ??
          sale.amountPaid ??
          0
      )

    );



  /* =======================================================
     PAGOS DE DEUDAS ANTERIORES
  ======================================================= */

  const collectedFromAccounts =
    roundMoney(

      sumBy(
        paymentMovements,
        movement =>
          Math.abs(
            movement.value ??
            movement.metadata
              ?.amount ??
            0
          )
      )

    );



  const totalCollected =
    roundMoney(

      collectedFromSales

      +

      collectedFromAccounts

    );


  const collectedProfit =
    roundMoney(
      sumBy(
        sales,
        sale =>
          sale.realizedProfitFromCollection ??
          0
      )
    );


  const collectedProfitByGas = {

    [GAS_IDS.DURAGAS]: 0,

    [GAS_IDS.KING_GAS]: 0,

  };


  sales.forEach(
    sale => {

      const realized =
        roundMoney(
          sale.realizedProfitFromCollection ??
          0
        );


      if (
        realized <= 0
      ) {

        return;

      }


      const saleLines =
        getSaleLines(
          sale.id
        );

      const revenueByGas = {};

      let totalLineRevenue = 0;


      GAS_ID_LIST.forEach(
        gasId => {

          const revenue =
            roundMoney(
              sumBy(
                saleLines.filter(
                  line =>
                    (line.gasId ??
                      line.gasType) ===
                    gasId
                ),
                line =>
                  line.revenue ??
                  (
                    line.quantity ??
                    line.qty ??
                    0
                  ) *
                  (
                    line.unitPrice ??
                    sale.unitPrice ??
                    sale.price ??
                    0
                  )
              )
            );


          revenueByGas[gasId] =
            revenue;

          totalLineRevenue =
            roundMoney(
              totalLineRevenue +
              revenue
            );

        }
      );


      if (
        totalLineRevenue <= 0
      ) {

        return;

      }


      GAS_ID_LIST.forEach(
        gasId => {

          collectedProfitByGas[gasId] =
            roundMoney(
              collectedProfitByGas[gasId] +
              realized *
              (
                revenueByGas[gasId] /
                totalLineRevenue
              )
            );

        }
      );

    }
  );



  /* =======================================================
     EFECTIVO DE VENTAS
  ======================================================= */

  const saleCash =
    roundMoney(

      sumBy(

        sales.filter(
          sale =>
            sale.paymentMethod ===
              PAYMENT_METHODS.CASH
        ),

        sale =>
          sale.paidNow ??
          0

      )

    );



  const saleTransfers =
    roundMoney(

      sumBy(

        sales.filter(
          sale =>
            sale.paymentMethod ===
              PAYMENT_METHODS.TRANSFER
        ),

        sale =>
          sale.paidNow ??
          0

      )

    );



  /* =======================================================
     COBROS POSTERIORES
  ======================================================= */

  const accountCash =
    roundMoney(

      sumBy(

        paymentMovements.filter(
          movement =>
            movement.metadata
              ?.paymentMethod ===
              PAYMENT_METHODS.CASH
        ),

        movement =>
          Math.abs(
            movement.value ??
            movement.metadata
              ?.amount ??
            0
          )

      )

    );



  const accountTransfers =
    roundMoney(

      sumBy(

        paymentMovements.filter(
          movement =>
            movement.metadata
              ?.paymentMethod ===
              PAYMENT_METHODS.TRANSFER
        ),

        movement =>
          Math.abs(
            movement.value ??
            movement.metadata
              ?.amount ??
            0
          )

      )

    );



  const cashCollected =
    roundMoney(
      saleCash +
      accountCash
    );


  const transfersCollected =
    roundMoney(
      saleTransfers +
      accountTransfers
    );



  /* =======================================================
     GASTOS PAGADOS EN EFECTIVO
  ======================================================= */

  const cashExpenses =
    roundMoney(

      sumBy(

        expenses.filter(
          expense =>
            expense.paymentMethod ===
              PAYMENT_METHODS.CASH
        ),

        expense =>
          expense.amount

      )

    );



  /* =======================================================
     DINERO PASADO FÍSICAMENTE A LAS BOLSAS
  ======================================================= */

  const cashToWallets =
    getDayCashTransferredToWallets(
      dayId
    );



  /* =======================================================
     FONDO INICIAL
  ======================================================= */

  const day =
    state.days.find(
      item =>
        item.id ===
        dayId
    );


  const openingCashFund =
    roundMoney(
      day?.opening?.cashFund ??
      0
    );

const totalProfitDistributed =
  getProfitDistributed(
    dayId
  );

  /* =======================================================
     CAJA ESPERADA
  ======================================================= */

  /*
    Ejemplo:

    Fondo inicial              $10.00
    + ventas efectivo          $50.00
    + cobro deuda               $5.00
    - dinero pasado a bolsas   $35.00
    - gastos                    $3.00
    ---------------------------------
    Caja esperada              $27.00
  */

const expectedCash =
  roundMoney(

    openingCashFund

    +

    cashCollected

    -

    cashToWallets

    -

    cashExpenses

    -

    totalProfitDistributed

  );

  /* =======================================================
     GANANCIAS
  ======================================================= */

  const grossProfit =
    roundMoney(

      byGas[
        GAS_IDS.DURAGAS
      ].grossProfit

      +

      byGas[
        GAS_IDS.KING_GAS
      ].grossProfit

    );


  const totalExpenses =
    roundMoney(

      byGas[
        GAS_IDS.DURAGAS
      ].expenses

      +

      byGas[
        GAS_IDS.KING_GAS
      ].expenses

      +

      generalExpenses

    );


  const netProfit =
    roundMoney(

      grossProfit

      -

      totalExpenses

    );


  const totalProfitReinvested =
    roundMoney(

      getProfitReinvested(
        dayId
      )

    );


  GAS_ID_LIST.forEach(
    gasId => {

      const item =
        byGas[gasId];

      item.collectedProfit =
        roundMoney(
          collectedProfitByGas[gasId]
        );

      item.availableProfit =
        roundMoney(
          item.collectedProfit -
          item.expenses -
          item.profitReinvested
        );

    }
  );

const availableProfit =
  roundMoney(

    collectedProfit

    -

    totalExpenses

    -

    totalProfitReinvested

    -

    totalProfitDistributed

  );
  /* =======================================================
     REPOSICIONES DEL DÍA
  ======================================================= */

  const replenishments =
    state.replenishments.filter(
      item =>
        item.dayId ===
        dayId
    );


  const replenishmentByGas = {};


  GAS_ID_LIST.forEach(
    gasId => {

      const items =
        replenishments.filter(
          item =>
            item.gasId ===
            gasId
        );


      replenishmentByGas[
        gasId
      ] = {

        quantity:
          sumBy(
            items,
            item =>
              item.quantity
          ),

        gasPaid:
          roundMoney(
            sumBy(
              items,
              item =>
                item.gasCost
            )
          ),

        additionalCosts:
          roundMoney(
            sumBy(
              items,
              item =>
                (
                  item.transportCost ??
                  0
                )
                +
                (
                  item.otherCost ??
                  0
                )
            )
          ),

      };

    }
  );



  return {

    dayId,


    sales: {

      count:
        sales.length,

      units:
        byGas[
          GAS_IDS.DURAGAS
        ].units
        +
        byGas[
          GAS_IDS.KING_GAS
        ].units,

      revenue:
        salesRevenue,

    },


    collection: {

      fromSales:
        collectedFromSales,

      fromAccounts:
        collectedFromAccounts,

      total:
        totalCollected,

      profit:
        collectedProfit,

      cash:
        cashCollected,

      transfers:
        transfersCollected,

    },


    cash: {

      openingFund:
        openingCashFund,

      collected:
        cashCollected,

      transferredToWallets:
        cashToWallets,

      expenses:
        cashExpenses,

      expected:
        expectedCash,

    },


    wallets: {

      [GAS_IDS.DURAGAS]:
        getGasWalletBalance(
          GAS_IDS.DURAGAS
        ),

      [GAS_IDS.KING_GAS]:
        getGasWalletBalance(
          GAS_IDS.KING_GAS
        ),

    },


    byGas,


    profit: {

      gross:
        grossProfit,

      expenses:
        totalExpenses,

      generalExpenses,

      net:
        netProfit,

      reinvested:
        totalProfitReinvested,

      available:
        availableProfit,

    },


    replenishments:
      replenishmentByGas,

  };

}



/* =========================================================
   RESUMEN FINANCIERO VACÍO
========================================================= */

export function createEmptyFinanceSummary() {

  return {

    dayId:
      null,


    sales: {

      count: 0,

      units: 0,

      revenue: 0,

    },


    collection: {

      fromSales: 0,

      fromAccounts: 0,

      total: 0,

      profit: 0,

      cash: 0,

      transfers: 0,

    },


    cash: {

      openingFund: 0,

      collected: 0,

      transferredToWallets: 0,

      expenses: 0,

      expected: 0,

    },

wallets: {

  financialMode:
    FINANCIAL_MODES.EXACT,

  general:
    getGeneralWalletBalance(),

  [GAS_IDS.DURAGAS]:
    getGasWalletBalance(
      GAS_IDS.DURAGAS
    ),

  [GAS_IDS.KING_GAS]:
    getGasWalletBalance(
      GAS_IDS.KING_GAS
    ),

},
    byGas: {

      [GAS_IDS.DURAGAS]: {

        units: 0,

        revenue: 0,

        reserveRequired: 0,

        grossProfit: 0,

        expenses: 0,

        netProfit: 0,

        profitReinvested: 0,

        availableProfit: 0,

      },


      [GAS_IDS.KING_GAS]: {

        units: 0,

        revenue: 0,

        reserveRequired: 0,

        grossProfit: 0,

        expenses: 0,

        netProfit: 0,

        profitReinvested: 0,

        availableProfit: 0,

      },

    },


    profit: {

      gross: 0,

      expenses: 0,

      generalExpenses: 0,

      net: 0,

      reinvested: 0,

      available: 0,

    },


    replenishments: {

      [GAS_IDS.DURAGAS]: {

        quantity: 0,

        gasPaid: 0,

        additionalCosts: 0,

      },


      [GAS_IDS.KING_GAS]: {

        quantity: 0,

        gasPaid: 0,

        additionalCosts: 0,

      },

    },

  };

}



/* =========================================================
   RESUMEN DE BOLSAS
========================================================= */
export function getWalletSummary(
  dayId =
    getActiveDay()?.id ??
    null
) {

  const financialMode =
    getFinancialMode(
      dayId
    );


  const generalBalance =
    getGeneralWalletBalance();
   
  const duragas =
    getWalletDayBreakdown(
      GAS_IDS.DURAGAS,
      dayId
    );


  const kingGas =
    getWalletDayBreakdown(
      GAS_IDS.KING_GAS,
      dayId
    );


  return {

         financialMode,

    general: {

      active:
        financialMode ===
        FINANCIAL_MODES.GENERAL,

      balance:
        generalBalance,

      reservePerUnit:
        GENERAL_RESERVE_PER_UNIT,

    },
     
    [GAS_IDS.DURAGAS]: {

      /*
        Mantener "balance" evita romper
        todo lo que ya utiliza esta función.
      */

      balance:
        duragas.balance,

      equivalentUnits:
        getWalletEquivalentUnits(
          GAS_IDS.DURAGAS
        ),

      replacementCost:
        getReplacementCost(
          GAS_IDS.DURAGAS
        ),


      /*
        NUEVO DESGLOSE
      */

      openingBalance:
        duragas.openingBalance,

      previousRemaining:
        duragas.previousRemaining,

      todayReserveAdded:
        duragas.todayReserveAdded,

      todayReserveRemaining:
        duragas.todayReserveRemaining,

      contributionsAdded:
        duragas.contributionsAdded,

      contributionsRemaining:
        duragas.contributionsRemaining,

      spentToday:
        duragas.spentToday,

      usedFromPrevious:
        duragas.usedFromPrevious,

      usedFromToday:
        duragas.usedFromToday,

      usedFromContributions:
        duragas.usedFromContributions,

    },


    [GAS_IDS.KING_GAS]: {

      balance:
        kingGas.balance,

      equivalentUnits:
        getWalletEquivalentUnits(
          GAS_IDS.KING_GAS
        ),

      replacementCost:
        getReplacementCost(
          GAS_IDS.KING_GAS
        ),


      /*
        NUEVO DESGLOSE
      */

      openingBalance:
        kingGas.openingBalance,

      previousRemaining:
        kingGas.previousRemaining,

      todayReserveAdded:
        kingGas.todayReserveAdded,

      todayReserveRemaining:
        kingGas.todayReserveRemaining,

      contributionsAdded:
        kingGas.contributionsAdded,

      contributionsRemaining:
        kingGas.contributionsRemaining,

      spentToday:
        kingGas.spentToday,

      usedFromPrevious:
        kingGas.usedFromPrevious,

      usedFromToday:
        kingGas.usedFromToday,

      usedFromContributions:
        kingGas.usedFromContributions,

    },

  };

}
/* =========================================================
   DINERO QUE FALTA PARA UNA REPOSICIÓN
========================================================= */
export function calculateReplenishmentFunding({

  gasId,

  quantity,

  dayId =
    getActiveDay()?.id ??
    null,

}) {

  assertGasType(
    gasId
  );


  const qty =
    toNonNegativeInteger(
      quantity
    );


  const gasCost =
    calculateReplacementCost(
      gasId,
      qty
    );


  const financialMode =
    getFinancialMode(
      dayId
    );


  /* =======================================================
     BOLSA GENERAL
  ======================================================= */

  if (
    financialMode ===
    FINANCIAL_MODES.GENERAL
  ) {

    const walletInfo =
      getAvailableReplacementWalletBalance({
        dayId,
      });


    const walletBefore =
      walletInfo.available;


    const walletUsed =
      roundMoney(
        Math.min(
          walletBefore,
          gasCost
        )
      );


    const extraNeeded =
      roundMoney(
        Math.max(
          0,
          gasCost -
          walletBefore
        )
      );


    const walletRemainingWithoutExtra =
      roundMoney(
        Math.max(
          0,
          walletBefore -
          gasCost
        )
      );


    return {

      gasId,

      quantity:
        qty,

      gasCost,

      financialMode:
        FINANCIAL_MODES.GENERAL,

      walletBefore,

      extraNeeded,

      walletRemainingWithoutExtra,

      fundingBreakdown: {

        generalAvailable:
          walletBefore,

        fromGeneralWallet:
          walletUsed,

        fromExtraContribution:
          extraNeeded,

        generalAfter:
          walletRemainingWithoutExtra,

      },

    };

  }


  /* =======================================================
     BOLSAS EXACTAS POR MARCA
  ======================================================= */

  const walletInfo =
    getAvailableReplacementWalletBalance({
      gasId,
      dayId,
    });


  const walletBefore =
    walletInfo.available;


  const breakdown =
    getWalletDayBreakdown(
      gasId,
      dayId
    );


  let remainingWalletTarget =
    roundMoney(
      Math.min(
        gasCost,
        walletBefore
      )
    );


  /* =======================================================
     1. SALDO ANTERIOR
  ======================================================= */

  const fromPrevious =
    roundMoney(
      Math.min(
        breakdown.previousRemaining,
        remainingWalletTarget
      )
    );


  remainingWalletTarget =
    roundMoney(
      Math.max(
        0,
        remainingWalletTarget -
        fromPrevious
      )
    );


  /* =======================================================
     2. APORTES ADICIONALES
  ======================================================= */

  const fromContributions =
    roundMoney(
      Math.min(
        breakdown.contributionsRemaining,
        remainingWalletTarget
      )
    );


  remainingWalletTarget =
    roundMoney(
      Math.max(
        0,
        remainingWalletTarget -
        fromContributions
      )
    );


  /* =======================================================
     3. RESERVA GENERADA HOY
  ======================================================= */

  const fromToday =
    roundMoney(
      Math.min(
        breakdown.todayReserveRemaining,
        remainingWalletTarget
      )
    );


  remainingWalletTarget =
    roundMoney(
      Math.max(
        0,
        remainingWalletTarget -
        fromToday
      )
    );


  const walletUsed =
    roundMoney(
      fromPrevious +
      fromContributions +
      fromToday
    );


  const extraNeeded =
    roundMoney(
      Math.max(
        0,
        gasCost -
        walletUsed
      )
    );


  const walletRemainingWithoutExtra =
    roundMoney(
      Math.max(
        0,
        walletBefore -
        walletUsed
      )
    );


  const previousAfter =
    roundMoney(
      Math.max(
        0,
        breakdown.previousRemaining -
        fromPrevious
      )
    );


  const todayAfter =
    roundMoney(
      Math.max(
        0,
        breakdown.todayReserveRemaining -
        fromToday
      )
    );


  const contributionsAfter =
    roundMoney(
      Math.max(
        0,
        breakdown.contributionsRemaining -
        fromContributions
      )
    );


  return {

    gasId,

    quantity:
      qty,

    gasCost,

    walletBefore,

    extraNeeded,

    walletRemainingWithoutExtra,

    fundingBreakdown: {

      previousAvailable:
        breakdown.previousRemaining,

      todayAvailable:
        breakdown.todayReserveRemaining,

      contributionsAvailable:
        breakdown.contributionsRemaining,

      fromPrevious,

      fromToday,

      fromContributions,

      fromExtraContribution:
        extraNeeded,

      previousAfter,

      todayAfter,

      contributionsAfter,

    },

  };

}

/* =========================================================
   SALDO INICIAL DE UNA BOLSA
========================================================= */

export function setOpeningWalletBalance({

  gasId,

  amount,

  dayId,

  createdAt =
    nowIso(),

}) {

  assertGasType(
    gasId
  );


  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  const state =
    getState();


  const existing =
    state.walletMovements.find(
      movement =>
        movement.dayId === dayId &&
        movement.gasId === gasId &&
        movement.type ===
          WALLET_MOVEMENT_TYPES
            .OPENING_BALANCE
    );


  if (existing) {

    const previousAmount =
      roundMoney(
        existing.amount
      );

    const difference =
      roundMoney(
        value -
        previousAmount
      );


    state.wallets[gasId] =
      roundMoney(
        Math.max(
          0,
          getGasWalletBalance(
            gasId
          ) +
          difference
        )
      );


    existing.amount =
      value;

    existing.balanceBefore =
      0;

    existing.balanceAfter =
      value;

    existing.note =
      `Saldo inicial de Bolsa ${getGasName(gasId)}`;


    const generalMovement =
      state.movements.find(
        movement =>
          movement.metadata
            ?.walletMovementId ===
          existing.id
      );


    if (generalMovement) {

      generalMovement.value =
        value;

      generalMovement.detail =
        `Saldo inicial de Bolsa ${getGasName(gasId)}`;

      generalMovement.metadata
        .balanceBefore =
        0;

      generalMovement.metadata
        .balanceAfter =
        value;

    }


    touchState();

    return existing;

  }


  if (
    value <= 0
  ) {

    state.wallets[gasId] =
      0;

    touchState();

    return null;

  }


  return createWalletMovement({

    gasId,

    amount:
      value,

    type:
      WALLET_MOVEMENT_TYPES
        .OPENING_BALANCE,

    dayId,

    note:
      `Saldo inicial de Bolsa ${getGasName(gasId)}`,

    source:
      'opening_balance',

    impactsCash:
      false,

    metadata: {

      initialSystemBalance:
        true,

    },

    createdAt,

  });

}
/* =========================================================
   SALDO INICIAL DE LA BOLSA GENERAL
========================================================= */

export function setOpeningGeneralWalletBalance({

  amount,

  dayId,

  createdAt =
    nowIso(),

}) {

  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  const state =
    getState();


  const existing =
    state.walletMovements.find(
      movement =>

        movement.dayId === dayId &&

        movement.generalWallet === true &&

        movement.type ===
          WALLET_MOVEMENT_TYPES
            .OPENING_BALANCE
    );


  if (existing) {

    const previousAmount =
      roundMoney(
        existing.amount
      );


    const difference =
      roundMoney(
        value -
        previousAmount
      );


    state.generalWallet =
      roundMoney(
        Math.max(
          0,
          getGeneralWalletBalance() +
          difference
        )
      );


    existing.amount =
      value;

    existing.balanceBefore =
      0;

    existing.balanceAfter =
      value;

    existing.note =
      'Saldo inicial de Bolsa General';


    const generalMovement =
      state.movements.find(
        movement =>
          movement.metadata
            ?.walletMovementId ===
          existing.id
      );


    if (generalMovement) {

      generalMovement.value =
        value;

      generalMovement.detail =
        'Saldo inicial de Bolsa General';

      generalMovement.metadata
        .balanceBefore =
        0;

      generalMovement.metadata
        .balanceAfter =
        value;

    }


    touchState();

    return existing;

  }


  if (
    value <= 0
  ) {

    state.generalWallet =
      0;

    touchState();

    return null;

  }


  return addMoneyToGeneralWallet({

    amount:
      value,

    type:
      WALLET_MOVEMENT_TYPES
        .OPENING_BALANCE,

    dayId,

    note:
      'Saldo inicial de Bolsa General',

    source:
      'opening_balance',

    impactsCash:
      false,

    metadata: {

      initialSystemBalance:
        true,

      financialMode:
        FINANCIAL_MODES.GENERAL,

    },

    createdAt,

  });

}
/* =========================================================
   GANANCIA YA REPARTIDA EN UNA JORNADA
========================================================= */

export function getProfitDistributed(

  dayId =
    getActiveDay()?.id ??
    null

) {

  if (!dayId) {

    return 0;

  }


  const distributions =
    (
      getState()
        .profitDistributions ??
      []
    ).filter(
      distribution =>
        distribution.dayId ===
        dayId
    );


  return roundMoney(
    sumBy(
      distributions,
      distribution =>
        toNonNegativeNumber(
          distribution.distributedAmount
        )
    )
  );

}
/* =========================================================
   GANANCIA REALMENTE DISPONIBLE PARA REPARTIR
========================================================= */
/* =========================================================
   GANANCIA REALMENTE DISPONIBLE PARA REPARTIR
========================================================= */

export function getAvailableProfitForDistribution(

  dayId =
    getActiveDay()?.id ??
    null

) {

  if (!dayId) {

    return 0;

  }


  const summary =
    getDayFinanceSummary(
      dayId
    );


  /*
    getDayFinanceSummary() ya descuenta
    todo lo repartido anteriormente.

    Por eso aquí NO debemos volver a
    restar getProfitDistributed().
  */
  return roundMoney(
    Math.max(
      0,
      toNonNegativeNumber(
        summary?.profit?.available
      )
    )
  );

}
/* =========================================================
   CALCULAR PLAN DE REPARTO DE GANANCIA
========================================================= */

export function calculateProfitDistributionPlan({

  distributionMode,

  employeeAmount = 0,

  dayId =
    getActiveDay()?.id ??
    null,

} = {}) {

  const availableProfit =
    getAvailableProfitForDistribution(
      dayId
    );


  if (
    availableProfit <= 0
  ) {

    return {

      distributionMode,

      availableProfitBefore:
        0,

      personOneAmount:
        0,

      personTwoAmount:
        0,

      employeeAmount:
        0,

      ownerAmount:
        0,

      distributedAmount:
        0,

      remainingProfit:
        0,

    };

  }


  /* =======================================================
     MITAD Y MITAD

     Se trabaja en múltiplos de $0.05.
     Si queda un níquel impar, la segunda persona
     recibe los $0.05 restantes.
  ======================================================= */

if (
  distributionMode ===
  'half'
) {

  /*
    Solo repartimos una cantidad que pueda
    expresarse exactamente en monedas de $0.05.

    Cualquier centavo sobrante queda como
    ganancia disponible.
  */
  const distributableAmount =
    roundMoney(
      Math.floor(
        (
          availableProfit +
          0.0001
        ) / 0.05
      ) * 0.05
    );


  const remainingProfit =
    roundMoney(
      Math.max(
        0,
        availableProfit -
        distributableAmount
      )
    );


  const totalNickels =
    Math.round(
      distributableAmount /
      0.05
    );


  const personOneNickels =
    Math.floor(
      totalNickels /
      2
    );


  const personOneAmount =
    roundMoney(
      personOneNickels *
      0.05
    );


  const personTwoAmount =
    roundMoney(
      distributableAmount -
      personOneAmount
    );


  return {

    distributionMode:
      'half',

    availableProfitBefore:
      availableProfit,

    personOneAmount,

    personTwoAmount,

    employeeAmount:
      0,

    ownerAmount:
      0,

    distributedAmount:
      distributableAmount,

    remainingProfit,

  };

}

  /* =======================================================
     EMPLEADO + PROPIETARIO
  ======================================================= */

  if (
    distributionMode ===
    'employee'
  ) {

    const employee =
      roundMoney(
        toNonNegativeNumber(
          employeeAmount
        )
      );


    if (
      employee >
      availableProfit + 0.005
    ) {

      throw new Error(
        `El empleado no puede recibir $${employee.toFixed(2)} porque solo hay $${availableProfit.toFixed(2)} de ganancia disponible.`
      );

    }


    const owner =
      roundMoney(
        Math.max(
          0,
          availableProfit -
          employee
        )
      );


    return {

      distributionMode:
        'employee',

      availableProfitBefore:
        availableProfit,

      personOneAmount:
        0,

      personTwoAmount:
        0,

      employeeAmount:
        employee,

      ownerAmount:
        owner,

      distributedAmount:
        availableProfit,

      remainingProfit:
        0,

    };

  }


  /*
    Sin reparto.
    La ganancia permanece disponible.
  */

  return {

    distributionMode:
      null,

    availableProfitBefore:
      availableProfit,

    personOneAmount:
      0,

    personTwoAmount:
      0,

    employeeAmount:
      0,

    ownerAmount:
      0,

    distributedAmount:
      0,

    remainingProfit:
      availableProfit,

  };

}
/* =========================================================
   REGISTRAR REPARTO DE GANANCIA
========================================================= */

export function registerProfitDistribution({

  distributionMode,

  employeeAmount = 0,

  note = '',

  dayId =
    getActiveDay()?.id ??
    null,

  createdAt =
    nowIso(),

} = {}) {

  if (!dayId) {

    throw new Error(
      'No hay una jornada activa para registrar el reparto.'
    );

  }


  if (
    distributionMode !== 'half' &&
    distributionMode !== 'employee'
  ) {

    throw new Error(
      'Selecciona una forma válida de repartir la ganancia.'
    );

  }


  const plan =
    calculateProfitDistributionPlan({

      distributionMode,

      employeeAmount,

      dayId,

    });


  if (
    plan.distributedAmount <= 0
  ) {

    throw new Error(
      'No hay ganancia disponible para repartir.'
    );

  }


  const record =
    createProfitDistributionRecord({

      id:
        uid(
          'profit_distribution'
        ),

      dayId,

      createdAt,

      financialMode:
        getFinancialMode(
          dayId
        ),

      distributionMode:
        plan.distributionMode,

      availableProfitBefore:
        plan.availableProfitBefore,

      personOneAmount:
        plan.personOneAmount,

      personTwoAmount:
        plan.personTwoAmount,

      employeeAmount:
        plan.employeeAmount,

      ownerAmount:
        plan.ownerAmount,

      distributedAmount:
        plan.distributedAmount,

      remainingProfit:
        plan.remainingProfit,

      note,

    });


  const state =
    getState();


  state.profitDistributions.push(
    record
  );


  touchState();


  return {

    record,

    plan,

  };

}
/* =========================================================
   CORRECCIÓN MANUAL DE BOLSA
========================================================= */

export function registerWalletCorrection({

  gasId = null,

  direction,

  amount,

  reason,

  note = '',

  dayId =
    getActiveDay()?.id ??
    null,

  createdAt =
    nowIso(),

} = {}) {

  if (!dayId) {

    throw new Error(
      'No hay una jornada activa para registrar la corrección.'
    );

  }


  const value =
    roundMoney(
      toNonNegativeNumber(
        amount
      )
    );


  if (
    value <= 0
  ) {

    throw new Error(
      'El valor de la corrección debe ser mayor que cero.'
    );

  }


  const cleanReason =
    String(
      reason ?? ''
    ).trim();


  if (!cleanReason) {

    throw new Error(
      'Debes indicar el motivo de la corrección.'
    );

  }


  if (
    direction !== 'increase' &&
    direction !== 'decrease'
  ) {

    throw new Error(
      'La corrección debe indicar si aumenta o disminuye la bolsa.'
    );

  }


  const cleanNote =
    String(
      note ?? ''
    ).trim();


  const detail =
    cleanNote
      ? `${cleanReason}: ${cleanNote}`
      : cleanReason;


  const financialMode =
    getFinancialMode(
      dayId
    );


  const metadata = {

    correction:
      true,

    correctionDirection:
      direction,

    correctionReason:
      cleanReason,

    financialMode,

  };


  /* =======================================================
     BOLSA GENERAL
  ======================================================= */

  if (
    financialMode ===
    FINANCIAL_MODES.GENERAL
  ) {

    if (
      direction ===
      'increase'
    ) {

      return addMoneyToGeneralWallet({

        amount:
          value,

        type:
          WALLET_MOVEMENT_TYPES
            .MANUAL_CORRECTION,

        dayId,

        note:
          detail,

        source:
          'manual_correction',

        impactsCash:
          false,

        metadata,

        createdAt,

      });

    }


    return spendGeneralWalletMoney({

      amount:
        value,

      type:
        WALLET_MOVEMENT_TYPES
          .MANUAL_CORRECTION,

      dayId,

      note:
        detail,

      metadata,

      /*
        Una corrección debe poder reflejar
        el dinero físico real aunque parte
        del saldo estuviera comprometido.
      */
      allowCommitted:
        true,

      createdAt,

    });

  }


  /* =======================================================
     BOLSA EXACTA POR MARCA
  ======================================================= */

  assertGasType(
    gasId
  );


  metadata.gasId =
    gasId;


  if (
    direction ===
    'increase'
  ) {

    return addMoneyToWallet({

      gasId,

      amount:
        value,

      type:
        WALLET_MOVEMENT_TYPES
          .MANUAL_CORRECTION,

      dayId,

      note:
        detail,

      source:
        'manual_correction',

      impactsCash:
        false,

      metadata,

      createdAt,

    });

  }


  return spendWalletMoney({

    gasId,

    amount:
      value,

    type:
      WALLET_MOVEMENT_TYPES
        .MANUAL_CORRECTION,

    dayId,

    note:
      detail,

    metadata,

    allowCommitted:
      true,

    createdAt,

  });

}
/* =========================================================
   PAGAR OBLIGACIÓN PENDIENTE DEL PROVEEDOR
========================================================= */

export function payPendingSupplierPayment({

  paymentId,

  dayId =
    getActiveDay()?.id ??
    null,

  createdAt =
    nowIso(),

} = {}) {

  if (!paymentId) {

    throw new Error(
      'Debes indicar la obligación del proveedor que deseas pagar.'
    );

  }


  if (!dayId) {

    throw new Error(
      'No hay una jornada activa para registrar el pago.'
    );

  }


  const payment =
    getSupplierPaymentById(
      paymentId
    );


  if (!payment) {

    throw new Error(
      'No se encontró la obligación del proveedor.'
    );

  }


  if (
    payment.status !==
    'pending'
  ) {

    throw new Error(
      'Esta obligación del proveedor ya fue pagada.'
    );

  }


  assertGasType(
    payment.gasId
  );


  const amount =
    roundMoney(
      toNonNegativeNumber(
        payment.amount
      )
    );


  if (
    amount <= 0
  ) {

    throw new Error(
      'La obligación pendiente no tiene un valor válido.'
    );

  }


  /*
    IMPORTANTE:

    La bolsa que debe pagar esta obligación
    depende del modo financiero con el que
    nació la deuda, no del modo del día actual.
  */
  const obligationFinancialMode =
    getFinancialMode(
      payment.dayId
    );


  let walletMovement;


  /* =======================================================
     OBLIGACIÓN DE BOLSA GENERAL
  ======================================================= */

  if (
    obligationFinancialMode ===
    FINANCIAL_MODES.GENERAL
  ) {

    walletMovement =
      spendGeneralWalletMoney({

        amount,

        type:
          WALLET_MOVEMENT_TYPES
            .REPLENISHMENT_PAYMENT,

        dayId,

        referenceId:
          payment.replenishmentId,

        note:
          `Pago de obligación pendiente ${getGasName(payment.gasId)}`,

        metadata: {

          supplierPaymentId:
            payment.id,

          replenishmentId:
            payment.replenishmentId,

          gasId:
            payment.gasId,

          supplierPaymentType:
            payment.type,

          obligationDayId:
            payment.dayId,

          financialMode:
            FINANCIAL_MODES.GENERAL,

        },

        /*
          Este dinero ya estaba comprometido
          precisamente para esta obligación.
        */
        allowCommitted:
          true,

        createdAt,

      });

  }

  /* =======================================================
     OBLIGACIÓN DE BOLSA EXACTA
  ======================================================= */

  else {

    walletMovement =
      spendWalletMoney({

        gasId:
          payment.gasId,

        amount,

        type:
          WALLET_MOVEMENT_TYPES
            .REPLENISHMENT_PAYMENT,

        dayId,

        referenceId:
          payment.replenishmentId,

        note:
          `Pago de obligación pendiente ${getGasName(payment.gasId)}`,

        metadata: {

          supplierPaymentId:
            payment.id,

          replenishmentId:
            payment.replenishmentId,

          supplierPaymentType:
            payment.type,

          obligationDayId:
            payment.dayId,

          financialMode:
            FINANCIAL_MODES.EXACT,

        },

        allowCommitted:
          true,

        createdAt,

      });

  }


  /*
    Solo después de que el dinero salió
    correctamente de la bolsa marcamos
    LA MISMA obligación como pagada.
  */
  payment.status =
    'paid';

  payment.paidAt =
    createdAt;


  touchState();


  return {

    payment,

    walletMovement,

  };

}
