/* =========================================================
   CONTROLGAS
   COORDINADOR PRINCIPAL

   Responsabilidades:
   - Inicializar la aplicación
   - Cargar localStorage
   - Abrir jornada
   - Conectar formularios
   - Conectar botones + / -
   - Conectar ventas
   - Conectar reposiciones
   - Conectar pendientes
   - Conectar ajustes
   - Conectar préstamos
   - Conectar cierre
   - Conectar historial
   - Exportar / importar
   - Navegación
   - Actualizar interfaz

   IMPORTANTE:

   app.js coordina.

   La lógica financiera, inventario y ventas
   permanece en sus módulos correspondientes.
========================================================= */


/* =========================================================
   CONFIGURACIÓN
========================================================= */

import {
  DEFAULTS,
  GAS_IDS,
  PAYMENT_METHODS,
  SALE_MODES,
  ADJUSTMENT_DIRECTIONS,
  LOAN_ACTIONS,
  MOVEMENT_TYPES,
  FINANCIAL_MODES,
  isValidSalePrice,
} from './config.js';



/* =========================================================
   ESTADO
========================================================= */

import {
  getState,
  getActiveDay,
  createDayRecord,
  createMovementBase,
  setActiveDayId,
  replaceState,
  touchState,
} from './state.js';



/* =========================================================
   ALMACENAMIENTO
========================================================= */

import {
  loadState,
  saveState,
  exportBackup,
  importBackupFile,
  clearControlGasData,
} from './storage.js';



/* =========================================================
   INVENTARIO
========================================================= */

import {
  applyOpeningInventory,
  getInventorySnapshot,
} from './inventory.js';



/* =========================================================
   FINANZAS
========================================================= */

import {
  getWalletsSnapshot,
  getFinancialMode,
  setOpeningWalletBalance,
  setOpeningGeneralWalletBalance,
} from './finance.js';

/* =========================================================
   VENTAS
========================================================= */

import {
  calculateSalePreview,
  registerSale,
} from './sales.js';



/* =========================================================
   PENDIENTES
========================================================= */

import {
  registerAccountPayment,
  registerTankReturn,
  registerReservedPickup,
} from './accounts.js';



/* =========================================================
   REPOSICIONES
========================================================= */

import {
  calculateReplenishmentPreview,
  registerReplenishment,
} from './replenishments.js';



/* =========================================================
   AJUSTES Y PRÉSTAMOS
========================================================= */

import {
  calculateAdjustmentPreview,
  registerAdjustment,
  registerLoanAction,
} from './adjustments.js';



/* =========================================================
   CIERRE
========================================================= */
import {
  calculateClosingPreview,
  closeDay,
  getLastClosingInventory,
} from './closing.js';
/* =========================================================
   HISTORIAL
========================================================= */

import {
  getSalesHistory,
} from './history.js';



/* =========================================================
   INTERFAZ
========================================================= */

import {
  byId,
  setText,
  setValue,
  getValue,
  setVisible,
  setOperationStatus,
  showToast,
  setActiveView,
  setHistoryMode,
  renderClock,
  renderAll,
  renderOpeningTotals,
  renderSalePreview,
  renderReplenishmentPreview,
  renderAdjustmentCurrent,
  renderClosingPreview,
  renderExpectedClosingInventory,
  renderHistorySales,
  renderHistoryMovements,
  renderHistoryReplenishments,
  readSalesHistoryFilters,
  readMovementHistoryFilters,
  readReplenishmentHistoryFilters,
  openPaymentDialog,
  closePaymentDialog,
  openDayDetail,
  closeDayDetail,
} from './ui.js';



/* =========================================================
   UTILIDADES
========================================================= */

import {
  cloneData,
  formatDateTime,
  getLocalDateKey,
  normalizeText,
  nowIso,
  roundMoney,
  stepNonNegativeInteger,
  toNonNegativeInteger,
  toNonNegativeNumber,
  uid,
} from './utils.js';



/* =========================================================
   SELECTOR SEGURO
========================================================= */

function all(
  selector
) {

  return Array.from(
    document.querySelectorAll(
      selector
    )
  );

}



/* =========================================================
   ACTIVAR BOTÓN DE UN GRUPO
========================================================= */

function activateButtonGroup({

  selector,

  dataProperty,

  value,

}) {

  all(selector)
    .forEach(
      button => {

        button.classList.toggle(
          'active',

          button.dataset[
            dataProperty
          ] ===
            String(value)
        );

      }
    );

}



/* =========================================================
   FECHAS AUTOMÁTICAS
========================================================= */

function refreshAutomaticDateTimes() {

  const current =
    formatDateTime(
      new Date()
    );


  setText(
    'openingAutoDateTime',
    current
  );


  setText(
    'saleAutoDateTime',
    current
  );


  setText(
    'replenishmentAutoDateTime',
    current
  );


  setText(
    'closingAutoDateTime',
    current
  );

}



/* =========================================================
   REFRESCAR TODA LA INTERFAZ
========================================================= */

function refreshUI() {

  renderAll();

  updateSalePreview();

  updateReplenishmentPreview();

  updateAdjustmentPreview();

  updateClosingPreview();

}



/* =========================================================
   APERTURA - LEER INVENTARIO
========================================================= */

function readOpeningInventory() {

  return {

    [GAS_IDS.DURAGAS]: {

      full:
        toNonNegativeInteger(
          getValue(
            'duragasFull'
          )
        ),

      empty:
        toNonNegativeInteger(
          getValue(
            'duragasEmpty'
          )
        ),

      reserved:
        toNonNegativeInteger(
          getValue(
            'duragasReserved'
          )
        ),

      loaned:
        toNonNegativeInteger(
          getValue(
            'duragasLoaned'
          )
        ),

    },


    [GAS_IDS.KING_GAS]: {

      full:
        toNonNegativeInteger(
          getValue(
            'kinggasFull'
          )
        ),

      empty:
        toNonNegativeInteger(
          getValue(
            'kinggasEmpty'
          )
        ),

      reserved:
        toNonNegativeInteger(
          getValue(
            'kinggasReserved'
          )
        ),

      loaned:
        toNonNegativeInteger(
          getValue(
            'kinggasLoaned'
          )
        ),

    },

  };

}



function isFirstSystemOpening() {

  const state =
    getState();


  if (
    state.days.length === 0
  ) {

    return true;

  }


  const activeDay =
    getActiveDay();


  return (
    state.days.length === 1 &&
    Boolean(activeDay) &&
    state.days[0].id ===
      activeDay.id
  );

}


function dayHasBusinessActivity(
  dayId
) {

  if (!dayId) {

    return false;

  }


  const state =
    getState();


  if (
    state.sales.some(
      sale => sale.dayId === dayId
    ) ||
    state.replenishments.some(
      item => item.dayId === dayId
    ) ||
    state.adjustments.some(
      item => item.dayId === dayId
    ) ||
    state.loans.some(
      item => item.dayId === dayId
    ) ||
    state.expenses.some(
      item => item.dayId === dayId
    )
  ) {

    return true;

  }


  return state.movements.some(
    movement => {

      if (
        movement.dayId !== dayId ||
        movement.type ===
          MOVEMENT_TYPES.OPENING
      ) {

        return false;

      }


      return !(
        movement.type ===
          MOVEMENT_TYPES.WALLET &&
        movement.metadata
          ?.walletMovementType ===
          'opening_balance'
      );

    }
  );

}

function readInitialWalletBalances() {

  return {

    [GAS_IDS.DURAGAS]:
      roundMoney(
        toNonNegativeNumber(
          getValue(
            'openingInitialDuragasWallet'
          )
        )
      ),

    [GAS_IDS.KING_GAS]:
      roundMoney(
        toNonNegativeNumber(
          getValue(
            'openingInitialKingGasWallet'
          )
        )
      ),

  };

}



/* =========================================================
   APERTURA - BOLSA GENERAL INICIAL
========================================================= */

function readInitialGeneralWalletBalance() {

  const input =
    byId(
      'openingInitialGeneralWallet'
    );


  /*
    Compatibilidad:

    Mientras index.html todavía no tenga
    este campo, simplemente usamos $0.

    Cuando actualicemos la interfaz,
    app.js ya estará preparado.
  */

  if (!input) {

    return 0;

  }


  return roundMoney(
    toNonNegativeNumber(
      getValue(
        'openingInitialGeneralWallet'
      )
    )
  );

}



/* =========================================================
   APERTURA - MODO FINANCIERO
========================================================= */

function readOpeningFinancialMode() {

  const input =
    byId(
      'openingFinancialMode'
    );


  /*
    Mientras la interfaz antigua todavía
    no tenga selector, seguimos trabajando
    en modo EXACTO.

    Así no rompemos el sistema actual.
  */

  if (!input) {

    return (
      DEFAULTS.financialMode ??
      FINANCIAL_MODES.EXACT
    );

  }


  const value =
    getValue(
      'openingFinancialMode'
    );


  return (
    value ===
      FINANCIAL_MODES.GENERAL

      ? FINANCIAL_MODES.GENERAL

      : FINANCIAL_MODES.EXACT
  );

}



/* =========================================================
   CARGAR INVENTARIO EN APERTURA
========================================================= */

