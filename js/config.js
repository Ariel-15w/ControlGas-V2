/* =========================================================
   CONTROLGAS
   CONFIGURACIÓN GENERAL DEL SISTEMA

   Este archivo contiene únicamente reglas fijas:
   - Marcas
   - Costos de reposición
   - Precios permitidos
   - Tipos de movimientos
   - Métodos de pago
   - Claves de almacenamiento

   NO debe contener lógica de ventas ni manipulación del DOM.
========================================================= */


/* =========================================================
   INFORMACIÓN DE LA APLICACIÓN
========================================================= */

export const APP_CONFIG = Object.freeze({

  name: 'ControlGas',

  version: '5.0.0',

  schemaVersion: 5,

});


/* =========================================================
   LOCAL STORAGE
========================================================= */

/*
  Nueva base de datos local de la versión modular.
*/

export const STORAGE_KEY = 'controlGasBodegaV5';


/*
  Claves antiguas que storage.js podrá revisar
  para intentar migrar información.
*/

export const LEGACY_STORAGE_KEYS = Object.freeze([

  'controlGasBodegaV4',

  'controlGasBodegaV3',

]);



/* =========================================================
   MARCAS DE GAS
========================================================= */

export const GAS_TYPES = Object.freeze({

  duragas: Object.freeze({

    id: 'duragas',

    name: 'Duragas',

    shortName: 'Duragas',

    colorName: 'Amarillo',

    emoji: '🟡',

    /*
      Dinero que debe apartarse por cada cilindro vendido
      para poder reponerlo posteriormente.
    */

    replacementCost: 1.70,

  }),


  kinggas: Object.freeze({

    id: 'kinggas',

    name: 'King Gas',

    shortName: 'King Gas',

    colorName: 'Rosado',

    emoji: '🌸',

    /*
      Dinero que debe apartarse por cada cilindro vendido
      para poder reponerlo posteriormente.
    */

    replacementCost: 1.48,

  }),

});



/* =========================================================
   IDENTIFICADORES DE MARCAS
========================================================= */

export const GAS_IDS = Object.freeze({

  DURAGAS: 'duragas',

  KING_GAS: 'kinggas',

});


export const GAS_ID_LIST = Object.freeze([

  GAS_IDS.DURAGAS,

  GAS_IDS.KING_GAS,

]);



/* =========================================================
   PRECIOS DE VENTA PERMITIDOS
========================================================= */

/*
  No se permitirá guardar una venta con un precio
  diferente a estos valores.
*/

export const SALE_PRICES = Object.freeze([

  2.00,

  2.25,

  2.50,

]);


export const DEFAULT_SALE_PRICE = 2.25;



/* =========================================================
   MÉTODOS DE PAGO
========================================================= */

export const PAYMENT_METHODS = Object.freeze({

  CASH: 'Efectivo',

  TRANSFER: 'Transferencia',

  CREDIT: 'Fiado',

});


export const PAYMENT_METHOD_LIST = Object.freeze([

  PAYMENT_METHODS.CASH,

  PAYMENT_METHODS.CREDIT,

]);



/* =========================================================
   MODOS DE ENTREGA
========================================================= */

export const SALE_MODES = Object.freeze({

  NOW: 'now',

  LATER: 'later',

});


/*
  now:
  El cliente recibe el cilindro inmediatamente.

  later:
  El cliente paga ahora y el cilindro queda reservado
  para retirarlo posteriormente.
*/



/* =========================================================
   EXISTENCIAS DEL INVENTARIO
========================================================= */

export const INVENTORY_BUCKETS = Object.freeze({

  FULL: 'full',

  EMPTY: 'empty',

  RESERVED: 'reserved',

  LOANED: 'loaned',

});


export const INVENTORY_BUCKET_LABELS = Object.freeze({

  full: 'Llenos disponibles',

  empty: 'Vacíos',

  reserved: 'Reservados',

  loaned: 'Prestados',

});



/* =========================================================
   TIPOS DE CUENTAS PENDIENTES
========================================================= */

export const ACCOUNT_TYPES = Object.freeze({

  MONEY: 'money',

  TANKS: 'tanks',

  MIXED: 'mixed',

  PICKUP: 'pickup',

});


