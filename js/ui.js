/* =========================================================
   CONTROLGAS
   INTERFAZ DE USUARIO

   Responsabilidades:
   - Actualizar textos y métricas
   - Renderizar Dashboard
   - Renderizar ventas
   - Renderizar bolsas
   - Renderizar pendientes
   - Renderizar inventario
   - Renderizar reposiciones
   - Renderizar ajustes
   - Renderizar cierre
   - Renderizar historial
   - Abrir/cerrar diálogos
   - Mostrar mensajes Toast

   IMPORTANTE:

   ui.js NO registra ventas.
   ui.js NO mueve inventario.
   ui.js NO modifica dinero.

   Solamente muestra información.
========================================================= */

import {
  GAS_IDS,
  GAS_TYPES,
  MOVEMENT_LABELS,
  HISTORY_CONFIG,
  SALE_STATUS_LABELS,
  getReplacementCost,
} from './config.js';


import {
  getState,
  getActiveDay,
  getAccountById,
  getAccountBalance,
} from './state.js';


import {
  getInventorySummary,
  getAvailableStock,
  getInventoryQuantity,
} from './inventory.js';


import {
  getDayFinanceSummary,
  getWalletSummary,
} from './finance.js';


import {
  getCurrentDaySales,
  describeSaleProducts,
  describeSaleEmpties,
} from './sales.js';

import {
  getOpenAccounts,
  getAccountsSummary,
  getAvailableAccountActions,
  searchRouteAccountSummaries,
} from './accounts.js';

import {
  getRecentReplenishments,
  getCurrentDayReplenishmentSummary,
} from './replenishments.js';


import {
  getAdjustmentHistory,
} from './adjustments.js';


import {
  getCurrentClosingData,
  getSuggestedClosingCounts,
  calculateClosingPreview,
} from './closing.js';


import {
  getClosedDaysHistory,
  getSalesHistory,
  getSalesHistoryStats,
  getMovementsHistory,
  getReplenishmentsHistory,
  getReplenishmentsHistoryStats,
  getDayHistoryDetail,
} from './history.js';


import {
  escapeHtml,
  formatDate,
  formatDateTime,
  formatMoney,
  formatShortTime,
  normalizeText,
  roundMoney,
  sortNewestFirst,
  toNonNegativeInteger,
} from './utils.js';



/* =========================================================
   DOM HELPERS
========================================================= */

export function byId(id) {

  return document.getElementById(id);

}



export function setText(
  id,
  value
) {

  const element =
    byId(id);


  if (!element) {

    return;

  }


  element.textContent =
    value ?? '';

}



export function setHtml(
  id,
  html
) {

  const element =
    byId(id);


  if (!element) {

    return;

  }


  element.innerHTML =
    html ?? '';

}



export function setValue(
  id,
  value
) {

  const element =
    byId(id);


  if (!element) {

    return;

  }


  element.value =
    value ?? '';

}



export function getValue(
  id
) {

  return byId(id)?.value ?? '';

}



export function setVisible(
  id,
  visible
) {

  const element =
    byId(id);


  if (!element) {

    return;

  }


  element.hidden =
    !visible;

}



/* =========================================================
   ESTADO VISUAL DE MENSAJES
========================================================= */

export function setOperationStatus(
  target,
  message = '',
  tone = ''
) {

  const element =

    typeof target === 'string'

      ? byId(target)

      : target;


  if (!element) {

    return;

  }


  element.textContent =
    message;


  element.classList.remove(
    'good',
    'warn',
    'bad'
  );


  if (
    tone === 'good' ||
    tone === 'warn' ||
    tone === 'bad'
  ) {

    element.classList.add(
      tone
    );

  }

}



/* =========================================================
   TOAST
========================================================= */

let toastTimer = null;


export function showToast(
  message,
  tone = ''
) {

  const toast =
    byId('toast');


  if (!toast) {

    return;

  }


  if (toastTimer) {

    clearTimeout(
      toastTimer
    );

  }


  toast.textContent =
    message;


  toast.classList.remove(
    'good',
    'warn',
    'bad'
  );


  if (
    ['good', 'warn', 'bad']
      .includes(tone)
  ) {

    toast.classList.add(
      tone
    );

  }


  toast.classList.add(
    'show'
  );


  toastTimer =
    setTimeout(
      () => {

        toast.classList.remove(
          'show'
        );

      },
      2800
    );

}



/* =========================================================
   VISTAS PRINCIPALES
========================================================= */

export function setActiveView(
  viewName
) {

  document
    .querySelectorAll(
      '.view'
    )
    .forEach(
      view => {

        view.classList.remove(
          'active'
        );

      }
    );


  const target =
    byId(
      `view-${viewName}`
    );


  if (target) {

    target.classList.add(
      'active'
    );

  }


  document
    .querySelectorAll(
      '[data-view]'
    )
    .forEach(
      button => {

        button.classList.toggle(
          'active',
          button.dataset.view ===
            viewName
        );

      }
    );


  getState().ui.activeView =
    viewName;

}



/* =========================================================
   MODO DE HISTORIAL
========================================================= */

export function setHistoryMode(
  mode
) {

  document
    .querySelectorAll(
      '[data-history-mode]'
    )
    .forEach(
      button => {

        button.classList.toggle(
          'active',
          button.dataset.historyMode ===
            mode
        );

      }
    );


  const panels = {

    days:
      'historyDaysPanel',

    sales:
      'historySalesPanel',

    movements:
      'historyMovementsPanel',

    replenishments:
      'historyReplenishmentsPanel',

  };


  Object.entries(
    panels
  ).forEach(
    (
      [
        key,
        id,
      ]
    ) => {

      const panel =
        byId(id);


      if (!panel) {

        return;

      }


      panel.hidden =
        key !== mode;


      panel.classList.toggle(
        'active',
        key === mode
      );

    }
  );


  getState().ui.historyMode =
    mode;

}



/* =========================================================
   ENCABEZADO
========================================================= */

export function renderHeader() {

  const day =
    getActiveDay();


  if (!day) {

    setText(
      'activeDayText',
      'Sin jornada abierta'
    );


    return;

  }


  setText(
    'activeDayText',
    `Jornada ${formatDate(
      day.openedAt
    )}`
  );

}



/* =========================================================
   RELOJ
========================================================= */

export function renderClock() {

  const element =
    byId('liveClock');


  if (!element) {

    return;

  }


  const now =
    new Date();


  element.textContent =
    now.toLocaleString(
      'es-EC',
      {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }
    );

}



/* =========================================================
   MÉTRICAS PRINCIPALES
========================================================= */

function metricCard(
  label,
  value,
  helper = ''
) {

  return `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${
        helper
          ? `<small>${escapeHtml(helper)}</small>`
          : ''
      }
    </div>
  `;

}

/* =========================================================
   DASHBOARD
========================================================= */
export function renderDashboard() {

  const day =
    getActiveDay();


  const inventory =
    getInventorySummary();


  const wallets =
    getWalletSummary(
      day?.id ??
      null
    );


  const accounts =
    getAccountsSummary();


  const finance =
    day
      ? getDayFinanceSummary(
          day.id
        )
      : null;


  const supplierPending =
    getSupplierPendingSnapshot();


  const isGeneral =
    Boolean(
      wallets
        ?.general
        ?.active
    );


  /* =====================================================
     MÉTRICAS PRINCIPALES
  ===================================================== */

  const metrics = [];


  metrics.push(
    metricCard(
      'Ventas hoy',
      String(
        finance
          ?.sales
          ?.count ??
        0
      )
    )
  );


  metrics.push(
    metricCard(
      'Cilindros vendidos',
      String(
        finance
          ?.sales
          ?.units ??
        0
      )
    )
  );


  metrics.push(
    metricCard(
      'Caja actual',
      formatMoney(
        finance
          ?.cash
          ?.expected ??
        0
      ),
      'Caja esperada después de bolsas, gastos y reparto de ganancia.'
    )
  );


  metrics.push(
    metricCard(
      'Ventas $',
      formatMoney(
        finance
          ?.sales
          ?.revenue ??
        0
      )
    )
  );


  metrics.push(
    metricCard(
      'Cobrado',
      formatMoney(
        finance
          ?.collection
          ?.total ??
        0
      )
    )
  );


  metrics.push(
    metricCard(
      'Pendiente clientes',
      formatMoney(
        accounts
          ?.moneyDue ??
        0
      )
    )
  );


  metrics.push(
    metricCard(
      'Pendiente proveedor',
      formatMoney(
        supplierPending.amount
      ),
      supplierPending.count > 0
        ? `${supplierPending.count} obligación(es) pendiente(s)`
        : 'Sin obligaciones pendientes'
    )
  );


  metrics.push(
    metricCard(
      'Ganancia disponible',
      formatMoney(
        finance
          ?.profit
          ?.available ??
        0
      )
    )
  );


  setHtml(
    'metricGrid',
    metrics.join('')
  );


  /* =====================================================
     MODO FINANCIERO
  ===================================================== */

  setText(
    'dashboardFinancialMode',
    isGeneral
      ? 'Bolsa General'
      : 'Bolsas exactas'
  );


  setVisible(
    'dashboardGeneralWalletBlock',
    isGeneral
  );


  setVisible(
    'dashboardExactWalletsBlock',
    !isGeneral
  );


  /* =====================================================
     BOLSA GENERAL
  ===================================================== */

  setText(
    'dashboardGeneralWallet',
    formatMoney(
      wallets
        ?.general
        ?.balance ??
      0
    )
  );


  setText(
    'dashboardGeneralReservePerUnit',
    formatMoney(
      wallets
        ?.general
        ?.reservePerUnit ??
      0
    )
  );


  setText(
    'dashboardGeneralWalletFormula',
    `Bolsa común para ambas marcas · reserva ${formatMoney(
      wallets
        ?.general
        ?.reservePerUnit ??
      0
    )} por cilindro vendido`
  );


  /* =====================================================
     BOLSA EXACTA DURAGAS
  ===================================================== */

  const duragasWallet =
    wallets?.[
      GAS_IDS.DURAGAS
    ] ?? {};


  setText(
    'dashboardDuragasWallet',
    formatMoney(
      duragasWallet.balance ??
      0
    )
  );


  setText(
    'dashboardDuragasEquivalent',
    `${duragasWallet.equivalentUnits ?? 0} × ${formatMoney(
      duragasWallet.replacementCost ??
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )}`
  );


  setText(
    'dashboardDuragasWalletFormula',
    `Anterior ${formatMoney(
      duragasWallet.previousRemaining ??
      0
    )} + hoy ${formatMoney(
      duragasWallet.todayReserveRemaining ??
      0
    )} + aportes ${formatMoney(
      duragasWallet.contributionsRemaining ??
      0
    )} = ${formatMoney(
      duragasWallet.balance ??
      0
    )}`
  );


  /* =====================================================
     BOLSA EXACTA KING GAS
  ===================================================== */

  const kingGasWallet =
    wallets?.[
      GAS_IDS.KING_GAS
    ] ?? {};


  setText(
    'dashboardKingGasWallet',
    formatMoney(
      kingGasWallet.balance ??
      0
    )
  );


  setText(
    'dashboardKingGasEquivalent',
    `${kingGasWallet.equivalentUnits ?? 0} × ${formatMoney(
      kingGasWallet.replacementCost ??
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )}`
  );


  setText(
    'dashboardKingGasWalletFormula',
    `Anterior ${formatMoney(
      kingGasWallet.previousRemaining ??
      0
    )} + hoy ${formatMoney(
      kingGasWallet.todayReserveRemaining ??
      0
    )} + aportes ${formatMoney(
      kingGasWallet.contributionsRemaining ??
      0
    )} = ${formatMoney(
      kingGasWallet.balance ??
      0
    )}`
  );


  /* =====================================================
     GANANCIAS
  ===================================================== */

  const duragasFinance =
    finance
      ?.byGas
      ?.[GAS_IDS.DURAGAS] ??
    {};


  const kingGasFinance =
    finance
      ?.byGas
      ?.[GAS_IDS.KING_GAS] ??
    {};


  setText(
    'dashboardDuragasProfit',
    formatMoney(
      duragasFinance
        .availableProfit ??
      0
    )
  );


  setText(
    'dashboardKingGasProfit',
    formatMoney(
      kingGasFinance
        .availableProfit ??
      0
    )
  );


  setText(
    'dashboardTotalProfit',
    formatMoney(
      finance
        ?.profit
        ?.available ??
      0
    )
  );


  setText(
    'dashboardDuragasProfitFormula',
    `Ventas ${formatMoney(
      duragasFinance.revenue ??
      0
    )} − reposición ${formatMoney(
      duragasFinance.reserveRequired ??
      0
    )}`
  );


  setText(
    'dashboardDuragasReserveFormula',
    `Reposición: ${
      duragasFinance.units ??
      0
    } × ${formatMoney(
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )} = ${formatMoney(
      duragasFinance.reserveRequired ??
      0
    )}`
  );


  setText(
    'dashboardKingGasProfitFormula',
    `Ventas ${formatMoney(
      kingGasFinance.revenue ??
      0
    )} − reposición ${formatMoney(
      kingGasFinance.reserveRequired ??
      0
    )}`
  );


  setText(
    'dashboardKingGasReserveFormula',
    `Reposición: ${
      kingGasFinance.units ??
      0
    } × ${formatMoney(
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )} = ${formatMoney(
      kingGasFinance.reserveRequired ??
      0
    )}`
  );


  setText(
    'dashboardCollectedProfitFormula',
    `Cobrado después de separar reposición: ${formatMoney(
      finance
        ?.collection
        ?.profit ??
      0
    )}`
  );


  /* =====================================================
     INVENTARIO ACTUAL
  ===================================================== */

  setHtml(
    'inventorySnapshot',
    `
      <div class="inventory-main-grid">

        ${dashboardGasInventoryCard(
          GAS_IDS.DURAGAS,
          inventory.duragas,
          duragasFinance.units ?? 0
        )}

        ${dashboardGasInventoryCard(
          GAS_IDS.KING_GAS,
          inventory.kinggas,
          kingGasFinance.units ?? 0
        )}

      </div>


      <div class="inventory-control-summary">

        <div>
          <span>En bodega ahora</span>
          <strong>
            ${inventory.totals.physical}
          </strong>
        </div>


        <div>
          <span>Apartados vendedor</span>
          <strong>
            ${
              toNonNegativeInteger(
                inventory
                  .duragas
                  .routeReserved
              )
              +
              toNonNegativeInteger(
                inventory
                  .kinggas
                  .routeReserved
              )
            }
          </strong>
        </div>


        <div>
          <span>En ruta</span>
          <strong>
            ${
              toNonNegativeInteger(
                inventory
                  .duragas
                  .route
              )
              +
              toNonNegativeInteger(
                inventory
                  .kinggas
                  .route
              )
            }
          </strong>
        </div>


        <div>
          <span>Prestados</span>
          <strong>
            ${inventory.totals.loaned}
          </strong>
        </div>


        <div>
          <span>Total controlado</span>
          <strong>
            ${inventory.totals.controlled}
          </strong>
        </div>

      </div>
    `
  );


  /* =====================================================
     PENDIENTES
  ===================================================== */

  setHtml(
    'pendingSnapshot',
    `
      <div class="inventory-control-summary">

        <div>
          <span>Cuentas abiertas</span>
          <strong>
            ${accounts.openAccounts ?? 0}
          </strong>
        </div>


        <div>
          <span>Dinero clientes</span>
          <strong>
            ${formatMoney(
              accounts.moneyDue ??
              0
            )}
          </strong>
        </div>


        <div>
          <span>Tanques pendientes</span>
          <strong>
            ${
              accounts
                .tanksDue
                ?.total ??
              0
            }
          </strong>
        </div>


        <div>
          <span>Proveedor pendiente</span>
          <strong>
            ${formatMoney(
              supplierPending.amount
            )}
          </strong>
        </div>

      </div>
    `
  );


  renderSupplierPendingPayments();

  renderRecentReplenishments();

  renderRecentMovements();

}