function loadCurrentInventoryIntoOpeningForm() {

  const activeDay =
    getActiveDay();


  /*
    Si existe jornada abierta:
    usamos la fotografía de su apertura.

    Si no existe:
    usamos el último cierre físico.
  */

  const inventory =

    activeDay
      ?.opening
      ?.inventory

    ??

    getLastClosingInventory();


  setValue(
    'duragasFull',
    inventory[
      GAS_IDS.DURAGAS
    ].full
  );


  setValue(
    'duragasEmpty',
    inventory[
      GAS_IDS.DURAGAS
    ].empty
  );


  setValue(
    'duragasReserved',
    inventory[
      GAS_IDS.DURAGAS
    ].reserved
  );


  setValue(
    'duragasLoaned',
    inventory[
      GAS_IDS.DURAGAS
    ].loaned
  );


  setValue(
    'kinggasFull',
    inventory[
      GAS_IDS.KING_GAS
    ].full
  );


  setValue(
    'kinggasEmpty',
    inventory[
      GAS_IDS.KING_GAS
    ].empty
  );


  setValue(
    'kinggasReserved',
    inventory[
      GAS_IDS.KING_GAS
    ].reserved
  );


  setValue(
    'kinggasLoaned',
    inventory[
      GAS_IDS.KING_GAS
    ].loaned
  );


  renderOpeningTotals();

}



/* =========================================================
   PREPARAR MODO DE APERTURA
========================================================= */

function prepareOpeningMode() {

  const activeDay =
    getActiveDay();


  const firstOpening =
    isFirstSystemOpening();


  const hasActivity =
    activeDay

      ? dayHasBusinessActivity(
          activeDay.id
        )

      : false;


  /*
    MODO FINANCIERO

    Si la jornada ya existe usamos
    el modo guardado en ella.

    Si todavía no existe jornada,
    usamos el modo predeterminado.
  */

  const financialMode =

    activeDay
      ?.financialMode

    ??

    DEFAULTS.financialMode

    ??

    FINANCIAL_MODES.EXACT;


  const modeInput =
    byId(
      'openingFinancialMode'
    );


  if (
    modeInput
  ) {

    if (
      !hasActivity
    ) {

      setValue(
        'openingFinancialMode',
        financialMode
      );

    }


    modeInput.disabled =
      hasActivity;

  }


  const selectedMode =
    readOpeningFinancialMode();


  const isGeneral =
    selectedMode ===
    FINANCIAL_MODES.GENERAL;


  const isExact =
    !isGeneral;


  /*
    PRIMERA CONFIGURACIÓN

    Solo en la primera apertura se permite
    ingresar dinero histórico inicial.
  */

  setVisible(
    'openingInitialWalletsBlock',
    firstOpening &&
    isExact
  );


  setVisible(
    'openingInitialGeneralWalletBlock',
    firstOpening &&
    isGeneral
  );


  /*
    Compatibilidad con los nombres que
    utilizaremos después en index.html.
  */

  setVisible(
    'openingExactWalletsBlock',
    firstOpening &&
    isExact
  );


  setVisible(
    'openingGeneralWalletBlock',
    firstOpening &&
    isGeneral
  );


  /*
    INVENTARIO

    Mientras la jornada todavía no tenga
    movimientos se puede corregir.

    Después queda bloqueado.
  */

  if (
    !firstOpening
  ) {

    loadCurrentInventoryIntoOpeningForm();

  }


  const inventoryIds = [

    'duragasFull',
    'duragasEmpty',
    'duragasReserved',
    'duragasLoaned',

    'kinggasFull',
    'kinggasEmpty',
    'kinggasReserved',
    'kinggasLoaned',

  ];


  inventoryIds.forEach(
    id => {

      const input =
        byId(id);


      if (input) {

        input.readOnly =
          hasActivity;

      }

    }
  );


  /*
    BOLSAS EXACTAS INICIALES
  */

  [
    'openingInitialDuragasWallet',
    'openingInitialKingGasWallet',
  ].forEach(
    id => {

      const input =
        byId(id);


      if (input) {

        input.readOnly =
          !firstOpening ||
          hasActivity ||
          !isExact;

      }

    }
  );


  /*
    BOLSA GENERAL INICIAL
  */

  const generalInput =
    byId(
      'openingInitialGeneralWallet'
    );


  if (
    generalInput
  ) {

    generalInput.readOnly =
      !firstOpening ||
      hasActivity ||
      !isGeneral;

  }


  /*
    Primera configuración sin actividad:

    mostramos los saldos reales actualmente
    guardados en el sistema.
  */

  if (
    firstOpening &&
    !hasActivity
  ) {

    const wallets =
      getWalletsSnapshot();


    setValue(
      'openingInitialDuragasWallet',
      wallets[
        GAS_IDS.DURAGAS
      ] ??
      0
    );


    setValue(
      'openingInitialKingGasWallet',
      wallets[
        GAS_IDS.KING_GAS
      ] ??
      0
    );


    if (
      generalInput
    ) {

      setValue(
        'openingInitialGeneralWallet',
        getGeneralWalletBalance()
      );

    }

  }


  /*
    MENSAJE DE AYUDA
  */

  let modeText;


  if (
    firstOpening
  ) {

    modeText =
      hasActivity

        ? 'La configuración inicial ya tiene movimientos y no puede modificarse.'

        : isGeneral

          ? 'Primera configuración: usarás una sola Bolsa General. Ingresa el inventario y el dinero histórico que ya existía antes de comenzar.'

          : 'Primera configuración: usarás bolsas separadas por marca. Ingresa el inventario y los saldos históricos existentes.';

  }
  else if (
    activeDay &&
    hasActivity
  ) {

    modeText =
      'La jornada ya tiene movimientos. El inventario y el modo financiero quedaron bloqueados para conservar el registro original.';

  }
  else if (
    activeDay
  ) {

    modeText =
      isGeneral

        ? 'La jornada está abierta en modo Bolsa General y todavía no tiene movimientos. Puedes corregir la apertura antes de comenzar.'

        : 'La jornada está abierta con bolsas exactas por marca y todavía no tiene movimientos. Puedes corregir la apertura antes de comenzar.';

  }
  else {

    modeText =
      'El último cierre aparece como referencia. Revisa el inventario y selecciona cómo manejarás las bolsas durante esta jornada.';

  }


  setText(
    'openingModeText',
    modeText
  );


  setVisible(
    'openingWarning',
    Boolean(
      activeDay &&
      hasActivity
    )
  );


  /*
    BOTÓN GUARDAR
  */

  const submitButton =
    document.querySelector(
      '#openingForm button[type="submit"]'
    );


  if (
    submitButton
  ) {

    submitButton.disabled =
      hasActivity;

  }


  renderOpeningTotals();

}



/* =========================================================
   REGISTRAR / ACTUALIZAR APERTURA
========================================================= */