/*
  money:
  Solo debe dinero.

  tanks:
  Solo debe cilindros.

  mixed:
  Debe dinero y cilindros.

  pickup:
  Ya pagó, pero todavía debe retirar gas.
*/



/* =========================================================
   ESTADOS DE CUENTAS
========================================================= */

export const ACCOUNT_STATUS = Object.freeze({

  OPEN: 'open',

  CLOSED: 'closed',

});



/* =========================================================
   TIPOS DE MOVIMIENTOS
========================================================= */

/*
  Cada operación importante genera un movimiento.

  Esto permitirá reconstruir el historial completo
  de cualquier día.
*/

export const MOVEMENT_TYPES = Object.freeze({

  OPENING: 'opening',

  SALE: 'sale',

  PAYMENT: 'payment',

  TANK_RETURN: 'tank_return',

  PICKUP: 'pickup',

  REPLENISHMENT: 'replenishment',

  ADJUSTMENT: 'adjustment',

  LOAN: 'loan',

  LOAN_RETURN: 'loan_return',

  EXPENSE: 'expense',

  WALLET: 'wallet',

  EXTRA_CONTRIBUTION: 'extra_contribution',

  CLOSING: 'closing',

});


export const MOVEMENT_LABELS = Object.freeze({

  opening: 'Apertura',

  sale: 'Venta',

  payment: 'Pago pendiente',

  tank_return: 'Devolución de tanque',

  pickup: 'Retiro de reserva',

  replenishment: 'Reposición',

  adjustment: 'Ajuste',

  loan: 'Préstamo',

  loan_return: 'Devolución de préstamo',

  expense: 'Gasto',

  wallet: 'Movimiento de bolsa',

  extra_contribution: 'Aporte a reposición',

  closing: 'Cierre',

});



/* =========================================================
   MOVIMIENTOS DE LAS BOLSAS DE REPOSICIÓN
========================================================= */

export const WALLET_MOVEMENT_TYPES = Object.freeze({

  SALE_RESERVE: 'sale_reserve',

  REPLENISHMENT_PAYMENT: 'replenishment_payment',

  EXTRA_CONTRIBUTION: 'extra_contribution',

  MANUAL_CORRECTION: 'manual_correction',

  OPENING_BALANCE: 'opening_balance',

});


/*
  sale_reserve
  Dinero generado por ventas que debe reservarse.

  replenishment_payment
  Dinero utilizado cuando llega el proveedor.

  extra_contribution
  Dinero adicional que se agregó porque la bolsa
  no alcanzaba.

  manual_correction
  Corrección excepcional.

  opening_balance
  Saldo arrastrado o migrado al iniciar el sistema.
*/



/* =========================================================
   ORIGEN DE APORTES ADICIONALES
========================================================= */

export const EXTRA_CONTRIBUTION_SOURCES = Object.freeze({

  CASH: 'cash',

  PROFIT: 'profit',

  EXTERNAL: 'external',

  OTHER: 'other',

});


export const EXTRA_CONTRIBUTION_SOURCE_LABELS = Object.freeze({

  cash: 'Caja del día',

  profit: 'Ganancia disponible',

  external: 'Dinero externo / aporte personal',

  other: 'Otro',

});



/* =========================================================
   AJUSTES
========================================================= */

export const ADJUSTMENT_DIRECTIONS = Object.freeze({

  INCREASE: 'increase',

  DECREASE: 'decrease',

});


export const ADJUSTMENT_DIRECTION_LABELS = Object.freeze({

  increase: 'Aumentar',

  decrease: 'Disminuir',

});



/* =========================================================
   PRÉSTAMOS
========================================================= */

export const LOAN_ACTIONS = Object.freeze({

  LEND: 'lend',

  RETURN: 'return',

});


export const LOAN_ACTION_LABELS = Object.freeze({

  lend: 'Prestar',

  return: 'Devolver',

});



/* =========================================================
   ESTADO DEL DÍA
========================================================= */

export const DAY_STATUS = Object.freeze({

  OPEN: 'open',

  CLOSED: 'closed',

});



/* =========================================================
   ESTADO DE VENTAS
========================================================= */