/* =========================================================
   TARJETA INVENTARIO DASHBOARD
========================================================= */

function dashboardGasInventoryCard(
  gasId,
  inventory,
  soldToday = 0
) {

  const gas =
    GAS_TYPES[gasId];


  const routeReserved =
    toNonNegativeInteger(
      inventory
        ?.routeReserved
    );


  const route =
    toNonNegativeInteger(
      inventory
        ?.route
    );


  const loaned =
    toNonNegativeInteger(
      inventory
        ?.loaned
    );


  return `
    <div class="inventory-big-card ${gasId}">

      <div class="inventory-brand-head">

        <div>

          <h3>
            ${gas.emoji}
            ${escapeHtml(
              gas.name
            )}
          </h3>

        </div>


        <div class="inventory-total-badge">

          <span>
            Vendidos hoy
          </span>

          <strong>
            ${soldToday}
          </strong>

        </div>

      </div>


      <div class="inventory-number-grid">

        <div class="inventory-number available">

          <span>
            Llenos
          </span>

          <strong>
            ${
              toNonNegativeInteger(
                inventory?.full
              )
            }
          </strong>

        </div>


        <div class="inventory-number empty">

          <span>
            Vacíos
          </span>

          <strong>
            ${
              toNonNegativeInteger(
                inventory?.empty
              )
            }
          </strong>

        </div>


        <div class="inventory-number reserved">

          <span>
            Reservados
          </span>

          <strong>
            ${
              toNonNegativeInteger(
                inventory?.reserved
              )
            }
          </strong>

        </div>


        <div class="inventory-number reserved">

          <span>
            Apartados vendedor
          </span>

          <strong>
            ${routeReserved}
          </strong>

        </div>


        <div class="inventory-number">

          <span>
            En ruta
          </span>

          <strong>
            ${route}
          </strong>

        </div>


        <div class="inventory-number loaned">

          <span>
            Prestados
          </span>

          <strong>
            ${loaned}
          </strong>

        </div>

      </div>


      <div class="inventory-control-summary">

        <div>
          <span>Físico en bodega</span>
          <strong>
            ${
              toNonNegativeInteger(
                inventory?.physical
              )
            }
          </strong>
        </div>


        <div>
          <span>Total controlado</span>
          <strong>
            ${
              toNonNegativeInteger(
                inventory?.controlled
              )
            }
          </strong>
        </div>

      </div>

    </div>
  `;

}



/* =========================================================
   APERTURA
========================================================= */

export function renderOpening() {

  const day =
    getActiveDay();


  const wallets =
    getWalletSummary(
      day?.id ??
      null
    );


  const isGeneral =
    Boolean(
      wallets
        ?.general
        ?.active
    );


  /* =====================================================
     MODO FINANCIERO ACTUAL
  ===================================================== */

  setText(
    'openingFinancialModeText',
    isGeneral
      ? 'Bolsa General'
      : 'Bolsas exactas'
  );


  setVisible(
    'openingCurrentGeneralWalletBlock',
    isGeneral
  );


  setVisible(
    'openingCurrentExactWalletsBlock',
    !isGeneral
  );


  /* =====================================================
     BOLSA GENERAL
  ===================================================== */

  setText(
    'openingGeneralWallet',
    formatMoney(
      wallets
        ?.general
        ?.balance ??
      0
    )
  );


  setText(
    'openingGeneralReservePerUnit',
    formatMoney(
      wallets
        ?.general
        ?.reservePerUnit ??
      0
    )
  );


  /* =====================================================
     BOLSAS EXACTAS
  ===================================================== */

  const duragas =
    wallets?.[
      GAS_IDS.DURAGAS
    ] ?? {};


  const kingGas =
    wallets?.[
      GAS_IDS.KING_GAS
    ] ?? {};


  setText(
    'openingDuragasWallet',
    formatMoney(
      duragas.balance ??
      0
    )
  );


  setText(
    'openingDuragasWalletEquivalent',
    `${duragas.equivalentUnits ?? 0} × ${formatMoney(
      duragas.replacementCost ??
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )}`
  );


  setText(
    'openingKingGasWallet',
    formatMoney(
      kingGas.balance ??
      0
    )
  );


  setText(
    'openingKingGasWalletEquivalent',
    `${kingGas.equivalentUnits ?? 0} × ${formatMoney(
      kingGas.replacementCost ??
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )}`
  );


  /* =====================================================
     ESTADO DE JORNADA
  ===================================================== */

  setOperationStatus(
    'openingWarning',

    day
      ? (
          isGeneral
            ? 'Existe una jornada abierta con Bolsa General.'
            : 'Existe una jornada abierta con bolsas exactas.'
        )

      : 'No existe una jornada abierta.',

    day
      ? 'warn'
      : ''
  );


  setText(
    'openingAutoDateTime',
    formatDateTime(
      new Date()
    )
  );


  renderOpeningTotals();

}



/* =========================================================
   TOTALES DE APERTURA DESDE INPUTS
========================================================= */

export function renderOpeningTotals() {

  const duragas =

    toNonNegativeInteger(
      getValue(
        'duragasFull'
      )
    )

    +

    toNonNegativeInteger(
      getValue(
        'duragasEmpty'
      )
    )

    +

    toNonNegativeInteger(
      getValue(
        'duragasReserved'
      )
    )

    +

    toNonNegativeInteger(
      getValue(
        'duragasLoaned'
      )
    );


  const kinggas =

    toNonNegativeInteger(
      getValue(
        'kinggasFull'
      )
    )

    +

    toNonNegativeInteger(
      getValue(
        'kinggasEmpty'
      )
    )

    +

    toNonNegativeInteger(
      getValue(
        'kinggasReserved'
      )
    )

    +

    toNonNegativeInteger(
      getValue(
        'kinggasLoaned'
      )
    );


  setText(
    'duragasOpeningTotal',
    String(
      duragas
    )
  );


  setText(
    'kinggasOpeningTotal',
    String(
      kinggas
    )
  );

}
/* =========================================================
   DISPONIBILIDAD PARA VENTA
========================================================= */

export function renderSaleAvailability() {

  setText(
    'saleDuragasAvailable',
    String(
      getAvailableStock(
        GAS_IDS.DURAGAS
      )
    )
  );


  setText(
    'saleKingGasAvailable',
    String(
      getAvailableStock(
        GAS_IDS.KING_GAS
      )
    )
  );

}



/* =========================================================
   PREVISUALIZACIÓN DE VENTA
========================================================= */

export function renderSalePreview(
  preview
) {

  if (!preview) {

    return;

  }


  setText(
    'saleUnitsTotal',
    String(
      preview.totalUnits
    )
  );


  setText(
    'saleTotal',
    formatMoney(
      preview.total
    )
  );


  setText(
    'saleTotalFormula',
    `${preview.totalUnits} unidades × ${formatMoney(
      preview.price
    )}`
  );


  setText(
    'saleChange',
    formatMoney(
      preview.change
    )
  );


  setText(
    'salePaidNow',
    formatMoney(
      preview.paidNow
    )
  );


  setText(
    'saleMoneyDue',
    formatMoney(
      preview.moneyDue
    )
  );


  setText(
    'saleReplacementReserve',
    formatMoney(
      preview.reserveRequired
    )
  );


  setText(
    'saleReplacementFormula',
    `Reposición: ${formatMoney(
      preview.reserveRequired
    )}`
  );


  setText(
    'saleEstimatedProfit',
    formatMoney(
      preview.grossProfit
    )
  );


  setText(
    'saleEstimatedProfitFormula',
    `Venta ${formatMoney(
      preview.total
    )} − reposición ${formatMoney(
      preview.reserveRequired
    )}`
  );


  setText(
    'saleCollectedProfit',
    formatMoney(
      preview.collectedProfit ??
      0
    )
  );


  setText(
    'saleCollectedProfitFormula',
    preview.paidNow > 0
      ? `Cobrado ${formatMoney(
          preview.paidNow
        )} − reposición financiada`
      : 'Aún no se ha recibido dinero'
  );


  setText(
    'saleDuragasReserve',
    formatMoney(
      preview
        .byGas
        ?.[GAS_IDS.DURAGAS]
        ?.reserveRequired ??
      0
    )
  );


  setText(
    'saleDuragasProfit',
    formatMoney(
      preview
        .byGas
        ?.[GAS_IDS.DURAGAS]
        ?.grossProfit ??
      0
    )
  );


  setText(
    'saleDuragasProfitFormula',
    `Venta ${formatMoney(
      preview.byGas?.[GAS_IDS.DURAGAS]
        ?.revenue ?? 0
    )} − reposición ${formatMoney(
      preview.byGas?.[GAS_IDS.DURAGAS]
        ?.reserveRequired ?? 0
    )}`
  );


  setText(
    'saleDuragasReserveFormula',
    `${preview.byGas?.[GAS_IDS.DURAGAS]
      ?.quantity ?? 0} × ${formatMoney(
      preview.byGas?.[GAS_IDS.DURAGAS]
        ?.replacementCost ??
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )} = ${formatMoney(
      preview.byGas?.[GAS_IDS.DURAGAS]
        ?.reserveRequired ?? 0
    )}`
  );


  setText(
    'saleKingGasReserve',
    formatMoney(
      preview
        .byGas
        ?.[GAS_IDS.KING_GAS]
        ?.reserveRequired ??
      0
    )
  );


  setText(
    'saleKingGasProfit',
    formatMoney(
      preview
        .byGas
        ?.[GAS_IDS.KING_GAS]
        ?.grossProfit ??
      0
    )
  );


  setText(
    'saleKingGasProfitFormula',
    `Venta ${formatMoney(
      preview.byGas?.[GAS_IDS.KING_GAS]
        ?.revenue ?? 0
    )} − reposición ${formatMoney(
      preview.byGas?.[GAS_IDS.KING_GAS]
        ?.reserveRequired ?? 0
    )}`
  );


  setText(
    'saleKingGasReserveFormula',
    `${preview.byGas?.[GAS_IDS.KING_GAS]
      ?.quantity ?? 0} × ${formatMoney(
      preview.byGas?.[GAS_IDS.KING_GAS]
        ?.replacementCost ??
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )} = ${formatMoney(
      preview.byGas?.[GAS_IDS.KING_GAS]
        ?.reserveRequired ?? 0
    )}`
  );


  setText(
    'saleDuragasTanksDue',
    String(
      preview
        .tanksDue
        ?.[GAS_IDS.DURAGAS] ??
      0
    )
  );


  setText(
    'saleKingGasTanksDue',
    String(
      preview
        .tanksDue
        ?.[GAS_IDS.KING_GAS] ??
      0
    )
  );


  setText(
    'saleDuragasPickup',
    String(
      preview
        .pickupDue
        ?.[GAS_IDS.DURAGAS] ??
      0
    )
  );


  setText(
    'saleKingGasPickup',
    String(
      preview
        .pickupDue
        ?.[GAS_IDS.KING_GAS] ??
      0
    )
  );


  const exchangeTone =

    preview.exchange?.type === 'missing'

      ? 'warn'

      : 'good';


  setOperationStatus(
    'saleExchangeStatus',
    preview.exchange?.text ?? '',
    exchangeTone
  );


  const tone =

    preview.status === 'completed'

      ? 'good'

      : 'warn';


  setOperationStatus(
    'saleStatus',
    preview.statusLabel,
    tone
  );

}