function openBusinessDay() {

  const activeDay =
    getActiveDay();


  if (
    activeDay &&
    dayHasBusinessActivity(
      activeDay.id
    )
  ) {

    throw new Error(
      'La jornada ya tiene movimientos. La apertura ya no puede modificarse.'
    );

  }


  const stateBefore =
    cloneData(
      getState()
    );


  try {

    const openedAt =
      nowIso();


    const firstOpening =
      isFirstSystemOpening();


    const financialMode =
      readOpeningFinancialMode();


    const dayId =
      activeDay
        ?.id ??
      uid('day');


    const inventory =
      readOpeningInventory();


    /*
      Saldos actuales / iniciales
      de cada sistema financiero.
    */

    const wallets =

      firstOpening

        ? readInitialWalletBalances()

        : getWalletsSnapshot();


    const generalWallet =

      firstOpening

        ? readInitialGeneralWalletBalance()

        : getGeneralWalletBalance();


    const openingCashFund =
      roundMoney(
        toNonNegativeNumber(
          getValue(
            'openingCashFund'
          )
        )
      );


    const note =
      normalizeText(
        getValue(
          'openingNote'
        )
      );


    /*
      El conteo físico escrito en apertura
      pasa a ser el inventario real.
    */

    applyOpeningInventory(
      inventory
    );


    /* =====================================================
       ACTUALIZAR JORNADA YA ABIERTA
    ===================================================== */

    if (
      activeDay
    ) {

      activeDay.financialMode =
        financialMode;


      activeDay.opening.inventory =
        cloneData(
          inventory
        );


      activeDay.opening.wallets =
        cloneData(
          wallets
        );


      activeDay.opening.generalWallet =
        roundMoney(
          generalWallet
        );


      activeDay.opening.cashFund =
        openingCashFund;


      activeDay.opening.note =
        note;


      /*
        Durante la primera configuración
        sí podemos establecer dinero histórico.
      */

      if (
        firstOpening
      ) {

        if (
          financialMode ===
          FINANCIAL_MODES.GENERAL
        ) {

          /*
            Solo una Bolsa General.

            Dejamos las bolsas exactas en cero
            para no duplicar dinero inicial.
          */

          setOpeningWalletBalance({

            gasId:
              GAS_IDS.DURAGAS,

            amount: 0,

            dayId:
              activeDay.id,

            createdAt:
              openedAt,

          });


          setOpeningWalletBalance({

            gasId:
              GAS_IDS.KING_GAS,

            amount: 0,

            dayId:
              activeDay.id,

            createdAt:
              openedAt,

          });


          setOpeningGeneralWalletBalance({

            amount:
              generalWallet,

            dayId:
              activeDay.id,

            createdAt:
              openedAt,

          });

        }
        else {

          /*
            Bolsas exactas por marca.

            Bolsa General queda en cero.
          */

          setOpeningGeneralWalletBalance({

            amount: 0,

            dayId:
              activeDay.id,

            createdAt:
              openedAt,

          });


          setOpeningWalletBalance({

            gasId:
              GAS_IDS.DURAGAS,

            amount:
              wallets[
                GAS_IDS.DURAGAS
              ],

            dayId:
              activeDay.id,

            createdAt:
              openedAt,

          });


          setOpeningWalletBalance({

            gasId:
              GAS_IDS.KING_GAS,

            amount:
              wallets[
                GAS_IDS.KING_GAS
              ],

            dayId:
              activeDay.id,

            createdAt:
              openedAt,

          });

        }

      }


      /*
        Actualizar también el movimiento
        histórico de apertura.
      */

      const openingMovement =
        getState()
          .movements
          .find(
            movement =>

              movement.dayId ===
                activeDay.id

              &&

              movement.type ===
                MOVEMENT_TYPES.OPENING
          );


      if (
        openingMovement
      ) {

        openingMovement.metadata = {

          openingInventory:
            cloneData(
              inventory
            ),

          openingWallets:
            cloneData(
              wallets
            ),

          openingGeneralWallet:
            roundMoney(
              generalWallet
            ),

          financialMode,

          openingCashFund,

        };

      }


      touchState();

      saveState();


      return activeDay;

    }


    /* =====================================================
       CREAR NUEVA JORNADA
    ===================================================== */

    const day =
      createDayRecord({

        id:
          dayId,

        dateKey:
          getLocalDateKey(
            openedAt
          ),

        openedAt,

        financialMode,

        openingInventory:
          inventory,

        openingWallets:
          wallets,

        openingGeneralWallet:
          generalWallet,

        openingCashFund,

        note,

      });


    getState()
      .days
      .push(
        day
      );


    setActiveDayId(
      day.id
    );


    /* =====================================================
       PRIMEROS SALDOS HISTÓRICOS
    ===================================================== */

    if (
      firstOpening
    ) {

      if (
        financialMode ===
        FINANCIAL_MODES.GENERAL
      ) {

        setOpeningWalletBalance({

          gasId:
            GAS_IDS.DURAGAS,

          amount: 0,

          dayId:
            day.id,

          createdAt:
            openedAt,

        });


        setOpeningWalletBalance({

          gasId:
            GAS_IDS.KING_GAS,

          amount: 0,

          dayId:
            day.id,

          createdAt:
            openedAt,

        });


        setOpeningGeneralWalletBalance({

          amount:
            generalWallet,

          dayId:
            day.id,

          createdAt:
            openedAt,

        });

      }
      else {

        setOpeningGeneralWalletBalance({

          amount: 0,

          dayId:
            day.id,

          createdAt:
            openedAt,

        });


        setOpeningWalletBalance({

          gasId:
            GAS_IDS.DURAGAS,

          amount:
            wallets[
              GAS_IDS.DURAGAS
            ],

          dayId:
            day.id,

          createdAt:
            openedAt,

        });


        setOpeningWalletBalance({

          gasId:
            GAS_IDS.KING_GAS,

          amount:
            wallets[
              GAS_IDS.KING_GAS
            ],

          dayId:
            day.id,

          createdAt:
            openedAt,

        });

      }

    }


    /* =====================================================
       MOVIMIENTO DE APERTURA
    ===================================================== */

    const movement =
      createMovementBase({

        id:
          uid('mov'),

        dayId:
          day.id,

        type:
          MOVEMENT_TYPES.OPENING,

        createdAt:
          openedAt,

        referenceId:
          day.id,

        reference:
          `Apertura ${day.dateKey}`,

        detail:
          financialMode ===
            FINANCIAL_MODES.GENERAL

            ? 'Inicio de jornada - Bolsa General.'

            : 'Inicio de jornada - Bolsas exactas.',

        value: 0,

        metadata: {

          openingInventory:
            cloneData(
              inventory
            ),

          openingWallets:
            cloneData(
              wallets
            ),

          openingGeneralWallet:
            roundMoney(
              generalWallet
            ),

          financialMode,

          openingCashFund,

        },

      });


    getState()
      .movements
      .push(
        movement
      );


    touchState();

    saveState();


    return day;

  }
  catch (error) {

    replaceState(
      stateBefore
    );


    try {

      saveState();

    }
    catch {

      /*
        Estado restaurado al menos
        dentro de memoria.
      */

    }


    throw error;

  }

}



/* =========================================================
   FORMULARIO DE APERTURA
========================================================= */

function bindOpeningForm() {

  const form =
    byId(
      'openingForm'
    );


  if (!form) {

    return;

  }


  form.addEventListener(
    'input',
    () => {

      renderOpeningTotals();

    }
  );


  /*
    Cuando agreguemos el selector al HTML,
    cambiar Exacta / General actualizará
    inmediatamente los campos visibles.
  */

  byId(
    'openingFinancialMode'
  )?.addEventListener(
    'change',
    () => {

      prepareOpeningMode();

    }
  );


  form.addEventListener(
    'submit',
    event => {

      event.preventDefault();


      try {

        const day =
          openBusinessDay();


        showToast(

          day.financialMode ===
            FINANCIAL_MODES.GENERAL

            ? 'Jornada abierta con Bolsa General.'

            : 'Jornada abierta con bolsas exactas.',

          'good'

        );


        refreshUI();


        setActiveView(
          'dashboard'
        );

      }
      catch (error) {

        setOperationStatus(
          'openingWarning',
          error.message,
          'bad'
        );


        showToast(
          error.message,
          'bad'
        );

      }

    }
  );

}
/* =========================================================
   VENTA - LEER CANTIDADES
========================================================= */

function readSaleQuantities() {

  return {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        getValue(
          'qtyDuragas'
        )
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        getValue(
          'qtyKinggas'
        )
      ),

  };

}



/* =========================================================
   VENTA - LEER VACÍOS
========================================================= */

function readSaleEmptyReceived() {

  if (
    getValue(
      'emptyExchangeMode'
    ) === 'complete'
  ) {

    return readSaleQuantities();

  }

  return {

    [GAS_IDS.DURAGAS]:
      toNonNegativeInteger(
        getValue(
          'emptyDuragas'
        )
      ),

    [GAS_IDS.KING_GAS]:
      toNonNegativeInteger(
        getValue(
          'emptyKinggas'
        )
      ),

  };

}



/* =========================================================
   PREVISUALIZAR VENTA
========================================================= */

function updateSalePreview() {

  try {

    const emptyMode =
      getValue(
        'emptyExchangeMode'
      ) ||
      'complete';


    if (
      emptyMode ===
      'complete'
    ) {

      syncEmptyReceivedToOrder();

    }

    const price =
      toNonNegativeNumber(
        getValue(
          'salePrice'
        ) ||
        DEFAULTS.salePrice
      );


    const paymentMethod =
      getValue(
        'salePaymentMethod'
      ) ||
      PAYMENT_METHODS.CASH;


    const saleMode =
      getValue(
        'saleMode'
      ) ||
      SALE_MODES.NOW;


    const received =
      toNonNegativeNumber(
        getValue(
          'saleReceived'
        )
      );


    const preview =
      calculateSalePreview({

        quantities:
          readSaleQuantities(),

        emptyReceived:
          readSaleEmptyReceived(),

        price,

        paymentMethod,

        received,

        saleMode,

      });


    renderSalePreview(
      preview
    );


    /*
      El campo "recibido" solo tiene sentido
      para efectivo.

      Transferencia = pago exacto.
      Fiado = cero cobrado.
    */

    setVisible(
      'receivedBlock',
      paymentMethod ===
        PAYMENT_METHODS.CASH
    );


    return preview;

  }
  catch (error) {

    setOperationStatus(
      'saleStatus',
      error.message,
      'bad'
    );


    return null;

  }

}



function updateSalePaymentAvailability() {

  const saleMode =
    getValue(
      'saleMode'
    ) ||
    SALE_MODES.NOW;


  const creditButton =
    document.querySelector(
      '[data-payment-method="Fiado"]'
    );


  if (!creditButton) {

    return;

  }


  const isPickupLater =
    saleMode ===
    SALE_MODES.LATER;


  creditButton.disabled =
    isPickupLater;


  creditButton.classList.toggle(
    'disabled',
    isPickupLater
  );


  if (
    isPickupLater &&
    getValue(
      'salePaymentMethod'
    ) ===
      PAYMENT_METHODS.CREDIT
  ) {

    setValue(
      'salePaymentMethod',
      PAYMENT_METHODS.CASH
    );


    activateButtonGroup({

      selector:
        '[data-payment-method]',

      dataProperty:
        'paymentMethod',

      value:
        PAYMENT_METHODS.CASH,

    });


    const preview =
      calculateSalePreview({

        quantities:
          readSaleQuantities(),

        emptyReceived:
          readSaleEmptyReceived(),

        price:
          toNonNegativeNumber(
            getValue(
              'salePrice'
            ) ||
            DEFAULTS.salePrice
          ),

        paymentMethod:
          PAYMENT_METHODS.CASH,

        received: 0,

        saleMode,

      });


    setValue(
      'saleReceived',
      preview.total
    );

  }

}



/* =========================================================
   BOTONES DE CANTIDAD DE VENTA
========================================================= */

function bindSaleQuantityButtons() {

  document.addEventListener(
    'click',
    event => {

      const stepButton =
        event.target.closest(
          '[data-qty-step]'
        );


      if (stepButton) {

        const gasId =
          stepButton.dataset.gas;


        const inputId =

          gasId ===
            GAS_IDS.KING_GAS ||
          gasId ===
            'kinggas'

            ? 'qtyKinggas'

            : 'qtyDuragas';


        const current =
          getValue(
            inputId
          );


        const next =
          stepNonNegativeInteger(

            current,

            stepButton.dataset.qtyStep

          );


        setValue(
          inputId,
          next
        );


        updateSalePreview();


        return;

      }



      const setButton =
        event.target.closest(
          '[data-qty-set]'
        );


      if (setButton) {

        const gasId =
          setButton.dataset.gas;


        const inputId =

          gasId ===
            GAS_IDS.KING_GAS ||
          gasId ===
            'kinggas'

            ? 'qtyKinggas'

            : 'qtyDuragas';


        setValue(
          inputId,
          toNonNegativeInteger(
            setButton.dataset.qtySet
          )
        );


        updateSalePreview();

      }

    }
  );

}