export const SALE_STATUS = Object.freeze({

  COMPLETED: 'completed',

  PENDING_MONEY: 'pending_money',

  PENDING_TANKS: 'pending_tanks',

  PENDING_MIXED: 'pending_mixed',

  PENDING_PICKUP: 'pending_pickup',

});


export const SALE_STATUS_LABELS = Object.freeze({

  completed: 'Completada',

  pending_money: 'Debe dinero',

  pending_tanks: 'Debe tanques',

  pending_mixed: 'Debe dinero y tanques',

  pending_pickup: 'Pagado / pendiente de retirar',

});



/* =========================================================
   EFECTIVO RÁPIDO
========================================================= */

export const QUICK_CASH_VALUES = Object.freeze([

  0,

  'exact',

  5,

  10,

  20,

]);



/* =========================================================
   CANTIDADES RÁPIDAS
========================================================= */

export const QUICK_SALE_QUANTITIES = Object.freeze([

  1,

  2,

  4,

  6,

]);


export const QUICK_ADJUSTMENT_QUANTITIES = Object.freeze([

  1,

  2,

  5,

  10,

  20,

]);


export const QUICK_REPLENISHMENT_QUANTITIES = Object.freeze([

  10,

  20,

  50,

  100,

]);



/* =========================================================
   CONFIGURACIÓN FINANCIERA
========================================================= */

export const FINANCE_CONFIG = Object.freeze({

  /*
    Por ahora los costos adicionales de transporte
    NO se fijan automáticamente porque pueden variar
    según la operación real.

    Se registrarán al momento de la reposición.
  */

  defaultTransportCost: 0,

  defaultOtherCost: 0,


  /*
    Decimales utilizados para valores monetarios.
  */

  moneyDecimals: 2,


  /*
    Tolerancia para comparaciones de dinero.
    Evita errores como 0.30000000004.
  */

  moneyTolerance: 0.005,

});



/* =========================================================
   CONFIGURACIÓN DE INVENTARIO
========================================================= */

export const INVENTORY_CONFIG = Object.freeze({

  allowNegativeStock: false,

  allowOverselling: false,

  countLoanedAsControlledProperty: true,

  countReservedAsControlledProperty: true,

});



/* =========================================================
   CONFIGURACIÓN DE HISTORIAL
========================================================= */

export const HISTORY_CONFIG = Object.freeze({

  dashboardRecentMovements: 10,

  dashboardRecentReplenishments: 5,

  recentSales: 20,

});



/* =========================================================
   CONFIGURACIÓN DE INTERFAZ
========================================================= */

export const UI_CONFIG = Object.freeze({

  defaultView: 'dashboard',

  defaultHistoryMode: 'days',

  toastDurationMs: 2800,

  clockRefreshMs: 1000,

});



/* =========================================================
   VALORES PREDETERMINADOS
========================================================= */

export const DEFAULTS = Object.freeze({

  salePrice: DEFAULT_SALE_PRICE,

  paymentMethod: PAYMENT_METHODS.CASH,

  saleMode: SALE_MODES.NOW,

  adjustmentDirection:
    ADJUSTMENT_DIRECTIONS.INCREASE,

  loanAction:
    LOAN_ACTIONS.LEND,

  gasType:
    GAS_IDS.DURAGAS,

});



/* =========================================================
   FUNCIONES DE CONFIGURACIÓN
========================================================= */

/*
  Devuelve la configuración de una marca.
*/

export function getGasConfig(gasId) {

  return GAS_TYPES[gasId] ?? null;

}


/*
  Devuelve el costo de reposición de una marca.
*/

export function getReplacementCost(gasId) {

  const gas =
    getGasConfig(gasId);


  if (!gas) {

    return 0;

  }


  return gas.replacementCost;

}


/*
  Comprueba si la marca existe.
*/

export function isValidGasType(gasId) {

  return GAS_ID_LIST.includes(gasId);

}


/*
  Comprueba si un precio está permitido.
*/

export function isValidSalePrice(price) {

  const numericPrice =
    Number(price);


  return SALE_PRICES.some(

    allowedPrice =>
      Math.abs(
        allowedPrice -
        numericPrice
      ) < 0.001

  );

}


/*
  Comprueba si un método de pago existe.
*/

export function isValidPaymentMethod(method) {

  return PAYMENT_METHOD_LIST.includes(method);

}