/* =========================================================
   TABLA DE VENTAS DEL DÍA
========================================================= */

export function renderSalesTable() {

  const body =
    byId('salesBody');


  if (!body) {

    return;

  }


  const sales =
    sortNewestFirst(
      getCurrentDaySales(),
      sale =>
        sale.createdAt
    );


  if (
    sales.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="8">
          No hay ventas registradas.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    sales.map(
      sale => {

        const status =
          SALE_STATUS_LABELS[
            sale.status
          ] ??
          sale.status;


        return `
          <tr>

            <td>
              ${escapeHtml(
                formatShortTime(
                  sale.createdAt
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                sale.customer ||
                'Mostrador'
              )}
            </td>

            <td>
              ${escapeHtml(
                describeSaleProducts(
                  sale
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                describeSaleEmpties(
                  sale
                )
              )}
            </td>

            <td>
              ${formatMoney(
                sale.unitPrice ??
                sale.price
              )}
            </td>

            <td>
              <strong>
                ${formatMoney(
                  sale.total
                )}
              </strong>
            </td>

            <td>
              ${escapeHtml(
                sale.paymentMethod
              )}
            </td>

            <td>
              <span class="badge">
                ${escapeHtml(status)}
              </span>
            </td>

          </tr>
        `;

      }
    ).join('');

}



/* =========================================================
   BOLSAS EN REPOSICIONES
========================================================= */
export function renderReplenishmentWallets() {

  const day =
    getActiveDay();


  const wallets =
    getWalletSummary(
      day?.id ??
      null
    );


  const isGeneral =
    Boolean(
      wallets
        ?.general
        ?.active
    );


  /* =====================================================
     MODO FINANCIERO
  ===================================================== */

  setText(
    'replenishmentFinancialMode',
    isGeneral
      ? 'Bolsa General'
      : 'Bolsas exactas'
  );


  setVisible(
    'replenishmentGeneralWalletBlock',
    isGeneral
  );


  setVisible(
    'replenishmentExactWalletsBlock',
    !isGeneral
  );


  /* =====================================================
     BOLSA GENERAL
  ===================================================== */

  setText(
    'replenishmentGeneralWallet',
    formatMoney(
      wallets
        ?.general
        ?.balance ??
      0
    )
  );


  setText(
    'replenishmentGeneralReservePerUnit',
    formatMoney(
      wallets
        ?.general
        ?.reservePerUnit ??
      0
    )
  );


  setText(
    'replenishmentGeneralWalletFormula',
    `Saldo común disponible para Duragas y King Gas: ${formatMoney(
      wallets
        ?.general
        ?.balance ??
      0
    )}`
  );


  /* =====================================================
     DURAGAS - MODO EXACTO
  ===================================================== */

  const duragas =
    wallets?.[
      GAS_IDS.DURAGAS
    ] ?? {};


  setText(
    'replenishmentDuragasWallet',
    formatMoney(
      duragas.balance ??
      0
    )
  );


  setText(
    'replenishmentDuragasPrevious',
    formatMoney(
      duragas.previousRemaining ??
      0
    )
  );


  setText(
    'replenishmentDuragasToday',
    formatMoney(
      duragas.todayReserveRemaining ??
      0
    )
  );


  setText(
    'replenishmentDuragasContributions',
    formatMoney(
      duragas.contributionsRemaining ??
      0
    )
  );


  setText(
    'replenishmentDuragasEquivalent',
    `${duragas.equivalentUnits ?? 0} × ${formatMoney(
      duragas.replacementCost ??
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )}`
  );


  setText(
    'replenishmentDuragasWalletFormula',
    `${formatMoney(
      duragas.previousRemaining ??
      0
    )} anterior + ${formatMoney(
      duragas.todayReserveRemaining ??
      0
    )} hoy + ${formatMoney(
      duragas.contributionsRemaining ??
      0
    )} aportes = ${formatMoney(
      duragas.balance ??
      0
    )}`
  );


  /* =====================================================
     KING GAS - MODO EXACTO
  ===================================================== */

  const kingGas =
    wallets?.[
      GAS_IDS.KING_GAS
    ] ?? {};


  setText(
    'replenishmentKingGasWallet',
    formatMoney(
      kingGas.balance ??
      0
    )
  );


  setText(
    'replenishmentKingGasPrevious',
    formatMoney(
      kingGas.previousRemaining ??
      0
    )
  );


  setText(
    'replenishmentKingGasToday',
    formatMoney(
      kingGas.todayReserveRemaining ??
      0
    )
  );


  setText(
    'replenishmentKingGasContributions',
    formatMoney(
      kingGas.contributionsRemaining ??
      0
    )
  );


  setText(
    'replenishmentKingGasEquivalent',
    `${kingGas.equivalentUnits ?? 0} × ${formatMoney(
      kingGas.replacementCost ??
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )}`
  );


  setText(
    'replenishmentKingGasWalletFormula',
    `${formatMoney(
      kingGas.previousRemaining ??
      0
    )} anterior + ${formatMoney(
      kingGas.todayReserveRemaining ??
      0
    )} hoy + ${formatMoney(
      kingGas.contributionsRemaining ??
      0
    )} aportes = ${formatMoney(
      kingGas.balance ??
      0
    )}`
  );

}



/* =========================================================
   PREVISUALIZACIÓN DE REPOSICIÓN
========================================================= */

export function renderReplenishmentPreview(
  preview
) {

  if (!preview) {

    return;

  }


  const wallets =
    getWalletSummary(
      getActiveDay()?.id ??
      null
    );


  const isGeneral =
    Boolean(
      wallets
        ?.general
        ?.active
    );


  const funding =
    preview.fundingBreakdown ??
    {};


  /* =====================================================
     MODO
  ===================================================== */

  setText(
    'replenishmentPreviewFinancialMode',
    isGeneral
      ? 'Bolsa General'
      : 'Bolsa exacta'
  );


  setVisible(
    'replenishmentGeneralFundingBlock',
    isGeneral
  );


  setVisible(
    'replenishmentExactFundingBlock',
    !isGeneral
  );


  /* =====================================================
     APORTE ADICIONAL
  ===================================================== */

  const contributionSection =
    byId(
      'replenishmentExtraContributionSection'
    );


  if (contributionSection) {

    contributionSection.hidden =
      preview.extraNeededBeforeContribution <= 0;

  }


  /* =====================================================
     COSTO
  ===================================================== */

  setText(
    'replenishmentUnitCost',
    formatMoney(
      preview.unitCost
    )
  );


  setText(
    'replenishmentUnitCostFormula',
    `${preview.quantity} × ${formatMoney(
      preview.unitCost
    )} = ${formatMoney(
      preview.gasCost
    )}`
  );


  /* =====================================================
     INVENTARIO
  ===================================================== */

  setText(
    'replenishmentCurrentFull',
    String(
      preview
        .inventory
        .fullBefore
    )
  );


  setText(
    'replenishmentCurrentEmpty',
    String(
      preview
        .inventory
        .emptyBefore
    )
  );


  setText(
    'replenishmentCurrentWallet',
    formatMoney(
      preview.walletBefore
    )
  );


  /* =====================================================
     DURAGAS - COMPOSICIÓN PROVEEDOR
  ===================================================== */

  const composition =
    byId(
      'replenishmentDuragasComposition'
    );


  if (composition) {

    composition.hidden =
      preview.gasId !==
      GAS_IDS.DURAGAS;

  }


  setText(
    'replenishmentOrderCostFormula',
    `Factura pendiente: ${preview.quantity} × $1,15 = ${formatMoney(
      preview.quantity *
      1.15
    )}`
  );


  setText(
    'replenishmentArrivalCostFormula',
    `Pago al llegar: ${preview.quantity} × $0,55 = ${formatMoney(
      preview.quantity *
      0.55
    )}`
  );


  setText(
    'replenishmentTotalCostFormula',
    `Costo económico total: ${preview.quantity} × ${formatMoney(
      preview.unitCost
    )} = ${formatMoney(
      preview.gasCost
    )}`
  );


  /* =====================================================
     PROVEEDOR
  ===================================================== */

  const supplierPayment =
    preview.supplierPayment ??
    {};


  setText(
    'replenishmentSupplierPaidNow',
    formatMoney(
      supplierPayment.paidNow ??
      0
    )
  );


  setText(
    'replenishmentSupplierPending',
    formatMoney(
      supplierPayment.pending ??
      0
    )
  );


  setText(
    'replenishmentSupplierCommitted',
    formatMoney(
      supplierPayment.committed ??
      0
    )
  );


  setOperationStatus(

    'replenishmentSupplierStatus',

    (supplierPayment.pending ?? 0) > 0

      ? `Se pagarán ${formatMoney(
          supplierPayment.paidNow ??
          0
        )} ahora y quedarán ${formatMoney(
          supplierPayment.pending ??
          0
        )} comprometidos para pagar después.`

      : `El proveedor se pagará completo ahora: ${formatMoney(
          supplierPayment.paidNow ??
          0
        )}.`,

    (supplierPayment.pending ?? 0) > 0
      ? 'warn'
      : 'good'

  );


  /* =====================================================
     BOLSA ANTES / DESPUÉS
  ===================================================== */

  setText(
    'replenishmentWalletBefore',
    formatMoney(
      preview.walletBefore
    )
  );


  setText(
    'replenishmentExtraPreview',
    formatMoney(
      preview.extraContribution
    )
  );


  setText(
    'replenishmentGasCost',
    formatMoney(
      preview.gasCost
    )
  );


  setText(
    'replenishmentGasCostFormula',
    `${preview.quantity} × ${formatMoney(
      preview.unitCost
    )}`
  );


  setText(
    'replenishmentAdditionalCosts',
    formatMoney(
      preview.additionalCosts
    )
  );


  /*
    totalPaid es el costo ECONÓMICO completo.

    En Duragas puede incluir una factura
    que todavía no salió de la bolsa.
  */

  setText(
    'replenishmentTotalPaid',
    formatMoney(
      preview.totalPaid
    )
  );


  setText(
    'replenishmentTotalPaidFormula',
    `${formatMoney(
      preview.gasCost
    )} gas + ${formatMoney(
      preview.additionalCosts
    )} costos adicionales`
  );


  setText(
    'replenishmentWalletAfter',
    formatMoney(
      preview.walletAfter
    )
  );


  /* =====================================================
     BOLSA GENERAL
  ===================================================== */
if (isGeneral) {

  const generalAvailable =
    roundMoney(
      funding.generalAvailable ??
      preview.walletBefore ??
      0
    );


  const fromGeneral =
    roundMoney(
      funding.fromGeneralWallet ??
      Math.min(
        generalAvailable,
        preview.gasCost ??
        0
      )
    );


  /*
    Cuánto del aporte NUEVO realmente
    hace falta utilizar para pagar el gas.
  */

  const missingAfterGeneral =
    roundMoney(
      Math.max(
        0,
        (
          preview.gasCost ??
          0
        ) -
        fromGeneral
      )
    );


  const fromNewContribution =
    roundMoney(
      Math.min(
        preview.extraContribution ??
        0,
        missingAfterGeneral
      )
    );


  /*
    Lo que sobró del aporte nuevo
    permanece dentro de la Bolsa General.
  */

  const unusedNewContribution =
    roundMoney(
      Math.max(
        0,
        (
          preview.extraContribution ??
          0
        ) -
        fromNewContribution
      )
    );


  /*
    preview.walletAfter YA incluye:

    saldo anterior
    + aporte adicional
    - costo del gas

    Por eso es la cifra correcta
    que debe mostrarse como saldo final.
  */

  const generalAfter =
    roundMoney(
      preview.walletAfter ??
      0
    );


  setText(
    'replenishmentGeneralAvailable',
    formatMoney(
      generalAvailable
    )
  );


  setText(
    'replenishmentUseGeneral',
    formatMoney(
      fromGeneral
    )
  );


  setText(
    'replenishmentGeneralAfter',
    formatMoney(
      generalAfter
    )
  );


  setText(
    'replenishmentGeneralFundingFormula',

    `${formatMoney(
      generalAvailable
    )} bolsa + ${formatMoney(
      preview.extraContribution ??
      0
    )} aporte − ${formatMoney(
      preview.gasCost ??
      0
    )} costo = ${formatMoney(
      generalAfter
    )}`

  );


  /*
    Campos del modelo exacto.

    En modo GENERAL no existen
    "anterior", "hoy" y "aportes"
    separados por marca.
  */

  setText(
    'replenishmentUsePrevious',
    formatMoney(0)
  );


  setText(
    'replenishmentUseToday',
    formatMoney(0)
  );


  /*
    Aquí mostramos únicamente cuánto
    del aporte NUEVO realmente fue utilizado.
  */

  setText(
    'replenishmentUseContributions',
    formatMoney(
      fromNewContribution
    )
  );


  setText(
    'replenishmentPreviousAfter',
    formatMoney(0)
  );


  setText(
    'replenishmentTodayAfter',
    formatMoney(0)
  );


  /*
    Si el usuario aportó más dinero del
    estrictamente necesario, el sobrante
    sigue perteneciendo a Bolsa General.
  */

  setText(
    'replenishmentContributionsAfter',
    formatMoney(
      unusedNewContribution
    )
  );

}
  /* =====================================================
     BOLSAS EXACTAS
  ===================================================== */

  else {

    const fromPrevious =
      roundMoney(
        funding.fromPrevious ??
        0
      );


    const fromToday =
      roundMoney(
        funding.fromToday ??
        0
      );


    const fromExistingContributions =
      roundMoney(
        funding.fromContributions ??
        0
      );


    const alreadyCovered =
      roundMoney(
        fromPrevious +
        fromToday +
        fromExistingContributions
      );


    const stillNeeded =
      roundMoney(
        Math.max(
          0,
          preview.gasCost -
          alreadyCovered
        )
      );


    const fromNewContribution =
      roundMoney(
        Math.min(
          preview.extraContribution ??
          0,
          stillNeeded
        )
      );


    const totalFromContributions =
      roundMoney(
        fromExistingContributions +
        fromNewContribution
      );


    setText(
      'replenishmentUsePrevious',
      formatMoney(
        fromPrevious
      )
    );


    setText(
      'replenishmentUseToday',
      formatMoney(
        fromToday
      )
    );


    setText(
      'replenishmentUseContributions',
      formatMoney(
        totalFromContributions
      )
    );


    const previousAfter =
      roundMoney(
        funding.previousAfter ??
        0
      );


    const todayAfter =
      roundMoney(
        funding.todayAfter ??
        0
      );


    const existingContributionsAfter =
      roundMoney(
        funding.contributionsAfter ??
        0
      );


    const unusedNewContribution =
      roundMoney(
        Math.max(
          0,
          (
            preview.extraContribution ??
            0
          ) -
          fromNewContribution
        )
      );


    const contributionsAfter =
      roundMoney(
        existingContributionsAfter +
        unusedNewContribution
      );


    setText(
      'replenishmentPreviousAfter',
      formatMoney(
        previousAfter
      )
    );


    setText(
      'replenishmentTodayAfter',
      formatMoney(
        todayAfter
      )
    );


    setText(
      'replenishmentContributionsAfter',
      formatMoney(
        contributionsAfter
      )
    );

  }


  setText(
    'replenishmentFundingAfterTotal',
    formatMoney(
      preview.walletAfter
    )
  );


  /* =====================================================
     VALIDACIÓN VISUAL
  ===================================================== */

  const messages = [];


  if (
    !preview.hasEnoughEmpties
  ) {

    messages.push(
      `Solo tienes ${preview.inventory.emptyBefore} vacíos disponibles.`
    );

  }


  if (
    !preview.hasEnoughWallet
  ) {

    messages.push(
      `Faltan ${formatMoney(
        preview.remainingMissing
      )} para financiar la reposición.`
    );

  }


  if (
    messages.length > 0
  ) {

    setOperationStatus(
      'replenishmentStatus',
      messages.join(' '),
      'warn'
    );

  }
  else {

    setOperationStatus(

      'replenishmentStatus',

      (supplierPayment.pending ?? 0) > 0

        ? 'Reposición financiada. Parte del pago al proveedor quedará pendiente.'

        : 'Reposición lista para registrar.',

      (supplierPayment.pending ?? 0) > 0
        ? 'warn'
        : 'good'

    );

  }

}
/* =========================================================
   TABLA DE REPOSICIONES
========================================================= */

export function renderReplenishmentsTable() {

  const body =
    byId('replenishmentsBody');


  if (!body) {

    return;

  }


  const items =
    getRecentReplenishments(
      50
    );


  if (
    items.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="8">
          No hay reposiciones registradas.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    items.map(
      item => {

        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDateTime(
                  item.createdAt
                )
              )}
            </td>

            <td>
              ${escapeHtml(
                item.gasName ??
                GAS_TYPES[
                  item.gasId
                ]?.name ??
                item.gasId
              )}
            </td>

            <td>
              ${item.quantity}
            </td>

            <td>
              ${item.emptyOut}
            </td>

            <td>
              ${formatMoney(
                item.gasCost
              )}
            </td>

            <td>
              ${formatMoney(
                item.additionalCosts
              )}
            </td>

            <td>
              ${formatMoney(
                item.extraContribution
              )}
            </td>

            <td>
              <strong>
                ${formatMoney(
                  item.walletAfter
                )}
              </strong>
            </td>

          </tr>
        `;

      }
    ).join('');

}



/* =========================================================
   REPOSICIONES RECIENTES DASHBOARD
========================================================= */

export function renderRecentReplenishments() {

  const body =
    byId(
      'recentReplenishmentsBody'
    );


  if (!body) {

    return;

  }


  const items =
    getRecentReplenishments(
      HISTORY_CONFIG
        .dashboardRecentReplenishments
    );


  if (
    items.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="5">
          Sin reposiciones recientes.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    items.map(
      item => `
        <tr>

          <td>
            ${escapeHtml(
              formatDateTime(
                item.createdAt
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              GAS_TYPES[
                item.gasId
              ]?.name ??
              item.gasId
            )}
          </td>

          <td>
            ${item.quantity}
          </td>

          <td>
            ${formatMoney(
              item.gasCost
            )}
          </td>

          <td>
            ${formatMoney(
              item.walletAfter
            )}
          </td>

        </tr>
      `
    ).join('');

}



/* =========================================================
   MOVIMIENTOS RECIENTES
========================================================= */

export function renderRecentMovements() {

  const body =
    byId(
      'recentMovementsBody'
    );


  if (!body) {

    return;

  }


  const movements =
    sortNewestFirst(
      getState().movements,
      item =>
        item.createdAt
    )
    .slice(
      0,
      HISTORY_CONFIG
        .dashboardRecentMovements
    );


  if (
    movements.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="4">
          Sin movimientos.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    movements.map(
      item => `
        <tr>

          <td>
            ${escapeHtml(
              formatDateTime(
                item.createdAt
              )
            )}
          </td>

          <td>
            ${escapeHtml(
              MOVEMENT_LABELS[
                item.type
              ] ??
              item.type
            )}
          </td>

          <td>
            ${escapeHtml(
              item.detail ??
              ''
            )}
          </td>

          <td>
            ${
              item.value
                ? formatMoney(
                    item.value
                  )
                : '—'
            }
          </td>

        </tr>
      `
    ).join('');

}



/* =========================================================
   INVENTARIO
========================================================= */
export function renderInventory() {

  const inventory =
    getInventorySummary();


  const duragas =
    inventory.duragas;


  const kinggas =
    inventory.kinggas;


  /* =====================================================
     DURAGAS
  ===================================================== */

  setText(
    'inventoryDuragasTotal',
    String(
      duragas.controlled
    )
  );


  setText(
    'inventoryDuragasFull',
    String(
      duragas.full
    )
  );


  setText(
    'inventoryDuragasEmpty',
    String(
      duragas.empty
    )
  );


  setText(
    'inventoryDuragasReserved',
    String(
      duragas.reserved
    )
  );


  setText(
    'inventoryDuragasRouteReserved',
    String(
      duragas.routeReserved ??
      0
    )
  );


  setText(
    'inventoryDuragasRoute',
    String(
      duragas.route ??
      0
    )
  );


  setText(
    'inventoryDuragasLoaned',
    String(
      duragas.loaned
    )
  );


  setText(
    'inventoryDuragasPhysical',
    String(
      duragas.physical
    )
  );


  setText(
    'inventoryDuragasControlled',
    String(
      duragas.controlled
    )
  );


  /* =====================================================
     KING GAS
  ===================================================== */

  setText(
    'inventoryKingGasTotal',
    String(
      kinggas.controlled
    )
  );


  setText(
    'inventoryKingGasFull',
    String(
      kinggas.full
    )
  );


  setText(
    'inventoryKingGasEmpty',
    String(
      kinggas.empty
    )
  );


  setText(
    'inventoryKingGasReserved',
    String(
      kinggas.reserved
    )
  );


  setText(
    'inventoryKingGasRouteReserved',
    String(
      kinggas.routeReserved ??
      0
    )
  );


  setText(
    'inventoryKingGasRoute',
    String(
      kinggas.route ??
      0
    )
  );


  setText(
    'inventoryKingGasLoaned',
    String(
      kinggas.loaned
    )
  );


  setText(
    'inventoryKingGasPhysical',
    String(
      kinggas.physical
    )
  );


  setText(
    'inventoryKingGasControlled',
    String(
      kinggas.controlled
    )
  );


  /* =====================================================
     TOTALES
  ===================================================== */

  const routeReservedTotal =

    toNonNegativeInteger(
      duragas.routeReserved
    )

    +

    toNonNegativeInteger(
      kinggas.routeReserved
    );


  const routeTotal =

    toNonNegativeInteger(
      duragas.route
    )

    +

    toNonNegativeInteger(
      kinggas.route
    );


  setText(
    'inventoryPhysicalTotal',
    String(
      inventory.totals.physical
    )
  );


  setText(
    'inventoryRouteReservedTotal',
    String(
      routeReservedTotal
    )
  );


  setText(
    'inventoryRouteTotal',
    String(
      routeTotal
    )
  );


  setText(
    'inventoryLoanedTotal',
    String(
      inventory.totals.loaned
    )
  );


  setText(
    'inventoryControlledTotal',
    String(
      inventory.totals.controlled
    )
  );


  renderInventoryMovements();

}



/* =========================================================
   MOVIMIENTOS DE INVENTARIO
========================================================= */

function renderInventoryMovements() {

  const body =
    byId(
      'inventoryMovementsBody'
    );


  if (!body) {

    return;

  }


  const normalInventoryTypes =
    new Set([

      'sale',
      'tank_return',
      'pickup',
      'replenishment',
      'adjustment',
      'loan',
      'loan_return',
      'opening',

    ]);


  /*
    Todos los movimientos de vendedor
    empiezan con route_.

    Así también aparecerán aquí sin tener
    que mantener otra lista manual.
  */

  const movements =
    sortNewestFirst(

      getState()
        .movements
        .filter(
          item => {

            const type =
              String(
                item.type ??
                ''
              );


            return (

              normalInventoryTypes.has(
                type
              )

              ||

              type.startsWith(
                'route_'
              )

            );

          }
        ),

      item =>
        item.createdAt

    )
    .slice(
      0,
      50
    );


  if (
    movements.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="5">
          Sin movimientos de inventario.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    movements.map(
      movement => `
        <tr>

          <td>
            ${escapeHtml(
              formatDateTime(
                movement.createdAt
              )
            )}
          </td>


          <td>
            ${escapeHtml(
              MOVEMENT_LABELS[
                movement.type
              ] ??
              movement.type
            )}
          </td>


          <td>
            ${escapeHtml(
              movement.gasId

                ? (
                    GAS_TYPES[
                      movement.gasId
                    ]?.name ??
                    movement.gasId
                  )

                : '—'
            )}
          </td>


          <td>
            ${escapeHtml(
              movement.detail ??
              ''
            )}
          </td>


          <td>
            ${escapeHtml(
              movement.reference ??
              ''
            )}
          </td>

        </tr>
      `
    ).join('');

}



/* =========================================================
   VENDEDOR / RUTAS
========================================================= */

function renderRouteAccounts() {

  const summaries =
    searchRouteAccountSummaries();


  const state =
    getState();


  /* =====================================================
     TOTALES GENERALES
  ===================================================== */

  const totals =
    summaries.reduce(
      (
        result,
        item
      ) => {

        result.moneyDue =
          roundMoney(
            result.moneyDue +
            (
              Number(
                item.moneyDue
              ) ||
              0
            )
          );


        result.tanksDue +=
          toNonNegativeInteger(
            item.tanksDueTotal
          );


        result.route +=
          toNonNegativeInteger(
            item.routeTotal
          );


        result.reserved +=
          toNonNegativeInteger(
            item.reservedTotal
          );


        result.openTrips +=
          toNonNegativeInteger(
            item.openTrips
          );


        return result;

      },
      {
        moneyDue: 0,
        tanksDue: 0,
        route: 0,
        reserved: 0,
        openTrips: 0,
      }
    );


  setHtml(
    'routeAccountsSummary',
    `
      <div class="inventory-control-summary">

        <div>
          <span>Cuentas vendedor</span>
          <strong>
            ${summaries.length}
          </strong>
        </div>


        <div>
          <span>Apartados en bodega</span>
          <strong>
            ${totals.reserved}
          </strong>
        </div>


        <div>
          <span>En ruta</span>
          <strong>
            ${totals.route}
          </strong>
        </div>


        <div>
          <span>Viajes abiertos</span>
          <strong>
            ${totals.openTrips}
          </strong>
        </div>


        <div>
          <span>Dinero pendiente</span>
          <strong>
            ${formatMoney(
              totals.moneyDue
            )}
          </strong>
        </div>


        <div>
          <span>Vacíos pendientes</span>
          <strong>
            ${totals.tanksDue}
          </strong>
        </div>

      </div>
    `
  );


  /* =====================================================
     TARJETAS DE CUENTAS
  ===================================================== */

  const container =
    byId(
      'routeAccountsList'
    );


  if (container) {

    if (
      summaries.length === 0
    ) {

      container.innerHTML = `
        <div class="empty-state">
          Todavía no existen cuentas de vendedor.
        </div>
      `;

    }
    else {

      container.innerHTML =
        summaries.map(
          item => {

            const account =
              item.account ??
              {};


            return `
              <article class="pending-card">

                <div class="pending-card-head">

                  <div>

                    <h3>
                      ${escapeHtml(
                        account.name ??
                        'Vendedor'
                      )}
                    </h3>

                    <small>
                      ${escapeHtml(
                        account.reference ??
                        ''
                      )}
                    </small>

                  </div>


                  <span class="badge">
                    ${
                      item.hasPending
                        ? 'Con movimientos'
                        : 'Al día'
                    }
                  </span>

                </div>


                <div class="pending-values">

                  <div>
                    <span>Apartados Duragas</span>
                    <strong>
                      ${
                        item.reserved
                          ?.[GAS_IDS.DURAGAS] ??
                        0
                      }
                    </strong>
                  </div>


                  <div>
                    <span>Apartados King Gas</span>
                    <strong>
                      ${
                        item.reserved
                          ?.[GAS_IDS.KING_GAS] ??
                        0
                      }
                    </strong>
                  </div>


                  <div>
                    <span>En ruta Duragas</span>
                    <strong>
                      ${
                        item.route
                          ?.[GAS_IDS.DURAGAS] ??
                        0
                      }
                    </strong>
                  </div>


                  <div>
                    <span>En ruta King Gas</span>
                    <strong>
                      ${
                        item.route
                          ?.[GAS_IDS.KING_GAS] ??
                        0
                      }
                    </strong>
                  </div>


                  <div>
                    <span>Debe dinero</span>
                    <strong>
                      ${formatMoney(
                        item.moneyDue ??
                        0
                      )}
                    </strong>
                  </div>


                  <div>
                    <span>Debe vacíos</span>
                    <strong>
                      ${item.tanksDueTotal ?? 0}
                    </strong>
                  </div>


                  <div>
                    <span>Viajes abiertos</span>
                    <strong>
                      ${item.openTrips ?? 0}
                    </strong>
                  </div>

                </div>

              </article>
            `;

          }
        ).join('');

    }

  }


  /* =====================================================
     OPCIONES DE SELECT
  ===================================================== */

  function fillSelect(
    id,
    options,
    placeholder
  ) {

    const select =
      byId(id);


    if (!select) {

      return;

    }


    const previousValue =
      select.value;


    select.innerHTML = `

      <option value="">
        ${escapeHtml(
          placeholder
        )}
      </option>

      ${options.map(
        option => `
          <option
            value="${escapeHtml(
              option.value
            )}"
          >
            ${escapeHtml(
              option.label
            )}
          </option>
        `
      ).join('')}

    `;


    const stillExists =
      Array.from(
        select.options
      ).some(
        option =>
          option.value ===
          previousValue
      );


    if (
      stillExists
    ) {

      select.value =
        previousValue;

    }

  }


  /* =====================================================
     CUENTAS
  ===================================================== */

  const accountOptions =
    summaries.map(
      item => ({

        value:
          item.account.id,

        label:
          item.account.reference

            ? `${item.account.name} · ${item.account.reference}`

            : item.account.name,

      })
    );


  [
    'routeReserveAccountId',
    'routeStartAccountId',
    'routePaymentAccountId',
  ].forEach(
    id => {

      fillSelect(
        id,
        accountOptions,
        'Selecciona vendedor'
      );

    }
  );


  /* =====================================================
     RESERVAS ACTIVAS
  ===================================================== */

  const accountNameById =
    new Map(
      summaries.map(
        item => [

          item.account.id,

          item.account.name,

        ]
      )
    );


  const reservationOptions =
    (
      state.routeReservations ??
      []
    )
      .filter(
        reservation => {

          if (
            reservation.active ===
            false
          ) {

            return false;

          }


          const remaining =
            reservation.remaining ??
            {};


          return (

            toNonNegativeInteger(
              remaining[
                GAS_IDS.DURAGAS
              ]
            )

            +

            toNonNegativeInteger(
              remaining[
                GAS_IDS.KING_GAS
              ]
            )

          ) > 0;

        }
      )
      .map(
        reservation => {

          const remaining =
            reservation.remaining ??
            {};


          const duragas =
            toNonNegativeInteger(
              remaining[
                GAS_IDS.DURAGAS
              ]
            );


          const kinggas =
            toNonNegativeInteger(
              remaining[
                GAS_IDS.KING_GAS
              ]
            );


          return {

            value:
              reservation.id,

            label:
              `${
                accountNameById.get(
                  reservation.accountId
                ) ??
                'Vendedor'
              } · D ${duragas} · K ${kinggas}`,

          };

        }
      );


  [
    'routePickupReservationId',
    'routeReleaseReservationId',
  ].forEach(
    id => {

      fillSelect(
        id,
        reservationOptions,
        'Selecciona apartado'
      );

    }
  );


  /* =====================================================
     VIAJES ABIERTOS
  ===================================================== */

  const tripOptions =
    (
      state.routeTrips ??
      []
    )
      .filter(
        trip =>
          trip.active !==
          false
      )
      .map(
        trip => ({

          value:
            trip.id,

          label:
            `${
              accountNameById.get(
                trip.accountId
              ) ??
              'Vendedor'
            } · viaje ${trip.id}`,

        })
      );


  fillSelect(
    'routeSettleTripId',
    tripOptions,
    'Selecciona viaje'
  );

}



/* =========================================================
   PENDIENTES
========================================================= */

export function renderAccounts() {

  const summary =
    getAccountsSummary();


  setHtml(
    'accountsSummary',
    `
      <div class="inventory-control-summary">

        <div>
          <span>Cuentas abiertas</span>
          <strong>
            ${summary.openAccounts}
          </strong>
        </div>


        <div>
          <span>Dinero por cobrar</span>
          <strong>
            ${formatMoney(
              summary.moneyDue
            )}
          </strong>
        </div>


        <div>
          <span>Tanques por recibir</span>
          <strong>
            ${summary.tanksDue.total}
          </strong>
        </div>


        <div>
          <span>Pagados por retirar</span>
          <strong>
            ${
              summary
                .pickupDue
                ?.total ??
              0
            }
          </strong>
        </div>

      </div>
    `
  );


  /*
    La cuenta especial del vendedor
    se pinta aparte de los clientes normales.
  */

  renderRouteAccounts();


  const container =
    byId(
      'accountsCards'
    );


  if (!container) {

    return;

  }


  const accounts =
    getOpenAccounts();


  if (
    accounts.length === 0
  ) {

    container.innerHTML = `
      <div class="empty-state">
        No existen pendientes abiertos.
      </div>
    `;


    return;

  }


  container.innerHTML =
    accounts.map(
      item =>
        pendingCardHtml(
          item
        )
    ).join('');

}
/* =========================================================
   TARJETA DE PENDIENTE
========================================================= */

function pendingCardHtml(
  item
) {

  const balance =
    item.balance;


  const actions =
    getAvailableAccountActions(
      item.id
    );


  const cssType =
    item.type === 'money'
      ? 'money'
      : item.type === 'tanks'
        ? 'tanks'
        : item.type === 'pickup'
          ? 'pickup'
          : 'mixed';


  const buttons = [];


  const inconsistencyWarning =
    actions.inconsistent
      ? `
          <div class="operation-status bad">
            ⚠ Cuenta inconsistente
          </div>
        `
      : '';


  if (
    actions.payment
  ) {

    buttons.push(`
      <button
        type="button"
        class="btn btn-primary"
        data-account-action="payment"
        data-account-id="${escapeHtml(item.id)}"
      >
        Registrar pago
      </button>
    `);

  }


  if (
    actions.tankReturn
  ) {

    buttons.push(`
      <button
        type="button"
        class="btn"
        data-account-action="tanks"
        data-account-id="${escapeHtml(item.id)}"
      >
        Recibir tanques
      </button>
    `);

  }


  if (
    actions.pickup
  ) {

    buttons.push(`
      <button
        type="button"
        class="btn"
        data-account-action="pickup"
        data-account-id="${escapeHtml(item.id)}"
      >
        Registrar retiro
      </button>
    `);

  }


  return `
    <article class="pending-card ${cssType}">

      <div class="pending-card-head">

        <div>
          <h3>
            ${escapeHtml(
              item.customer ||
              'Cliente'
            )}
          </h3>

          <small>
            ${escapeHtml(
              formatDateTime(
                item.createdAt
              )
            )}
          </small>
        </div>

        <span class="badge">
          ${escapeHtml(
            item.type ??
            'Pendiente'
          )}
        </span>

      </div>

      <div class="pending-values">

        <div>
          <span>Dinero</span>
          <strong>
            ${formatMoney(
              balance.moneyDue
            )}
          </strong>
        </div>

        <div>
          <span>Debe Duragas</span>
          <strong>
            ${balance
              .tanksDue
              ?.[GAS_IDS.DURAGAS] ?? 0}
          </strong>
        </div>

        <div>
          <span>Debe King Gas</span>
          <strong>
            ${balance
              .tanksDue
              ?.[GAS_IDS.KING_GAS] ?? 0}
          </strong>
        </div>

        <div>
          <span>Por retirar</span>
          <strong>
            ${
              (
                balance
                  .pickupDue
                  ?.[GAS_IDS.DURAGAS] ??
                0
              )
              +
              (
                balance
                  .pickupDue
                  ?.[GAS_IDS.KING_GAS] ??
                0
              )
            }
          </strong>
        </div>

      </div>

      <div class="pending-actions">
        ${inconsistencyWarning}
        ${buttons.join('')}
      </div>

    </article>
  `;

}



/* =========================================================
   ABRIR DIÁLOGO DE PENDIENTE
========================================================= */

export function openPaymentDialog(
  accountId,
  action
) {

  const dialog =
    byId('paymentDialog');


  if (!dialog) {

    return;

  }


  const account =
    getAccountById(
      accountId
    );


  const balance =
    getAccountBalance(
      accountId
    );


  if (
    !account ||
    !balance
  ) {

    showToast(
      'No se encontró el pendiente.',
      'bad'
    );


    return;

  }


  setValue(
    'paymentAccountId',
    accountId
  );


  setValue(
    'paymentAction',
    action
  );


  const titles = {

    payment:
      'Registrar pago',

    tanks:
      'Recibir tanques',

    pickup:
      'Registrar retiro',

  };


  setText(
    'paymentDialogTitle',
    `${titles[action] ?? 'Pendiente'} · ${
      account.customer ||
      'Cliente'
    }`
  );


  setVisible(
    'paymentAmountWrap',
    action === 'payment'
  );


  setVisible(
    'paymentTanksWrap',
    action === 'tanks'
  );


  setVisible(
    'paymentPickupWrap',
    action === 'pickup'
  );


  setText(
    'paymentMoneyDue',
    formatMoney(
      balance.moneyDue
    )
  );


  setValue(
    'paymentAmount',
    balance.moneyDue
  );


  setText(
    'paymentTankHint',
    `Pendiente: ${balance.tanksDue?.[GAS_IDS.DURAGAS] ?? 0} Duragas y ${balance.tanksDue?.[GAS_IDS.KING_GAS] ?? 0} King Gas`
  );


  setValue(
    'paymentTankDuragas',
    0
  );


  setValue(
    'paymentTankKinggas',
    0
  );


  setText(
    'paymentPickupHint',
    `Pendiente: ${balance.pickupDue?.[GAS_IDS.DURAGAS] ?? 0} Duragas y ${balance.pickupDue?.[GAS_IDS.KING_GAS] ?? 0} King Gas`
  );


  setValue(
    'paymentPickupDuragas',
    0
  );


  setValue(
    'paymentPickupKinggas',
    0
  );


  setValue(
    'paymentNote',
    ''
  );


  if (
    typeof dialog.showModal ===
    'function'
  ) {

    dialog.showModal();

  }

}



/* =========================================================
   CERRAR DIÁLOGO
========================================================= */

export function closePaymentDialog() {

  const dialog =
    byId('paymentDialog');


  if (
    dialog?.open
  ) {

    dialog.close();

  }

}



/* =========================================================
   AJUSTE ACTUAL
========================================================= */

export function renderAdjustmentCurrent(
  preview = null
) {

  if (!preview) {

    const gasId =
      getValue(
        'adjustmentGasType'
      ) ||
      GAS_IDS.DURAGAS;


    const bucket =
      getValue(
        'adjustmentBucket'
      ) ||
      'full';


    const current =
      getInventoryQuantity(
        gasId,
        bucket
      );


    setText(
      'adjustmentCurrentQty',
      String(current)
    );


    setText(
      'adjustmentBeforePreview',
      String(current)
    );


    setText(
      'adjustmentOperatorPreview',
      '+'
    );


    setText(
      'adjustmentQtyPreview',
      '0'
    );


    setText(
      'adjustmentAfterPreview',
      String(current)
    );


    return;

  }


  setText(
    'adjustmentCurrentQty',
    String(
      preview.before
    )
  );


  setText(
    'adjustmentBeforePreview',
    String(
      preview.before
    )
  );


  setText(
    'adjustmentOperatorPreview',
    preview.operator
  );


  setText(
    'adjustmentQtyPreview',
    String(
      preview.quantity
    )
  );


  setText(
    'adjustmentAfterPreview',
    String(
      preview.after
    )
  );


  setOperationStatus(
    'adjustmentStatus',

    preview.valid
      ? 'El ajuste es válido.'
      : 'El ajuste dejaría inventario negativo.',

    preview.valid
      ? 'good'
      : 'bad'
  );

}



/* =========================================================
   HISTORIAL DE AJUSTES
========================================================= */

export function renderAdjustmentsHistory() {

  const body =
    byId(
      'adjustmentsBody'
    );


  if (!body) {

    return;

  }


  const items =
    getAdjustmentHistory()
      .slice(
        0,
        50
      );


  if (
    items.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="7">
          Sin ajustes ni préstamos.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    items.map(
      item => {

        if (
          item.kind ===
          'adjustment'
        ) {

          const sign =
            item.delta >= 0
              ? '+'
              : '−';


          return `
            <tr>

              <td>
                ${escapeHtml(
                  formatDateTime(
                    item.createdAt
                  )
                )}
              </td>

              <td>Ajuste</td>

              <td>
                ${escapeHtml(
                  item.gasName ??
                  item.gasId
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.bucketLabel ??
                  item.bucket
                )}
              </td>

              <td class="${
                item.delta >= 0
                  ? 'adjustment-positive'
                  : 'adjustment-negative'
              }">
                ${sign}${Math.abs(
                  item.delta
                )}
              </td>

              <td>
                ${item.after}
              </td>

              <td>
                ${escapeHtml(
                  item.note
                )}
              </td>

            </tr>
          `;

        }


        return `
          <tr>

            <td>
              ${escapeHtml(
                formatDateTime(
                  item.createdAt
                )
              )}
            </td>

            <td>
              ${
                item.action === 'lend'
                  ? 'Préstamo'
                  : 'Devolución'
              }
            </td>

            <td>
              ${escapeHtml(
                item.gasName ??
                item.gasId
              )}
            </td>

            <td>
              Prestados
            </td>

            <td>
              ${item.quantity}
            </td>

            <td>—</td>

            <td>
              ${escapeHtml(
                item.reference
              )}
              ${
                item.note
                  ? ` · ${escapeHtml(
                      item.note
                    )}`
                  : ''
              }
            </td>

          </tr>
        `;

      }
    ).join('');

}



/* =========================================================
   CIERRE - DATOS GENERALES
========================================================= */
export function renderClosing() {

  const data =
    getCurrentClosingData();


  setText(
    'closingAutoDateTime',
    formatDateTime(
      new Date()
    )
  );


  if (!data) {

    setOperationStatus(
      'closingStatus',
      'No existe una jornada abierta.',
      'warn'
    );


    renderSupplierPendingPayments();

    return;

  }


  const finance =
    data.finance;


  const wallets =
    data.wallets;


  const isGeneral =
    Boolean(
      wallets
        ?.general
        ?.active
    );


  /* =====================================================
     MODO FINANCIERO
  ===================================================== */

  setText(
    'closingFinancialMode',
    isGeneral
      ? 'Bolsa General'
      : 'Bolsas exactas'
  );


  setVisible(
    'closingGeneralWalletBlock',
    isGeneral
  );


  setVisible(
    'closingExactWalletsBlock',
    !isGeneral
  );


  /* =====================================================
     VENTAS Y CAJA
  ===================================================== */

  setText(
    'closingSalesRevenue',
    formatMoney(
      finance
        ?.sales
        ?.revenue ??
      0
    )
  );


  setText(
    'closingCollected',
    formatMoney(
      finance
        ?.collection
        ?.total ??
      0
    )
  );


  setText(
    'closingCashGenerated',
    formatMoney(
      finance
        ?.collection
        ?.cash ??
      0
    )
  );


  setText(
    'closingTransfers',
    formatMoney(
      finance
        ?.collection
        ?.transfers ??
      0
    )
  );


  setText(
    'closingOpeningCashFund',
    formatMoney(
      finance
        ?.cash
        ?.openingFund ??
      0
    )
  );


  setText(
    'closingCashExpenses',
    formatMoney(
      finance
        ?.cash
        ?.expenses ??
      0
    )
  );


  setText(
    'closingExpectedCash',
    formatMoney(
      finance
        ?.cash
        ?.expected ??
      0
    )
  );


  /* =====================================================
     BOLSA GENERAL
  ===================================================== */

  setText(
    'closingGeneralWallet',
    formatMoney(
      wallets
        ?.general
        ?.balance ??
      0
    )
  );


  setText(
    'closingGeneralReservePerUnit',
    formatMoney(
      wallets
        ?.general
        ?.reservePerUnit ??
      0
    )
  );


  /* =====================================================
     BOLSAS EXACTAS
  ===================================================== */

  const duragasWallet =
    wallets?.[
      GAS_IDS.DURAGAS
    ] ?? {};


  const kingGasWallet =
    wallets?.[
      GAS_IDS.KING_GAS
    ] ?? {};


  setText(
    'closingDuragasWallet',
    formatMoney(
      duragasWallet.balance ??
      0
    )
  );


  setText(
    'closingDuragasWalletEquivalent',
    `${duragasWallet.equivalentUnits ?? 0} tanque(s)`
  );


  setText(
    'closingKingGasWallet',
    formatMoney(
      kingGasWallet.balance ??
      0
    )
  );


  setText(
    'closingKingGasWalletEquivalent',
    `${kingGasWallet.equivalentUnits ?? 0} tanque(s)`
  );


  /* =====================================================
     GANANCIA
  ===================================================== */

  setText(
    'closingDuragasProfit',
    formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.DURAGAS]
        ?.availableProfit ??
      0
    )
  );


  setText(
    'closingKingGasProfit',
    formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.KING_GAS]
        ?.availableProfit ??
      0
    )
  );


  setText(
    'closingTotalProfit',
    formatMoney(
      finance
        ?.profit
        ?.available ??
      0
    )
  );


  /* =====================================================
     REPOSICIONES DURAGAS
  ===================================================== */

  const duragasReplenishment =
    finance
      ?.replenishments
      ?.[GAS_IDS.DURAGAS] ??
    {};


  setText(
    'closingDuragasReplenished',
    String(
      duragasReplenishment
        .quantity ??
      0
    )
  );


  setText(
    'closingDuragasReplenishmentPaid',
    formatMoney(
      duragasReplenishment
        .gasPaid ??
      0
    )
  );


  setText(
    'closingDuragasExtraCosts',
    formatMoney(
      duragasReplenishment
        .additionalCosts ??
      0
    )
  );


  /* =====================================================
     REPOSICIONES KING GAS
  ===================================================== */

  const kingReplenishment =
    finance
      ?.replenishments
      ?.[GAS_IDS.KING_GAS] ??
    {};


  setText(
    'closingKingGasReplenished',
    String(
      kingReplenishment
        .quantity ??
      0
    )
  );


  setText(
    'closingKingGasReplenishmentPaid',
    formatMoney(
      kingReplenishment
        .gasPaid ??
      0
    )
  );


  setText(
    'closingKingGasExtraCosts',
    formatMoney(
      kingReplenishment
        .additionalCosts ??
      0
    )
  );


  /* =====================================================
     INVENTARIO ESPERADO
  ===================================================== */

  renderExpectedClosingInventory();


  /* =====================================================
     PENDIENTES CLIENTES
  ===================================================== */

  renderClosingPending(
    data.pending
  );


  /* =====================================================
     PENDIENTES PROVEEDOR
  ===================================================== */

  renderSupplierPendingPayments();

}



/* =========================================================
   INVENTARIO ESPERADO DEL CIERRE
========================================================= */

export function renderExpectedClosingInventory(
  setInputs = false
) {

  const counts =
    getSuggestedClosingCounts();


  const mapping = [

    [
      GAS_IDS.DURAGAS,
      'Duragas',
    ],

    [
      GAS_IDS.KING_GAS,
      'KingGas',
    ],

  ];


  mapping.forEach(
    (
      [
        gasId,
        prefix,
      ]
    ) => {

      const gas =
        counts?.[gasId] ??
        {};


      const full =
        toNonNegativeInteger(
          gas.full
        );


      const empty =
        toNonNegativeInteger(
          gas.empty
        );


      const reserved =
        toNonNegativeInteger(
          gas.reserved
        );


      const routeReserved =
        toNonNegativeInteger(
          gas.routeReserved
        );


      const route =
        toNonNegativeInteger(
          gas.route
        );


      const loaned =
        toNonNegativeInteger(
          gas.loaned
        );


      /*
        FÍSICO EN BODEGA

        Sí se cuentan:
        - llenos
        - vacíos
        - reservados normales
        - apartados para vendedor
      */

      const physicalTotal =

        full +
        empty +
        reserved +
        routeReserved;


      /*
        TOTAL CONTROLADO

        Además incluye:
        - ruta
        - prestados
      */

      const controlledTotal =

        physicalTotal +
        route +
        loaned;


      /* ===================================================
         VALORES ESPERADOS
      =================================================== */

      setText(
        `closingExpected${prefix}Full`,
        String(full)
      );


      setText(
        `closingExpected${prefix}Empty`,
        String(empty)
      );


      setText(
        `closingExpected${prefix}Reserved`,
        String(reserved)
      );


      setText(
        `closingExpected${prefix}RouteReserved`,
        String(routeReserved)
      );


      setText(
        `closingExpected${prefix}Route`,
        String(route)
      );


      setText(
        `closingExpected${prefix}Loaned`,
        String(loaned)
      );


      /*
        El total principal del cierre
        es el total FÍSICO que debe encontrarse.
      */

      setText(
        `closing${prefix}ExpectedTotal`,
        String(
          physicalTotal
        )
      );


      setText(
        `closing${prefix}ExpectedControlledTotal`,
        String(
          controlledTotal
        )
      );


      /* ===================================================
         CAMPOS INFORMATIVOS
      =================================================== */

      setValue(
        `closing${prefix}Loaned`,
        loaned
      );


      const loanedInput =
        byId(
          `closing${prefix}Loaned`
        );


      if (loanedInput) {

        loanedInput.readOnly =
          true;

      }


      setValue(
        `closing${prefix}Route`,
        route
      );


      const routeInput =
        byId(
          `closing${prefix}Route`
        );


      if (routeInput) {

        routeInput.readOnly =
          true;

      }


      /* ===================================================
         CAMPOS FÍSICOS
      =================================================== */

      if (
        setInputs
      ) {

        setValue(
          `closing${prefix}Full`,
          full
        );


        setValue(
          `closing${prefix}Empty`,
          empty
        );


        setValue(
          `closing${prefix}Reserved`,
          reserved
        );


        /*
          routeReserved también debe ser
          confirmado físicamente.
        */

        setValue(
          `closing${prefix}RouteReserved`,
          routeReserved
        );

      }

    }
  );

}



/* =========================================================
   PENDIENTES DE CLIENTES EN CIERRE
========================================================= */

function renderClosingPending(
  pending
) {

  const safePending =
    pending ?? {};


  setHtml(
    'closingPendingSummary',
    `
      <div>
        <span>Cuentas abiertas</span>
        <strong>
          ${safePending.openAccounts ?? 0}
        </strong>
      </div>

      <div>
        <span>Dinero pendiente</span>
        <strong>
          ${formatMoney(
            safePending.moneyDue ??
            0
          )}
        </strong>
      </div>

      <div>
        <span>Tanques pendientes</span>
        <strong>
          ${
            safePending
              .tanksDue
              ?.total ??
            0
          }
        </strong>
      </div>

      <div>
        <span>Pagados por retirar</span>
        <strong>
          ${
            safePending
              .pickupDue
              ?.total ??
            0
          }
        </strong>
      </div>
    `
  );

}



/* =========================================================
   OBLIGACIONES PENDIENTES DEL PROVEEDOR
========================================================= */

function getSupplierPendingSnapshot() {

  const items =
    (
      getState()
        .supplierPayments ??
      []
    ).filter(
      payment =>
        payment.status ===
        'pending'
    );


  const amount =
    roundMoney(
      items.reduce(
        (
          total,
          payment
        ) =>
          total +
          (
            Number(
              payment.amount
            ) ||
            0
          ),
        0
      )
    );


  return {

    count:
      items.length,

    amount,

    items,

  };

}



function renderSupplierPendingPayments(
  snapshot = null
) {

  const data =
    snapshot ??
    getSupplierPendingSnapshot();


  const items =
    Array.isArray(
      data?.items
    )

      ? data.items

      : [];


  const count =
    data?.count ??
    items.length;


  const amount =
    roundMoney(
      data?.amount ??
      items.reduce(
        (
          total,
          payment
        ) =>
          total +
          (
            Number(
              payment.amount
            ) ||
            0
          ),
        0
      )
    );


  /* =====================================================
     RESUMEN EN CIERRE
  ===================================================== */

  setHtml(
    'closingSupplierPendingSummary',
    `
      <div>
        <span>Facturas pendientes</span>

        <strong>
          ${count}
        </strong>
      </div>

      <div>
        <span>Valor comprometido</span>

        <strong>
          ${formatMoney(
            amount
          )}
        </strong>
      </div>
    `
  );


  /* =====================================================
     MÉTRICAS GENERALES
  ===================================================== */

  setText(
    'supplierPendingCount',
    String(count)
  );


  setText(
    'supplierPendingAmount',
    formatMoney(
      amount
    )
  );


  /* =====================================================
     LISTA PARA PAGAR
  ===================================================== */

  const container =
    byId(
      'supplierPaymentsList'
    );


  if (!container) {

    return;

  }


  if (
    items.length === 0
  ) {

    container.innerHTML = `
      <div class="empty-state">
        No existen pagos pendientes al proveedor.
      </div>
    `;


    return;

  }


  container.innerHTML =
    items.map(
      payment => {

        const gasName =

          GAS_TYPES[
            payment.gasId
          ]?.name

          ??

          payment.gasId

          ??

          'Proveedor';


        return `
          <article class="pending-card money">

            <div class="pending-card-head">

              <div>

                <h3>
                  ${escapeHtml(
                    gasName
                  )}
                </h3>

                <small>
                  ${escapeHtml(
                    formatDateTime(
                      payment.createdAt
                    )
                  )}
                </small>

              </div>

              <span class="badge">
                Pendiente
              </span>

            </div>


            <div class="inventory-control-summary">

              <div>
                <span>Cantidad</span>
                <strong>
                  ${
                    toNonNegativeInteger(
                      payment.quantity
                    )
                  }
                </strong>
              </div>


              <div>
                <span>Costo unitario</span>
                <strong>
                  ${formatMoney(
                    payment.unitCost ??
                    0
                  )}
                </strong>
              </div>


              <div>
                <span>Total</span>
                <strong>
                  ${formatMoney(
                    payment.amount ??
                    0
                  )}
                </strong>
              </div>

            </div>


            <button
              type="button"
              class="btn btn-primary"
              data-supplier-payment-id="${escapeHtml(
                payment.id
              )}"
            >
              Pagar proveedor
            </button>

          </article>
        `;

      }
    ).join('');

}



/* =========================================================
   PREVISUALIZACIÓN DEL CIERRE
========================================================= */

export function renderClosingPreview(
  preview
) {

  if (!preview) {

    return;

  }


  /* =====================================================
     CAJA
  ===================================================== */

  setText(
    'closingExpectedCash',
    formatMoney(
      preview
        .cash
        .expected
    )
  );


  setText(
    'closingCashDifference',
    formatMoney(
      preview
        .cash
        .difference
    )
  );


  setText(
    'closingCashDifferenceText',
    preview
      .cash
      .text
  );


  const cashElement =
    byId(
      'closingCashDifferenceText'
    );


  if (cashElement) {

    cashElement.classList.remove(
      'text-good',
      'text-warn',
      'text-bad'
    );


    cashElement.classList.add(

      preview.cash.status ===
        'exact'

        ? 'text-good'

        : preview.cash.status ===
            'shortage'

          ? 'text-bad'

          : 'text-warn'

    );

  }


  /* =====================================================
     DIFERENCIA FÍSICA POR MARCA
  ===================================================== */

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
        ?.warehouseDifference ??
      0
    )
  );


  setText(
    'closingKingGasDifference',
    String(
      kinggas
        ?.warehouseDifference ??
      0
    )
  );


  /* =====================================================
     ESTADO
  ===================================================== */

  setOperationStatus(
    'closingStatus',

    preview.hasAnyDifference

      ? 'Hay diferencias. Puedes cerrar, pero quedarán registradas.'

      : 'Caja e inventario físico coinciden con el sistema.',

    preview.hasAnyDifference
      ? 'warn'
      : 'good'
  );


  /* =====================================================
     MODO FINANCIERO
  ===================================================== */

  const isGeneral =
    Boolean(
      preview
        .wallets
        ?.general
        ?.active
    );


  setText(
    'closingFinancialMode',
    isGeneral
      ? 'Bolsa General'
      : 'Bolsas exactas'
  );


  /* =====================================================
     RESUMEN
  ===================================================== */

  setHtml(
    'closingSummary',
    `
      <div class="closing-result-grid">

        <div>
          <span>Ventas</span>
          <strong>
            ${formatMoney(
              preview
                .finance
                .sales
                .revenue
            )}
          </strong>
        </div>


        <div>
          <span>Cobrado</span>
          <strong>
            ${formatMoney(
              preview
                .finance
                .collection
                .total
            )}
          </strong>
        </div>


        <div>
          <span>Ganancia disponible</span>
          <strong>
            ${formatMoney(
              preview
                .finance
                .profit
                .available
            )}
          </strong>
        </div>


        <div>
          <span>Caja esperada</span>
          <strong>
            ${formatMoney(
              preview
                .cash
                .expected
            )}
          </strong>
        </div>


        <div>
          <span>Caja contada</span>
          <strong>
            ${formatMoney(
              preview
                .cash
                .counted
            )}
          </strong>
        </div>


        <div>
          <span>Diferencia caja</span>
          <strong>
            ${formatMoney(
              preview
                .cash
                .difference
            )}
          </strong>
        </div>


        <div>
          <span>Físico esperado</span>
          <strong>
            ${
              preview
                .inventory
                .warehouse
                ?.expected ??
              0
            }
          </strong>
        </div>


        <div>
          <span>Físico contado</span>
          <strong>
            ${
              preview
                .inventory
                .warehouse
                ?.counted ??
              0
            }
          </strong>
        </div>


        <div>
          <span>Diferencia física</span>
          <strong>
            ${
              preview
                .inventory
                .warehouse
                ?.difference ??
              0
            }
          </strong>
        </div>


        <div>
          <span>Proveedor pendiente</span>
          <strong>
            ${formatMoney(
              preview
                .supplierPending
                ?.amount ??
              0
            )}
          </strong>
        </div>

      </div>
    `
  );


  renderClosingPending(
    preview.pending
  );


  renderSupplierPendingPayments(
    preview.supplierPending
  );

}
/* =========================================================
   HISTORIAL DE DÍAS
========================================================= */

export function renderHistoryDays() {

  const container =
    byId(
      'historyCards'
    );


  if (!container) {

    return;

  }


  const days =
    getClosedDaysHistory();


  if (
    days.length === 0
  ) {

    container.innerHTML = `
      <div class="empty-state">
        Todavía no existen días cerrados.
      </div>
    `;


    return;

  }


  container.innerHTML =
    days.map(
      day => `
        <article class="history-day-card">

          <div class="history-day-head">

            <div>
              <h4>
                ${escapeHtml(
                  day.date
                )}
              </h4>

              <small>
                ${escapeHtml(
                  formatDateTime(
                    day.closedAt
                  )
                )}
              </small>
            </div>

            <span class="badge">
              ${
                day.hasAnyDifference
                  ? 'Con diferencias'
                  : 'Exacto'
              }
            </span>

          </div>

          <div class="history-day-metrics">

            <div>
              <span>Ventas</span>
              <strong>${day.salesCount}</strong>
            </div>

            <div>
              <span>Unidades</span>
              <strong>${day.units}</strong>
            </div>

            <div>
              <span>Ingresos</span>
              <strong>
                ${formatMoney(
                  day.revenue
                )}
              </strong>
            </div>

            <div>
              <span>Cobrado</span>
              <strong>
                ${formatMoney(
                  day.collected
                )}
              </strong>
            </div>

            <div>
              <span>Ganancia</span>
              <strong>
                ${formatMoney(
                  day.profit
                )}
              </strong>
            </div>

          </div>

          <button
            type="button"
            class="btn"
            data-day-detail="${escapeHtml(
              day.dayId
            )}"
          >
            Ver detalle completo
          </button>

        </article>
      `
    ).join('');

}



/* =========================================================
   HISTORIAL DE VENTAS
========================================================= */

export function renderHistorySales(
  filters = {}
) {

  const rows =
    getSalesHistory(
      filters
    );


  const stats =
    getSalesHistoryStats(
      filters
    );


  setText(
    'historySalesCount',
    String(
      stats.count
    )
  );


  setText(
    'historySalesUnits',
    String(
      stats.units
    )
  );


  setText(
    'historySalesRevenue',
    formatMoney(
      stats.revenue
    )
  );


  setText(
    'historySalesProfit',
    formatMoney(
      stats.profit
    )
  );


  const body =
    byId(
      'historySalesBody'
    );


  if (!body) {

    return;

  }


  if (
    rows.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="8">
          No se encontraron ventas.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    rows.map(
      row => `
        <tr>

          <td>
            ${escapeHtml(
              row.dateTime
            )}
          </td>

          <td>
            ${escapeHtml(
              row.customer
            )}
          </td>

          <td>
            ${escapeHtml(
              row.products
            )}
          </td>

          <td>
            ${row.units}
          </td>

          <td>
            ${formatMoney(
              row.price
            )}
          </td>

          <td>
            ${formatMoney(
              row.revenue
            )}
          </td>

          <td>
            ${formatMoney(
              row.profit
            )}
          </td>

          <td>
            ${escapeHtml(
              row.paymentMethod
            )}
          </td>

        </tr>
      `
    ).join('');

}



/* =========================================================
   HISTORIAL DE MOVIMIENTOS
========================================================= */

export function renderHistoryMovements(
  filters = {}
) {

  const rows =
    getMovementsHistory(
      filters
    );


  const body =
    byId(
      'historyMovementsBody'
    );


  if (!body) {

    return;

  }


  if (
    rows.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="6">
          No existen movimientos con esos filtros.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    rows.map(
      row => `
        <tr>

          <td>
            ${escapeHtml(
              row.dateTime
            )}
          </td>

          <td>
            ${escapeHtml(
              MOVEMENT_LABELS[
                row.type
              ] ??
              row.type
            )}
          </td>

          <td>
            ${escapeHtml(
              row.gasId
                ? GAS_TYPES[
                    row.gasId
                  ]?.name ??
                  row.gasId
                : '—'
            )}
          </td>

          <td>
            ${escapeHtml(
              row.reference ??
              ''
            )}
          </td>

          <td>
            ${escapeHtml(
              row.detail ??
              ''
            )}
          </td>

          <td>
            ${
              row.value
                ? formatMoney(
                    row.value
                  )
                : '—'
            }
          </td>

        </tr>
      `
    ).join('');

}



/* =========================================================
   HISTORIAL REPOSICIONES
========================================================= */

export function renderHistoryReplenishments(
  filters = {}
) {

  const rows =
    getReplenishmentsHistory(
      filters
    );


  const stats =
    getReplenishmentsHistoryStats(
      filters
    );


  setText(
    'historyReplenishmentDuragas',
    String(
      stats.duragas
    )
  );


  setText(
    'historyReplenishmentKinggas',
    String(
      stats.kinggas
    )
  );


  setText(
    'historyReplenishmentPaid',
    formatMoney(
      stats.totalPaid
    )
  );


  setText(
    'historyReplenishmentContributions',
    formatMoney(
      stats.extraContributions
    )
  );


  const body =
    byId(
      'historyReplenishmentsBody'
    );


  if (!body) {

    return;

  }


  if (
    rows.length === 0
  ) {

    body.innerHTML = `
      <tr>
        <td colspan="8">
          No hay reposiciones.
        </td>
      </tr>
    `;


    return;

  }


  body.innerHTML =
    rows.map(
      row => `
        <tr>

          <td>
            ${escapeHtml(
              row.dateTime
            )}
          </td>

          <td>
            ${escapeHtml(
              row.gasName
            )}
          </td>

          <td>
            ${row.quantity}
          </td>

          <td>
            ${row.emptyOut}
          </td>

          <td>
            ${formatMoney(
              row.gasCost
            )}
          </td>

          <td>
            ${formatMoney(
              row.additionalCosts
            )}
          </td>

          <td>
            ${formatMoney(
              row.extraContribution
            )}
          </td>

          <td>
            ${formatMoney(
              row.walletAfter
            )}
          </td>

        </tr>
      `
    ).join('');

}



/* =========================================================
   RENDER GENERAL DEL HISTORIAL
========================================================= */

export function renderHistory() {

  renderHistoryDays();

  renderHistorySales(
    readSalesHistoryFilters()
  );

  renderHistoryMovements(
    readMovementHistoryFilters()
  );

  renderHistoryReplenishments(
    readReplenishmentHistoryFilters()
  );

}



/* =========================================================
   LEER FILTROS DE VENTAS
========================================================= */

export function readSalesHistoryFilters() {

  return {

    from:
      getValue(
        'historySalesFrom'
      ),

    to:
      getValue(
        'historySalesTo'
      ),

    gasId:
      getValue(
        'historySalesGasType'
      ),

    price:
      getValue(
        'historySalesPrice'
      ),

    paymentMethod:
      getValue(
        'historySalesPaymentMethod'
      ),

    customer:
      getValue(
        'historySalesCustomer'
      ),

  };

}



/* =========================================================
   FILTROS DE MOVIMIENTOS
========================================================= */

export function readMovementHistoryFilters() {

  return {

    from:
      getValue(
        'historyMovementsFrom'
      ),

    to:
      getValue(
        'historyMovementsTo'
      ),

    type:
      getValue(
        'historyMovementsType'
      ),

  };

}



/* =========================================================
   FILTROS DE REPOSICIÓN
========================================================= */

export function readReplenishmentHistoryFilters() {

  return {

    from:
      getValue(
        'historyReplenishmentsFrom'
      ),

    to:
      getValue(
        'historyReplenishmentsTo'
      ),

    gasId:
      getValue(
        'historyReplenishmentsGasType'
      ),

  };

}



/* =========================================================
   DETALLE DE DÍA
========================================================= */
export function openDayDetail(
  dayId
) {

  const detail =
    getDayHistoryDetail(
      dayId
    );


  if (!detail) {

    showToast(
      'No se encontró el día seleccionado.',
      'bad'
    );

    return;

  }


  const closing =
    detail.closing;


  const wallets =
    detail.wallets;


  const isGeneral =

    wallets
      ?.financialMode ===
      'general'

    ||

    wallets
      ?.general
      ?.active ===
      true

    ||

    closing
      ?.financialMode ===
      'general';


  /* =====================================================
     TÍTULO
  ===================================================== */

  setText(
    'dayDetailTitle',
    `Detalle · ${detail.day.date}`
  );


  /* =====================================================
     MÉTRICAS
  ===================================================== */

  setHtml(
    'dayDetailMetrics',
    `
      ${metricCard(
        'Ventas',
        String(
          detail.metrics.sales
        )
      )}

      ${metricCard(
        'Unidades',
        String(
          detail.metrics.units
        )
      )}

      ${metricCard(
        'Ingresos',
        formatMoney(
          detail.metrics.revenue
        )
      )}

      ${metricCard(
        'Cobrado',
        formatMoney(
          detail.metrics.collected
        )
      )}

      ${metricCard(
        'Ganancia',
        formatMoney(
          detail.metrics.profit
        )
      )}

      ${metricCard(
        'Modo financiero',
        isGeneral
          ? 'Bolsa General'
          : 'Bolsas exactas'
      )}
    `
  );


  /* =====================================================
     BOLSAS DEL CIERRE
  ===================================================== */

  if (!wallets) {

    setHtml(
      'dayDetailWallets',
      '<p>Sin información de bolsas.</p>'
    );

  }
  else if (
    isGeneral
  ) {

    const generalBalance =

      wallets
        ?.general
        ?.balance

      ??

      closing
        ?.finance
        ?.wallets
        ?.general

      ??

      0;


    setHtml(
      'dayDetailWallets',
      `
        <div class="reserve-wallet-grid">

          <div class="reserve-wallet">

            <span>
              💰 Bolsa General
            </span>

            <strong class="wallet-money">
              ${formatMoney(
                generalBalance
              )}
            </strong>

            <small>
              Fondo común utilizado por
              Duragas y King Gas.
            </small>

          </div>

        </div>
      `
    );

  }
  else {

    /*
      COMPATIBILIDAD HISTÓRICA

      Registros nuevos:
        wallet.balance

      Registros antiguos:
        wallet directamente numérico
    */

    const duragas =
      wallets?.[
        GAS_IDS.DURAGAS
      ];


    const kinggas =
      wallets?.[
        GAS_IDS.KING_GAS
      ];


    setHtml(
      'dayDetailWallets',
      `
        <div class="reserve-wallet-grid">

          <div class="reserve-wallet duragas">

            <span>
              🟡 Bolsa Duragas
            </span>

            <strong class="wallet-money">
              ${formatMoney(
                duragas?.balance ??
                duragas ??
                0
              )}
            </strong>

          </div>


          <div class="reserve-wallet kinggas">

            <span>
              🌸 Bolsa King Gas
            </span>

            <strong class="wallet-money">
              ${formatMoney(
                kinggas?.balance ??
                kinggas ??
                0
              )}
            </strong>

          </div>

        </div>
      `
    );

  }


  /* =====================================================
     VENTAS
  ===================================================== */

  const salesBody =
    byId(
      'dayDetailSalesBody'
    );


  if (salesBody) {

    salesBody.innerHTML =

      detail.sales.length === 0

        ? `
          <tr>
            <td colspan="6">
              Sin ventas.
            </td>
          </tr>
        `

        : detail.sales.map(
            sale => `
              <tr>

                <td>
                  ${escapeHtml(
                    formatShortTime(
                      sale.createdAt
                    )
                  )}
                </td>


                <td>
                  ${escapeHtml(
                    sale.customer ||
                    'Mostrador'
                  )}
                </td>


                <td>
                  ${escapeHtml(
                    sale.products
                  )}
                </td>


                <td>
                  ${formatMoney(
                    sale.unitPrice ??
                    sale.price
                  )}
                </td>


                <td>
                  ${formatMoney(
                    sale.total
                  )}
                </td>


                <td>
                  ${escapeHtml(
                    sale.paymentMethod
                  )}
                </td>

              </tr>
            `
          ).join('');

  }


  /* =====================================================
     REPOSICIONES
  ===================================================== */

  const replenishmentsBody =
    byId(
      'dayDetailReplenishmentsBody'
    );


  if (replenishmentsBody) {

    replenishmentsBody.innerHTML =

      detail.replenishments.length === 0

        ? `
          <tr>
            <td colspan="6">
              Sin reposiciones.
            </td>
          </tr>
        `

        : detail.replenishments.map(
            item => {

              const supplier =
                item.supplierPayment ??
                {};


              const paidNow =
                roundMoney(
                  supplier.paidNow ??
                  item.walletPayment ??
                  item.gasCost ??
                  0
                );


              const pending =
                roundMoney(
                  supplier.pending ??
                  0
                );


              return `
                <tr>

                  <td>
                    ${escapeHtml(
                      formatShortTime(
                        item.createdAt
                      )
                    )}
                  </td>


                  <td>
                    ${escapeHtml(
                      GAS_TYPES[
                        item.gasId
                      ]?.name ??
                      item.gasId
                    )}
                  </td>


                  <td>
                    ${item.quantity}
                  </td>


                  <td>
                    ${item.emptyOut}
                  </td>


                  <td>
                    ${formatMoney(
                      item.gasCost
                    )}
                  </td>


                  <td>

                    <strong>
                      ${formatMoney(
                        item.totalPaid
                      )}
                    </strong>

                    <small>
                      Pagado proveedor:
                      ${formatMoney(
                        paidNow
                      )}

                      ${
                        pending > 0
                          ? ` · pendiente ${formatMoney(
                              pending
                            )}`
                          : ''
                      }
                    </small>

                  </td>

                </tr>
              `;

            }
          ).join('');

  }


  /* =====================================================
     MOVIMIENTOS
  ===================================================== */

  const movementsBody =
    byId(
      'dayDetailMovementsBody'
    );


  if (movementsBody) {

    movementsBody.innerHTML =

      detail.movements.length === 0

        ? `
          <tr>
            <td colspan="5">
              Sin movimientos.
            </td>
          </tr>
        `

        : detail.movements.map(
            movement => `
              <tr>

                <td>
                  ${escapeHtml(
                    formatShortTime(
                      movement.createdAt
                    )
                  )}
                </td>


                <td>
                  ${escapeHtml(
                    MOVEMENT_LABELS[
                      movement.type
                    ] ??
                    movement.type
                  )}
                </td>


                <td>
                  ${escapeHtml(
                    movement.reference ??
                    ''
                  )}
                </td>


                <td>
                  ${escapeHtml(
                    movement.detail ??
                    ''
                  )}
                </td>


                <td>
                  ${
                    movement.value
                      ? formatMoney(
                          movement.value
                        )
                      : '—'
                  }
                </td>

              </tr>
            `
          ).join('');

  }


  /* =====================================================
     CIERRE
  ===================================================== */

  if (!closing) {

    setHtml(
      'dayDetailClosing',
      'No existe cierre guardado.'
    );

  }
  else {

    /*
      NUEVOS CIERRES:
      warehouse = físico en bodega.

      CIERRES ANTIGUOS:
      puede existir solamente controlled.

      Usamos controlled únicamente como
      respaldo histórico.
    */

    const physicalDifference =

      closing
        .inventory
        ?.warehouse
        ?.difference

      ??

      closing
        .inventory
        ?.controlled
        ?.difference

      ??

      0;


    const physicalExpected =

      closing
        .inventory
        ?.warehouse
        ?.expected

      ??

      0;


    const physicalCounted =

      closing
        .inventory
        ?.warehouse
        ?.counted

      ??

      0;


    const supplierPendingAmount =
      roundMoney(
        closing
          .supplierPending
          ?.amount ??
        0
      );


    const supplierPendingCount =
      toNonNegativeInteger(
        closing
          .supplierPending
          ?.count ??
        closing
          .supplierPending
          ?.items
          ?.length ??
        0
      );


    setHtml(
      'dayDetailClosing',
      `
        <div class="closing-result-grid">

          <div>
            <span>Modo financiero</span>
            <strong>
              ${
                isGeneral
                  ? 'Bolsa General'
                  : 'Bolsas exactas'
              }
            </strong>
          </div>


          <div>
            <span>Caja esperada</span>
            <strong>
              ${formatMoney(
                closing
                  .cash
                  ?.expected ??
                0
              )}
            </strong>
          </div>


          <div>
            <span>Caja contada</span>
            <strong>
              ${formatMoney(
                closing
                  .cash
                  ?.counted ??
                0
              )}
            </strong>
          </div>


          <div>
            <span>Diferencia caja</span>
            <strong>
              ${formatMoney(
                closing
                  .cash
                  ?.difference ??
                0
              )}
            </strong>
          </div>


          <div>
            <span>Físico esperado</span>
            <strong>
              ${physicalExpected}
            </strong>
          </div>


          <div>
            <span>Físico contado</span>
            <strong>
              ${physicalCounted}
            </strong>
          </div>


          <div>
            <span>Diferencia física</span>
            <strong>
              ${physicalDifference}
            </strong>
          </div>


          <div>
            <span>Facturas proveedor</span>
            <strong>
              ${supplierPendingCount}
            </strong>
          </div>


          <div>
            <span>Proveedor pendiente</span>
            <strong>
              ${formatMoney(
                supplierPendingAmount
              )}
            </strong>
          </div>

        </div>


        ${
          closing.note

            ? `
              <p>
                <strong>Nota:</strong>

                ${escapeHtml(
                  closing.note
                )}
              </p>
            `

            : ''
        }
      `
    );

  }


  /* =====================================================
     ABRIR DIÁLOGO
  ===================================================== */

  const dialog =
    byId(
      'dayDetailDialog'
    );


  if (
    dialog &&
    typeof dialog.showModal ===
      'function'
  ) {

    dialog.showModal();

  }

}
/* =========================================================
   CERRAR DETALLE DE DÍA
========================================================= */

export function closeDayDetail() {

  const dialog =
    byId(
      'dayDetailDialog'
    );


  if (
    dialog?.open
  ) {

    dialog.close();

  }

}



/* =========================================================
   SUGERENCIAS DE CLIENTES
========================================================= */

export function renderCustomerSuggestions() {

  const datalist =
    byId(
      'customerSuggestions'
    );


  if (!datalist) {

    return;

  }


  const customers = [

    ...new Set(

      getState()
        .sales
        .map(
          sale =>
            normalizeText(
              sale.customer
            )
        )
        .filter(Boolean)

    ),

  ].sort(
    (
      first,
      second
    ) =>
      first.localeCompare(
        second,
        'es'
      )
  );


  datalist.innerHTML =
    customers.map(
      customer => `
        <option
          value="${escapeHtml(customer)}"
        ></option>
      `
    ).join('');

}



/* =========================================================
   CONFIGURACIÓN
========================================================= */

export function renderSettings() {

  /*
    Los valores principales ya están escritos
    en el HTML.

    Aquí solamente podemos actualizar elementos
    dinámicos si existen.
  */

  const duragasCost =
    byId(
      'settingsDuragasCost'
    );


  if (duragasCost) {

    duragasCost.textContent =
      formatMoney(
        getReplacementCost(
          GAS_IDS.DURAGAS
        )
      );

  }


  const kingGasCost =
    byId(
      'settingsKingGasCost'
    );


  if (kingGasCost) {

    kingGasCost.textContent =
      formatMoney(
        getReplacementCost(
          GAS_IDS.KING_GAS
        )
      );

  }

}



/* =========================================================
   RENDER GENERAL
========================================================= */

export function renderAll() {

  renderHeader();

  renderDashboard();

  renderOpening();

  renderSaleAvailability();

  renderSalesTable();

  renderReplenishmentWallets();

  renderReplenishmentsTable();

  renderAccounts();

  renderInventory();

  renderAdjustmentCurrent();

  renderAdjustmentsHistory();

  renderClosing();

  renderHistory();

  renderCustomerSuggestions();

  renderSettings();

}