/* =========================================================
   BOTONES DE VACÍOS
========================================================= */

function getSoldUnitsTotal() {

  const quantities =
    readSaleQuantities();


  return (
    quantities[GAS_IDS.DURAGAS]
    +
    quantities[GAS_IDS.KING_GAS]
  );

}


function syncEmptyReceivedToOrder() {

  setValue(
    'emptyDuragas',
    getValue(
      'qtyDuragas'
    )
  );


  setValue(
    'emptyKinggas',
    getValue(
      'qtyKinggas'
    )
  );

}


function setEmptyValueWithLimit(
  inputId,
  requestedValue
) {

  const soldTotal =
    getSoldUnitsTotal();


  const requested =
    toNonNegativeInteger(
      requestedValue
    );


  const otherInputId =
    inputId === 'emptyDuragas'
      ? 'emptyKinggas'
      : 'emptyDuragas';


  const otherQuantity =
    toNonNegativeInteger(
      getValue(
        otherInputId
      )
    );


  const maximum =
    Math.max(
      0,
      soldTotal -
      otherQuantity
    );


  const finalValue =
    Math.min(
      requested,
      maximum
    );


  setValue(
    inputId,
    finalValue
  );


  if (
    requested >
    maximum
  ) {

    setOperationStatus(
      'saleExchangeStatus',
      `No puedes recibir más de ${soldTotal} tanque(s) porque solamente estás entregando ${soldTotal}.`,
      'bad'
    );

  }


  return finalValue;

}


function limitCurrentEmptyValues() {

  setEmptyValueWithLimit(
    'emptyDuragas',
    getValue(
      'emptyDuragas'
    )
  );


  setEmptyValueWithLimit(
    'emptyKinggas',
    getValue(
      'emptyKinggas'
    )
  );

}

function bindEmptyButtons() {

  document.addEventListener(
    'click',
    event => {

      const stepButton =
        event.target.closest(
          '[data-empty-step]'
        );


      if (stepButton) {

        setValue(
          'emptyExchangeMode',
          'custom'
        );

        const gasId =
          stepButton.dataset.gas;


        const inputId =

          gasId ===
            GAS_IDS.KING_GAS ||
          gasId ===
            'kinggas'

            ? 'emptyKinggas'

            : 'emptyDuragas';


        const next =
          stepNonNegativeInteger(

            getValue(
              inputId
            ),

            stepButton.dataset.emptyStep

          );


        setEmptyValueWithLimit(
          inputId,
          next
        );


        updateSalePreview();


        return;

      }



      const setButton =
        event.target.closest(
          '[data-empty-set]'
        );


      if (setButton) {

        setValue(
          'emptyExchangeMode',
          'custom'
        );

        const gasId =
          setButton.dataset.gas;


        const inputId =

          gasId ===
            GAS_IDS.KING_GAS ||
          gasId ===
            'kinggas'

            ? 'emptyKinggas'

            : 'emptyDuragas';


        setEmptyValueWithLimit(
          inputId,
          setButton.dataset.emptySet
        );


        updateSalePreview();

      }

    }
  );



  byId(
    'emptySameAsOrderBtn'
  )?.addEventListener(
    'click',
    () => {

      setValue(
        'emptyExchangeMode',
        'complete'
      );

      syncEmptyReceivedToOrder();

      setVisible(
        'emptyExchangeSection',
        false
      );


      updateSalePreview();

    }
  );



  byId(
    'emptyAllZeroBtn'
  )?.addEventListener(
    'click',
    () => {

      setValue(
        'emptyExchangeMode',
        'custom'
      );

      setVisible(
        'emptyExchangeSection',
        true
      );

      setValue(
        'emptyDuragas',
        0
      );


      setValue(
        'emptyKinggas',
        0
      );


      updateSalePreview();

    }
  );


  byId(
    'editEmptyExchangeBtn'
  )?.addEventListener(
    'click',
    () => {

      syncEmptyReceivedToOrder();

      setValue(
        'emptyExchangeMode',
        'custom'
      );

      setVisible(
        'emptyExchangeSection',
        true
      );

      updateSalePreview();

    }
  );

}



/* =========================================================
   PRECIO DE VENTA
========================================================= */

function bindSalePriceButtons() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-price], [data-sale-price]'
        );


      if (!button) {

        return;

      }


      const price =

        button.dataset.price ??
        button.dataset.salePrice;


      if (
        !isValidSalePrice(
          price
        )
      ) {

        return;

      }


      setValue(
        'salePrice',
        Number(price)
      );


      all(
        '[data-price], [data-sale-price]'
      ).forEach(
        item => {

          const itemPrice =
            item.dataset.price ??
            item.dataset.salePrice;


          item.classList.toggle(
            'active',

            Number(itemPrice) ===
            Number(price)
          );

        }
      );


      updateSalePreview();

    }
  );

}



/* =========================================================
   MODO DE ENTREGA
========================================================= */

function bindSaleModeButtons() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-sale-mode]'
        );


      if (!button) {

        return;

      }


      const mode =
        button.dataset.saleMode;


      if (
        mode !==
          SALE_MODES.NOW &&
        mode !==
          SALE_MODES.LATER
      ) {

        return;

      }


      setValue(
        'saleMode',
        mode
      );


      updateSalePaymentAvailability();


      activateButtonGroup({

        selector:
          '[data-sale-mode]',

        dataProperty:
          'saleMode',

        value:
          mode,

      });


      updateSalePreview();

    }
  );

}



/* =========================================================
   MÉTODO DE PAGO DE VENTA
========================================================= */

function bindSalePaymentButtons() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-payment-method]'
        );


      if (!button) {

        return;

      }


      const method =
        button.dataset
          .paymentMethod;


      setValue(
        'salePaymentMethod',
        method
      );


      activateButtonGroup({

        selector:
          '[data-payment-method]',

        dataProperty:
          'paymentMethod',

        value:
          method,

      });



      if (
        method ===
        PAYMENT_METHODS.CREDIT
      ) {

        setValue(
          'saleReceived',
          0
        );

      }



      updateSalePreview();

    }
  );

}



/* =========================================================
   EFECTIVO RÁPIDO
========================================================= */

function bindQuickCashButtons() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-cash]'
        );


      if (!button) {

        return;

      }


      const value =
        button.dataset.cash;


      if (
        value === 'exact'
      ) {

        const preview =
          updateSalePreview();


        setValue(
          'saleReceived',
          preview?.total ??
          0
        );

      }
      else {

        setValue(
          'saleReceived',
          toNonNegativeNumber(
            value
          )
        );

      }


      updateSalePreview();

    }
  );

}



/* =========================================================
   RESTABLECER FORMULARIO DE VENTA
========================================================= */

function resetSaleFormAfterSave() {

  setValue(
    'saleCustomer',
    ''
  );


  setValue(
    'qtyDuragas',
    0
  );


  setValue(
    'qtyKinggas',
    0
  );


  setValue(
    'emptyDuragas',
    0
  );


  setValue(
    'emptyKinggas',
    0
  );


  setValue(
    'emptyExchangeMode',
    'complete'
  );


  setVisible(
    'emptyExchangeSection',
    false
  );


  setValue(
    'saleReceived',
    0
  );


  setValue(
    'saleNote',
    ''
  );


  setValue(
    'saleMode',
    SALE_MODES.NOW
  );


  setValue(
    'salePaymentMethod',
    PAYMENT_METHODS.CASH
  );


  updateSalePaymentAvailability();


  activateButtonGroup({

    selector:
      '[data-sale-mode]',

    dataProperty:
      'saleMode',

    value:
      SALE_MODES.NOW,

  });


  activateButtonGroup({

    selector:
      '[data-payment-method]',

    dataProperty:
      'paymentMethod',

    value:
      PAYMENT_METHODS.CASH,

  });

}



/* =========================================================
   FORMULARIO DE VENTA
========================================================= */

function bindSaleForm() {

  const form =
    byId(
      'saleForm'
    );


  if (!form) {

    return;

  }


  form.addEventListener(
    'input',
    event => {

      const target =
        event.target;


      if (
        target?.id === 'qtyDuragas' ||
        target?.id === 'qtyKinggas'
      ) {

        if (
          getValue(
            'emptyExchangeMode'
          ) === 'complete'
        ) {

          syncEmptyReceivedToOrder();

        }
        else {

          limitCurrentEmptyValues();

        }

      }


      if (
        target?.id === 'emptyDuragas' ||
        target?.id === 'emptyKinggas'
      ) {

        setValue(
          'emptyExchangeMode',
          'custom'
        );

        setEmptyValueWithLimit(
          target.id,
          target.value
        );

      }

      updateSalePreview();

    }
  );


  form.addEventListener(
    'change',
    () => {

      updateSalePreview();

    }
  );


  form.addEventListener(
    'submit',
    event => {

      event.preventDefault();


      try {

        const result =
          registerSale({

            customer:
              getValue(
                'saleCustomer'
              ),

            quantities:
              readSaleQuantities(),

            emptyReceived:
              readSaleEmptyReceived(),

            price:
              toNonNegativeNumber(
                getValue(
                  'salePrice'
                )
              ),

            paymentMethod:
              getValue(
                'salePaymentMethod'
              ),

            received:
              toNonNegativeNumber(
                getValue(
                  'saleReceived'
                )
              ),

            saleMode:
              getValue(
                'saleMode'
              ),

            note:
              getValue(
                'saleNote'
              ),

          });


        resetSaleFormAfterSave();


        refreshUI();


        showToast(
          `Venta registrada por ${roundMoney(
            result.sale.total
          ).toFixed(2)}.`,
          'good'
        );

      }
      catch (error) {

        setOperationStatus(
          'saleStatus',
          error.message,
          'bad'
        );


        showToast(
          error.message,
          'bad'
        );

      }

    }
  );

}



/* =========================================================
   REPOSICIÓN - LEER FORMULARIO
========================================================= */

function readReplenishmentForm() {

  return {

    gasId:
      getValue(
        'replenishmentGasType'
      ) ||
      GAS_IDS.DURAGAS,

    quantity:
      toNonNegativeInteger(
        getValue(
          'replenishmentQty'
        )
      ),

    emptyOut:
      toNonNegativeInteger(
        getValue(
          'replenishmentEmptyOut'
        )
      ),

    transportCost:
      toNonNegativeNumber(
        getValue(
          'replenishmentTransport'
        )
      ),

    otherCost:
      toNonNegativeNumber(
        getValue(
          'replenishmentOtherCost'
        )
      ),

    extraContribution:
      toNonNegativeNumber(
        getValue(
          'replenishmentExtraContribution'
        )
      ),

    extraContributionSource:
      getValue(
        'replenishmentExtraSource'
      ),

    note:
      getValue(
        'replenishmentNote'
      ),

  };

}



/* =========================================================
   PREVISUALIZAR REPOSICIÓN
========================================================= */

function updateReplenishmentPreview() {

  try {

    const values =
      readReplenishmentForm();


    const preview =
      calculateReplenishmentPreview(
        values
      );


    renderReplenishmentPreview(
      preview
    );


    return preview;

  }
  catch (error) {

    setOperationStatus(
      'replenishmentStatus',
      error.message,
      'bad'
    );


    return null;

  }

}



/* =========================================================
   CONTADORES DE REPOSICIÓN
========================================================= */

function bindReplenishmentButtons() {

  document.addEventListener(
    'click',
    event => {

      const step =
        event.target.closest(
          '[data-replenishment-step]'
        );


      if (step) {

        const field =
          step.dataset.field;


        if (
          field &&
          byId(field)
        ) {

          setValue(
            field,

            stepNonNegativeInteger(

              getValue(
                field
              ),

              step.dataset
                .replenishmentStep

            )
          );


          updateReplenishmentPreview();

        }


        return;

      }



      const set =
        event.target.closest(
          '[data-replenishment-set]'
        );


      if (set) {

        const field =
          set.dataset.field;


        if (
          field &&
          byId(field)
        ) {

          setValue(
            field,
            toNonNegativeInteger(
              set.dataset
                .replenishmentSet
            )
          );


          updateReplenishmentPreview();

        }

      }

    }
  );



   byId(
    'replenishmentSameEmptyBtn'
  )?.addEventListener(
    'click',
    () => {

      /*
        =====================================================
        MARCA SELECCIONADA
        =====================================================
      */

      const gasId =
        getValue(
          'replenishmentGasType'
        ) ||
        GAS_IDS.DURAGAS;


      /*
        =====================================================
        INVENTARIO ACTUAL
        =====================================================
      */

      const inventory =
        getInventorySnapshot();


      /*
        =====================================================
        VACÍOS DISPONIBLES DE ESA MARCA
        =====================================================
      */

      const emptyAvailable =
        toNonNegativeInteger(
          inventory
            ?.[gasId]
            ?.empty ??
          0
        );


      /*
        =====================================================
        CANTIDAD DE LLENOS QUE TRAE EL PROVEEDOR
        =====================================================
      */

      const quantity =
        toNonNegativeInteger(
          getValue(
            'replenishmentQty'
          )
        );


      /*
        =====================================================
        USAR COMO MÁXIMO LOS VACÍOS QUE REALMENTE EXISTEN

        Ejemplo:

        Llegan 105 llenos
        Tengo 103 vacíos

        Resultado:
        Entrego 103 vacíos
        =====================================================
      */

      const emptyToUse =
        Math.min(
          quantity,
          emptyAvailable
        );


      /*
        =====================================================
        ACTUALIZAR CAMPO
        =====================================================
      */

      setValue(
        'replenishmentEmptyOut',
        emptyToUse
      );


      /*
        =====================================================
        ACTUALIZAR PREVISUALIZACIÓN
        =====================================================
      */

      updateReplenishmentPreview();

    }
  );



  byId(
    'replenishmentZeroEmptyBtn'
  )?.addEventListener(
    'click',
    () => {

      setValue(
        'replenishmentEmptyOut',
        0
      );


      updateReplenishmentPreview();

    }
  );

}



/* =========================================================
   FORMULARIO REPOSICIÓN
========================================================= */

function bindReplenishmentForm() {

  const form =
    byId(
      'replenishmentForm'
    );


  if (!form) {

    return;

  }


  form.addEventListener(
    'input',
    updateReplenishmentPreview
  );


  form.addEventListener(
    'change',
    updateReplenishmentPreview
  );


  form.addEventListener(
    'submit',
    event => {

      event.preventDefault();


      try {

        const values =
          readReplenishmentForm();


        const result =
          registerReplenishment(
            values
          );


        setValue(
          'replenishmentQty',
          0
        );


        setValue(
          'replenishmentEmptyOut',
          0
        );


        setValue(
          'replenishmentTransport',
          0
        );


        setValue(
          'replenishmentOtherCost',
          0
        );


        setValue(
          'replenishmentExtraContribution',
          0
        );


        setValue(
          'replenishmentNote',
          ''
        );


        refreshUI();


        showToast(
          `${result.replenishment.quantity} ${result.replenishment.gasName} repuesto(s).`,
          'good'
        );

      }
      catch (error) {

        setOperationStatus(
          'replenishmentStatus',
          error.message,
          'bad'
        );


        showToast(
          error.message,
          'bad'
        );

      }

    }
  );

}



/* =========================================================
   PENDIENTES - ABRIR ACCIÓN
========================================================= */

function bindAccountCards() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-account-action]'
        );


      if (!button) {

        return;

      }


      openPaymentDialog(

        button.dataset
          .accountId,

        button.dataset
          .accountAction

      );

    }
  );

}



/* =========================================================
   MÉTODO DE PAGO DEL MODAL
========================================================= */

function bindPendingPaymentMethods() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-pending-payment-method]'
        );


      if (!button) {

        return;

      }


      const method =
        button.dataset
          .pendingPaymentMethod;


      setValue(
        'pendingPaymentMethod',
        method
      );


      activateButtonGroup({

        selector:
          '[data-pending-payment-method]',

        dataProperty:
          'pendingPaymentMethod',

        value:
          method,

      });

    }
  );

}



/* =========================================================
   STEPPERS DEL MODAL
========================================================= */

function bindPendingSteppers() {

  document.addEventListener(
    'click',
    event => {

      const tankButton =
        event.target.closest(
          '[data-payment-tank-step]'
        );


      if (tankButton) {

        const gas =
          tankButton.dataset.gas;


        const inputId =

          gas ===
            GAS_IDS.KING_GAS ||
          gas ===
            'kinggas'

            ? 'paymentTankKinggas'

            : 'paymentTankDuragas';


        setValue(
          inputId,

          stepNonNegativeInteger(

            getValue(
              inputId
            ),

            tankButton.dataset
              .paymentTankStep

          )
        );


        return;

      }



      const pickupButton =
        event.target.closest(
          '[data-payment-pickup-step]'
        );


      if (pickupButton) {

        const gas =
          pickupButton.dataset.gas;


        const inputId =

          gas ===
            GAS_IDS.KING_GAS ||
          gas ===
            'kinggas'

            ? 'paymentPickupKinggas'

            : 'paymentPickupDuragas';


        setValue(
          inputId,

          stepNonNegativeInteger(

            getValue(
              inputId
            ),

            pickupButton.dataset
              .paymentPickupStep

          )
        );

      }

    }
  );



  byId(
    'paymentAllTanksBtn'
  )?.addEventListener(
    'click',
    () => {

      const accountId =
        getValue(
          'paymentAccountId'
        );


      const state =
        getState();


      const balance =
        state.accountBalances
          .find(
            item =>
              item.accountId ===
              accountId
          );


      if (!balance) {

        return;

      }


      setValue(
        'paymentTankDuragas',
        balance
          .tanksDue
          ?.[GAS_IDS.DURAGAS] ??
        0
      );


      setValue(
        'paymentTankKinggas',
        balance
          .tanksDue
          ?.[GAS_IDS.KING_GAS] ??
        0
      );

    }
  );



  byId(
    'paymentZeroTanksBtn'
  )?.addEventListener(
    'click',
    () => {

      setValue(
        'paymentTankDuragas',
        0
      );


      setValue(
        'paymentTankKinggas',
        0
      );

    }
  );



  byId(
    'paymentAllPickupBtn'
  )?.addEventListener(
    'click',
    () => {

      const accountId =
        getValue(
          'paymentAccountId'
        );


      const balance =
        getState()
          .accountBalances
          .find(
            item =>
              item.accountId ===
              accountId
          );


      if (!balance) {

        return;

      }


      setValue(
        'paymentPickupDuragas',
        balance
          .pickupDue
          ?.[GAS_IDS.DURAGAS] ??
        0
      );


      setValue(
        'paymentPickupKinggas',
        balance
          .pickupDue
          ?.[GAS_IDS.KING_GAS] ??
        0
      );

    }
  );

}



/* =========================================================
   FORMULARIO DEL MODAL DE PENDIENTES
========================================================= */

function bindPaymentDialog() {

  byId(
    'closeDialogBtn'
  )?.addEventListener(
    'click',
    closePaymentDialog
  );


  const form =
    byId(
      'paymentForm'
    );


  if (!form) {

    return;

  }


  /*
    paymentForm tiene method="dialog".

    preventDefault evita que se cierre ANTES
    de validar y guardar.
  */

  form.addEventListener(
    'submit',
    event => {

      event.preventDefault();


      const accountId =
        getValue(
          'paymentAccountId'
        );


      const action =
        getValue(
          'paymentAction'
        );


      try {

        if (
          action === 'payment'
        ) {

          registerAccountPayment({

            accountId,

            amount:
              toNonNegativeNumber(
                getValue(
                  'paymentAmount'
                )
              ),

            paymentMethod:
              getValue(
                'pendingPaymentMethod'
              ) ||
              PAYMENT_METHODS.CASH,

            note:
              getValue(
                'paymentNote'
              ),

          });

        }
        else if (
          action === 'tanks'
        ) {

          registerTankReturn({

            accountId,

            duragas:
              toNonNegativeInteger(
                getValue(
                  'paymentTankDuragas'
                )
              ),

            kinggas:
              toNonNegativeInteger(
                getValue(
                  'paymentTankKinggas'
                )
              ),

            note:
              getValue(
                'paymentNote'
              ),

          });

        }
        else if (
          action === 'pickup'
        ) {

          registerReservedPickup({

            accountId,

            duragas:
              toNonNegativeInteger(
                getValue(
                  'paymentPickupDuragas'
                )
              ),

            kinggas:
              toNonNegativeInteger(
                getValue(
                  'paymentPickupKinggas'
                )
              ),

            note:
              getValue(
                'paymentNote'
              ),

          });

        }
        else {

          throw new Error(
            'Acción de pendiente inválida.'
          );

        }


        closePaymentDialog();


        refreshUI();


        showToast(
          'Pendiente actualizado correctamente.',
          'good'
        );

      }
      catch (error) {

        showToast(
          error.message,
          'bad'
        );

      }

    }
  );

}



/* =========================================================
   AJUSTES - PREVISUALIZACIÓN
========================================================= */

function updateAdjustmentPreview() {

  try {

    const preview =
      calculateAdjustmentPreview({

        gasId:
          getValue(
            'adjustmentGasType'
          ) ||
          GAS_IDS.DURAGAS,

        bucket:
          getValue(
            'adjustmentBucket'
          ) ||
          'full',

        direction:
          getValue(
            'adjustmentDirection'
          ) ||
          ADJUSTMENT_DIRECTIONS
            .INCREASE,

        quantity:
          toNonNegativeInteger(
            getValue(
              'adjustmentQty'
            )
          ),

      });


    renderAdjustmentCurrent(
      preview
    );


    return preview;

  }
  catch (error) {

    setOperationStatus(
      'adjustmentStatus',
      error.message,
      'bad'
    );


    return null;

  }

}



/* =========================================================
   BOTONES DE DIRECCIÓN DE AJUSTE
========================================================= */

function bindAdjustmentButtons() {

  document.addEventListener(
    'click',
    event => {

      const direction =
        event.target.closest(
          '[data-adjustment-direction]'
        );


      if (direction) {

        const value =
          direction.dataset
            .adjustmentDirection;


        setValue(
          'adjustmentDirection',
          value
        );


        activateButtonGroup({

          selector:
            '[data-adjustment-direction]',

          dataProperty:
            'adjustmentDirection',

          value,

        });


        updateAdjustmentPreview();


        return;

      }



      const step =
        event.target.closest(
          '[data-adjustment-step]'
        );


      if (step) {

        setValue(
          'adjustmentQty',

          stepNonNegativeInteger(

            getValue(
              'adjustmentQty'
            ),

            step.dataset
              .adjustmentStep

          )
        );


        updateAdjustmentPreview();


        return;

      }



      const set =
        event.target.closest(
          '[data-adjustment-set]'
        );


      if (set) {

        setValue(
          'adjustmentQty',
          toNonNegativeInteger(
            set.dataset
              .adjustmentSet
          )
        );


        updateAdjustmentPreview();

      }

    }
  );

}



/* =========================================================
   FORMULARIO DE AJUSTE
========================================================= */

function bindAdjustmentForm() {

  const form =
    byId(
      'adjustmentForm'
    );


  if (!form) {

    return;

  }


  form.addEventListener(
    'input',
    updateAdjustmentPreview
  );


  form.addEventListener(
    'change',
    updateAdjustmentPreview
  );


  form.addEventListener(
    'submit',
    event => {

      event.preventDefault();


      try {

        registerAdjustment({

          gasId:
            getValue(
              'adjustmentGasType'
            ),

          bucket:
            getValue(
              'adjustmentBucket'
            ),

          direction:
            getValue(
              'adjustmentDirection'
            ),

          quantity:
            toNonNegativeInteger(
              getValue(
                'adjustmentQty'
              )
            ),

          note:
            getValue(
              'adjustmentNote'
            ),

        });


        setValue(
          'adjustmentQty',
          0
        );


        setValue(
          'adjustmentNote',
          ''
        );


        refreshUI();


        showToast(
          'Ajuste registrado.',
          'good'
        );

      }
      catch (error) {

        setOperationStatus(
          'adjustmentStatus',
          error.message,
          'bad'
        );


        showToast(
          error.message,
          'bad'
        );

      }

    }
  );

}



/* =========================================================
   PRÉSTAMOS - BOTONES
========================================================= */

function bindLoanButtons() {

  document.addEventListener(
    'click',
    event => {

      const action =
        event.target.closest(
          '[data-loan-action]'
        );


      if (action) {

        const value =
          action.dataset
            .loanAction;


        setValue(
          'loanAction',
          value
        );


        activateButtonGroup({

          selector:
            '[data-loan-action]',

          dataProperty:
            'loanAction',

          value,

        });


        return;

      }



      const step =
        event.target.closest(
          '[data-loan-step]'
        );


      if (step) {

        setValue(
          'loanQty',

          stepNonNegativeInteger(

            getValue(
              'loanQty'
            ),

            step.dataset
              .loanStep

          )
        );


        return;

      }



      const set =
        event.target.closest(
          '[data-loan-set]'
        );


      if (set) {

        setValue(
          'loanQty',
          toNonNegativeInteger(
            set.dataset
              .loanSet
          )
        );

      }

    }
  );

}



/* =========================================================
   FORMULARIO DE PRÉSTAMOS
========================================================= */

function bindLoanForm() {

  const form =
    byId(
      'loanForm'
    );


  if (!form) {

    return;

  }


  form.addEventListener(
    'submit',
    event => {

      event.preventDefault();


      try {

        /*
          El HTML actual no tiene selector lleno/vacío.

          Por eso adjustments.js utiliza VACÍO
          como origen/destino predeterminado.
        */

        registerLoanAction({

          gasId:
            getValue(
              'loanGasType'
            ),

          action:
            getValue(
              'loanAction'
            ) ||
            LOAN_ACTIONS.LEND,

          quantity:
            toNonNegativeInteger(
              getValue(
                'loanQty'
              )
            ),

          reference:
            getValue(
              'loanReference'
            ),

          note:
            getValue(
              'loanNote'
            ),

        });


        setValue(
          'loanQty',
          0
        );


        setValue(
          'loanReference',
          ''
        );


        setValue(
          'loanNote',
          ''
        );


        refreshUI();


        showToast(
          'Movimiento de préstamo registrado.',
          'good'
        );

      }
      catch (error) {

        setOperationStatus(
          'loanStatus',
          error.message,
          'bad'
        );


        showToast(
          error.message,
          'bad'
        );

      }

    }
  );

}



/* =========================================================
   CIERRE - LEER INVENTARIO
========================================================= */

function readClosingInventory() {

  const logicalInventory =
    getInventorySnapshot();


  function readPhysicalValue(
    inputId,
    fallback
  ) {

    const input =
      byId(
        inputId
      );


    /*
      Compatibilidad con HTML anterior.

      Si todavía no existe el campo,
      conservamos el valor lógico esperado.
    */

    if (!input) {

      return fallback;

    }


    return getValue(
      inputId
    );

  }


  return {

    [GAS_IDS.DURAGAS]: {

      full:
        readPhysicalValue(
          'closingDuragasFull',
          logicalInventory[
            GAS_IDS.DURAGAS
          ].full
        ),

      empty:
        readPhysicalValue(
          'closingDuragasEmpty',
          logicalInventory[
            GAS_IDS.DURAGAS
          ].empty
        ),

      reserved:
        readPhysicalValue(
          'closingDuragasReserved',
          logicalInventory[
            GAS_IDS.DURAGAS
          ].reserved
        ),

      /*
        Apartados para vendedor.

        Todavía están físicamente
        dentro de la bodega.
      */

      routeReserved:
        readPhysicalValue(
          'closingDuragasRouteReserved',
          logicalInventory[
            GAS_IDS.DURAGAS
          ].routeReserved
        ),


      /*
        Fuera de la bodega.

        No se cuentan físicamente;
        usamos el dato lógico real.
      */

      route:
        logicalInventory[
          GAS_IDS.DURAGAS
        ].route,

      loaned:
        logicalInventory[
          GAS_IDS.DURAGAS
        ].loaned,

    },


    [GAS_IDS.KING_GAS]: {

      full:
        readPhysicalValue(
          'closingKingGasFull',
          logicalInventory[
            GAS_IDS.KING_GAS
          ].full
        ),

      empty:
        readPhysicalValue(
          'closingKingGasEmpty',
          logicalInventory[
            GAS_IDS.KING_GAS
          ].empty
        ),

      reserved:
        readPhysicalValue(
          'closingKingGasReserved',
          logicalInventory[
            GAS_IDS.KING_GAS
          ].reserved
        ),

      routeReserved:
        readPhysicalValue(
          'closingKingGasRouteReserved',
          logicalInventory[
            GAS_IDS.KING_GAS
          ].routeReserved
        ),

      route:
        logicalInventory[
          GAS_IDS.KING_GAS
        ].route,

      loaned:
        logicalInventory[
          GAS_IDS.KING_GAS
        ].loaned,

    },

  };

}



/* =========================================================
   PREPARAR CAMPOS DE CIERRE
========================================================= */

function prepareClosingInputsIfEmpty() {

  if (
    !getActiveDay()
  ) {

    return;

  }


  /*
    Campos que realmente existen
    actualmente en la interfaz.

    Cuando agreguemos routeReserved
    en index.html entrará automáticamente.
  */

  const physicalIds = [

    'closingDuragasFull',
    'closingDuragasEmpty',
    'closingDuragasReserved',
    'closingDuragasRouteReserved',

    'closingKingGasFull',
    'closingKingGasEmpty',
    'closingKingGasReserved',
    'closingKingGasRouteReserved',

  ].filter(
    id =>
      Boolean(
        byId(id)
      )
  );


  const allPhysicalEmpty =

    physicalIds.length > 0

    &&

    physicalIds.every(
      id =>
        getValue(id) === ''
    );


  if (
    allPhysicalEmpty
  ) {

    /*
      Cargar como referencia
      lo que el sistema espera encontrar.

      El usuario solamente modifica
      lo que físicamente sea diferente.
    */

    renderExpectedClosingInventory(
      true
    );


    /*
      El efectivo contado nunca
      se autocompleta.
    */

    setValue(
      'closingCashCounted',
      ''
    );


    setText(
      'closingCashDifference',
      '—'
    );


    setText(
      'closingCashDifferenceText',
      'Escribe el efectivo contado.'
    );


    setOperationStatus(
      'closingStatus',
      'Cuenta el efectivo físico y confirma el inventario antes de cerrar.',
      'warn'
    );

  }

}



/* =========================================================
   PREVISUALIZAR CIERRE
========================================================= */

function updateClosingPreview() {

  if (
    !getActiveDay()
  ) {

    return null;

  }


  const cashRaw =
    getValue(
      'closingCashCounted'
    );


  try {

    /*
      Siempre calculamos primero
      el inventario.

      Aunque todavía no se haya contado
      la caja, las diferencias físicas
      deben poder verse.
    */

    const preview =
      calculateClosingPreview({

        cashCounted:

          cashRaw === ''

            ? 0

            : toNonNegativeNumber(
                cashRaw
              ),

        inventory:
          readClosingInventory(),

      });


    if (!preview) {

      return null;

    }


    /*
      EFECTIVO TODAVÍA SIN CONTAR
    */

    if (
      cashRaw === ''
    ) {

      const duragas =
        preview
          .inventory
          .byGas[
            GAS_IDS.DURAGAS
          ];


      const kinggas =
        preview
          .inventory
          .byGas[
            GAS_IDS.KING_GAS
          ];


      setText(
        'closingDuragasDifference',
        String(
          duragas
            .warehouseDifference
        )
      );


      setText(
        'closingKingGasDifference',
        String(
          kinggas
            .warehouseDifference
        )
      );


      setText(
        'closingCashDifference',
        '—'
      );


      setText(
        'closingCashDifferenceText',
        'Escribe el efectivo contado.'
      );


      setOperationStatus(

        'closingStatus',

        preview
          .hasInventoryDifference

          ? 'Hay diferencias en el conteo físico de cilindros.'

          : 'El conteo físico coincide. Falta escribir el efectivo contado.',

        preview
          .hasInventoryDifference

          ? 'warn'

          : 'good'

      );


      return preview;

    }


    /*
      EFECTIVO YA CONTADO

      ui.js muestra ahora:

      - caja
      - inventario
      - bolsas
      - obligaciones pendientes
    */

    renderClosingPreview(
      preview
    );


    return preview;

  }
  catch (error) {

    setOperationStatus(
      'closingStatus',
      error.message,
      'bad'
    );


    return null;

  }

}



/* =========================================================
   FORMULARIO CIERRE
========================================================= */

function bindClosingForm() {

  const form =
    byId(
      'closingForm'
    );


  if (!form) {

    return;

  }


  form.addEventListener(
    'input',
    updateClosingPreview
  );


  form.addEventListener(
    'change',
    updateClosingPreview
  );


  form.addEventListener(
    'submit',
    event => {

      event.preventDefault();


      try {

        const result =
          closeDay({

            cashCounted:
              getValue(
                'closingCashCounted'
              ),

            inventory:
              readClosingInventory(),

            note:
              getValue(
                'closingNote'
              ),

          });


        form.reset();


        refreshUI();


        setActiveView(
          'dashboard'
        );


        /*
          El cierre ya trae la fotografía
          financiera completa de la jornada.
        */

        showToast(

          result
            .closing
            .hasAnyDifference

            ? 'Jornada cerrada con diferencias registradas.'

            : 'Jornada cerrada correctamente.',

          result
            .closing
            .hasAnyDifference

            ? 'warn'

            : 'good'

        );

      }
      catch (error) {

        setOperationStatus(
          'closingStatus',
          error.message,
          'bad'
        );


        showToast(
          error.message,
          'bad'
        );

      }

    }
  );

}
/* =========================================================
   NAVEGACIÓN
========================================================= */

function bindNavigation() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-view]'
        );


      if (!button) {

        return;

      }


      const view =
        button.dataset.view;


      if (!view) {

        return;

      }


      setActiveView(
        view
      );


      if (
        view === 'closing'
      ) {

        prepareClosingInputsIfEmpty();

        updateClosingPreview();

      }


      if (
        view === 'opening'
      ) {

        prepareOpeningMode();

      }


      try {

        saveState();

      }
      catch {

        /* No bloqueamos navegación por esto. */

      }

    }
  );

}



/* =========================================================
   HISTORIAL - CAMBIO DE PESTAÑA
========================================================= */

function bindHistoryModeButtons() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-history-mode]'
        );


      if (!button) {

        return;

      }


      const mode =
        button.dataset
          .historyMode;


      setHistoryMode(
        mode
      );


      try {

        saveState();

      }
      catch {

        /* Solo preferencia visual. */

      }

    }
  );

}



/* =========================================================
   FILTROS HISTORIAL
========================================================= */

function bindHistoryFilters() {

  const salesIds = [

    'historySalesFrom',

    'historySalesTo',

    'historySalesGasType',

    'historySalesPrice',

    'historySalesPaymentMethod',

    'historySalesCustomer',

  ];


  salesIds.forEach(
    id => {

      const element =
        byId(id);


      if (!element) {

        return;

      }


      const handler =
        () => {

          renderHistorySales(
            readSalesHistoryFilters()
          );

        };


      element.addEventListener(
        'input',
        handler
      );


      element.addEventListener(
        'change',
        handler
      );

    }
  );



  byId(
    'clearSalesHistoryFilters'
  )?.addEventListener(
    'click',
    () => {

      salesIds.forEach(
        id => {

          setValue(
            id,
            ''
          );

        }
      );


      renderHistorySales({});

    }
  );



  const movementIds = [

    'historyMovementsFrom',

    'historyMovementsTo',

    'historyMovementsType',

  ];


  movementIds.forEach(
    id => {

      const element =
        byId(id);


      if (!element) {

        return;

      }


      const handler =
        () => {

          renderHistoryMovements(
            readMovementHistoryFilters()
          );

        };


      element.addEventListener(
        'input',
        handler
      );


      element.addEventListener(
        'change',
        handler
      );

    }
  );



  const replenishmentIds = [

    'historyReplenishmentsFrom',

    'historyReplenishmentsTo',

    'historyReplenishmentsGasType',

  ];


  replenishmentIds.forEach(
    id => {

      const element =
        byId(id);


      if (!element) {

        return;

      }


      const handler =
        () => {

          renderHistoryReplenishments(
            readReplenishmentHistoryFilters()
          );

        };


      element.addEventListener(
        'input',
        handler
      );


      element.addEventListener(
        'change',
        handler
      );

    }
  );

}



/* =========================================================
   DETALLE DEL DÍA
========================================================= */

function bindDayDetail() {

  document.addEventListener(
    'click',
    event => {

      const button =
        event.target.closest(
          '[data-day-detail]'
        );


      if (!button) {

        return;

      }


      openDayDetail(
        button.dataset
          .dayDetail
      );

    }
  );


  byId(
    'closeDayDetailBtn'
  )?.addEventListener(
    'click',
    closeDayDetail
  );

}



/* =========================================================
   EXPORTAR
========================================================= */

function bindExportButtons() {

  [
    'exportBtn',
    'settingsExportBtn',
  ]
    .forEach(
      id => {

        byId(id)
          ?.addEventListener(
            'click',
            () => {

              try {

                exportBackup();


                showToast(
                  'Respaldo generado.',
                  'good'
                );

              }
              catch (error) {

                showToast(
                  error.message,
                  'bad'
                );

              }

            }
          );

      }
    );

}



/* =========================================================
   IMPORTAR
========================================================= */

function bindImportInput(
  id
) {

  const input =
    byId(id);


  if (!input) {

    return;

  }


  input.addEventListener(
    'change',
    async () => {

      const file =
        input.files?.[0];


      if (!file) {

        return;

      }


      const confirmed =
        window.confirm(
          'Importar este respaldo reemplazará los datos V5 actuales. ¿Deseas continuar?'
        );


      if (!confirmed) {

        input.value = '';

        return;

      }


      try {

        const result =
          await importBackupFile(
            file
          );


        refreshUI();


        prepareClosingInputsIfEmpty();


        showToast(
          result.warnings.length > 0
            ? 'Respaldo importado con advertencias.'
            : 'Respaldo importado correctamente.',
          result.warnings.length > 0
            ? 'warn'
            : 'good'
        );


        if (
          result.warnings.length > 0
        ) {

          console.warn(
            'Advertencias de importación:',
            result.warnings
          );

        }

      }
      catch (error) {

        showToast(
          error.message,
          'bad'
        );

      }
      finally {

        /*
          Permite volver a seleccionar
          el mismo archivo después.
        */

        input.value = '';

      }

    }
  );

}



function bindImportButtons() {

  bindImportInput(
    'importInput'
  );


  bindImportInput(
    'settingsImportInput'
  );

}



/* =========================================================
   REINICIAR V5
========================================================= */

function bindResetButton() {

  byId(
    'resetBtn'
  )?.addEventListener(
    'click',
    () => {

      const first =
        window.confirm(
          'Esto borrará los datos actuales de ControlGas V5 en este navegador. ¿Continuar?'
        );


      if (!first) {

        return;

      }


      const second =
        window.confirm(
          'Última confirmación: ¿realmente deseas reiniciar ControlGas?'
        );


      if (!second) {

        return;

      }


      /*
        No borramos automáticamente V3/V4.
      */

      clearControlGasData({

        includeLegacy:
          false,

      });


      saveState();


      resetFormsToDefaults();


      refreshUI();


      setActiveView(
        'dashboard'
      );


      showToast(
        'ControlGas V5 fue reiniciado.',
        'warn'
      );

    }
  );

}



/* =========================================================
   VALORES INICIALES DE BOTONES
========================================================= */

function applyInitialControlValues() {

  const state =
    getState();


  const rememberedPrice =
    isValidSalePrice(
      state.ui?.lastPrice
    )

      ? state.ui.lastPrice

      : DEFAULTS.salePrice;


  setValue(
    'salePrice',
    rememberedPrice
  );


  setValue(
    'salePaymentMethod',
    PAYMENT_METHODS.CASH
  );


  setValue(
    'saleMode',
    SALE_MODES.NOW
  );


  setValue(
    'adjustmentDirection',
    ADJUSTMENT_DIRECTIONS
      .INCREASE
  );


  setValue(
    'loanAction',
    LOAN_ACTIONS.LEND
  );


  setValue(
    'pendingPaymentMethod',
    PAYMENT_METHODS.CASH
  );


  setValue(
    'emptyExchangeMode',
    'complete'
  );


  setVisible(
    'emptyExchangeSection',
    false
  );



  all(
    '[data-price], [data-sale-price]'
  ).forEach(
    button => {

      const price =
        button.dataset.price ??
        button.dataset.salePrice;


      button.classList.toggle(
        'active',
        Number(price) ===
          Number(
            rememberedPrice
          )
      );

    }
  );


  activateButtonGroup({

    selector:
      '[data-sale-mode]',

    dataProperty:
      'saleMode',

    value:
      SALE_MODES.NOW,

  });


  activateButtonGroup({

    selector:
      '[data-payment-method]',

    dataProperty:
      'paymentMethod',

    value:
      PAYMENT_METHODS.CASH,

  });


  activateButtonGroup({

    selector:
      '[data-adjustment-direction]',

    dataProperty:
      'adjustmentDirection',

    value:
      ADJUSTMENT_DIRECTIONS
        .INCREASE,

  });


  activateButtonGroup({

    selector:
      '[data-loan-action]',

    dataProperty:
      'loanAction',

    value:
      LOAN_ACTIONS.LEND,

  });


  activateButtonGroup({

    selector:
      '[data-pending-payment-method]',

    dataProperty:
      'pendingPaymentMethod',

    value:
      PAYMENT_METHODS.CASH,

  });

}



/* =========================================================
   REINICIAR FORMULARIOS
========================================================= */

function resetFormsToDefaults() {

  [
    'openingForm',
    'saleForm',
    'replenishmentForm',
    'adjustmentForm',
    'loanForm',
    'closingForm',
  ]
    .forEach(
      id => {

        byId(id)?.reset();

      }
    );


  applyInitialControlValues();

}



/* =========================================================
   INPUTS MÓVILES - NORMALIZAR
========================================================= */

/*
  Si el usuario borra temporalmente el valor
  mientras escribe, no lo corregimos inmediatamente.

  Solo normalizamos al salir del campo.
*/

function bindNumericInputs() {

  document.addEventListener(
    'blur',
    event => {

      const input =
        event.target;


      if (
        !(input instanceof HTMLInputElement)
      ) {

        return;

      }


      if (
        input.type !== 'number'
      ) {

        return;

      }


      if (
        input.value === ''
      ) {

        return;

      }


      if (
        Number(input.value) < 0
      ) {

        input.value =
          '0';

      }

    },
    true
  );

}



/* =========================================================
   DOBLE CLICK / ENVÍOS REPETIDOS
========================================================= */

/*
  Evita que un submit se ejecute dos veces
  por doble toque rápido en celular.
*/

function bindSubmitProtection() {

  document.addEventListener(
    'submit',
    event => {

      const form =
        event.target;


      if (
        !(form instanceof HTMLFormElement)
      ) {

        return;

      }


      const submit =
        form.querySelector(
          '[type="submit"]'
        );


      if (!submit) {

        return;

      }


      if (
        submit.dataset.busy ===
        'true'
      ) {

        event.preventDefault();

        return;

      }


      submit.dataset.busy =
        'true';


      setTimeout(
        () => {

          delete submit.dataset.busy;

        },
        700
      );

    },
    true
  );

}



/* =========================================================
   CERRAR DIALOG AL PULSAR BOTÓN/CANCELAR
========================================================= */

function bindDialogs() {

  byId(
    'paymentDialog'
  )?.addEventListener(
    'cancel',
    event => {

      event.preventDefault();

      closePaymentDialog();

    }
  );


  byId(
    'dayDetailDialog'
  )?.addEventListener(
    'cancel',
    event => {

      event.preventDefault();

      closeDayDetail();

    }
  );

}



/* =========================================================
   EVENTOS PRINCIPALES
========================================================= */

function bindEvents() {

  bindNavigation();

  bindOpeningForm();


  bindSaleQuantityButtons();

  bindEmptyButtons();

  bindSalePriceButtons();

  bindSaleModeButtons();

  bindSalePaymentButtons();

  bindQuickCashButtons();

  bindSaleForm();


  bindReplenishmentButtons();

  bindReplenishmentForm();


  bindAccountCards();

  bindPendingPaymentMethods();

  bindPendingSteppers();

  bindPaymentDialog();


  bindAdjustmentButtons();

  bindAdjustmentForm();


  bindLoanButtons();

  bindLoanForm();


  bindClosingForm();


  bindHistoryModeButtons();

  bindHistoryFilters();

  bindDayDetail();


  bindExportButtons();

  bindImportButtons();

  bindResetButton();


  bindNumericInputs();

  bindSubmitProtection();

  bindDialogs();

}



/* =========================================================
   RELOJ
========================================================= */

function startClock() {

  renderClock();

  refreshAutomaticDateTimes();


  setInterval(
    () => {

      renderClock();

      refreshAutomaticDateTimes();

    },
    1000
  );

}



/* =========================================================
   REVISAR RESULTADO DE CARGA
========================================================= */

function handleLoadResult(
  result
) {

  if (
    result.migrated
  ) {

    showToast(
      'Datos antiguos migrados a ControlGas V5.',
      'good'
    );

  }


  if (
    Array.isArray(
      result.warnings
    ) &&
    result.warnings.length > 0
  ) {

    console.warn(
      'ControlGas:',
      result.warnings
    );

  }

}



/* =========================================================
   VISTA INICIAL
========================================================= */

function restoreInitialView() {

  const state =
    getState();


  const requested =
    state.ui?.activeView ||
    'dashboard';


  const exists =
    byId(
      `view-${requested}`
    );


  setActiveView(

    exists
      ? requested
      : 'dashboard'

  );


  const historyMode =
    state.ui?.historyMode ||
    'days';


  setHistoryMode(
    historyMode
  );

}



/* =========================================================
   INICIALIZAR APLICACIÓN
========================================================= */

function init() {

  try {

    /*
      1. CARGAR BASE
    */

    const loadResult =
      loadState();



    /*
      2. CONFIGURAR CONTROLES
    */

    applyInitialControlValues();



    /*
      3. CONECTAR EVENTOS
    */

    bindEvents();



    /*
      4. RENDER INICIAL
    */

    renderAll();

    prepareOpeningMode();



    /*
      5. PREPARAR CIERRE SI HAY DÍA
    */

    prepareClosingInputsIfEmpty();



    /*
      6. PREVISUALIZACIONES
    */

    updateSalePreview();

    updateReplenishmentPreview();

    updateAdjustmentPreview();

    updateClosingPreview();



    /*
      7. RESTAURAR PESTAÑA
    */

    restoreInitialView();



    /*
      8. RELOJ
    */

    startClock();



    /*
      9. INFORMAR MIGRACIÓN
    */

    handleLoadResult(
      loadResult
    );


    console.info(
      'ControlGas V5 iniciado correctamente.'
    );

  }
  catch (error) {

    console.error(
      'Error iniciando ControlGas:',
      error
    );


    showToast(
      `Error de inicio: ${error.message}`,
      'bad'
    );

  }

}



/* =========================================================
   ARRANQUE
========================================================= */

if (
  document.readyState ===
  'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    init,
    {
      once: true,
    }
  );

}
else {

  init();

}
