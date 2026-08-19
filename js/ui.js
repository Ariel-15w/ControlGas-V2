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
    getWalletSummary();


  const accounts =
    getAccountsSummary();


  const finance =
    day
      ? getDayFinanceSummary(
          day.id
        )
      : null;


  const metrics = [];


  /*
    =====================================================
    VENTAS REGISTRADAS HOY
    =====================================================
  */

  metrics.push(
    metricCard(
      'Ventas hoy',
      String(
        finance?.sales?.count ??
        0
      )
    )
  );


  /*
    =====================================================
    CILINDROS VENDIDOS HOY
    =====================================================
  */

  metrics.push(
    metricCard(
      'Cilindros vendidos',
      String(
        finance?.sales?.units ??
        0
      )
    )
  );


  /*
    =====================================================
    CAJA ACTUAL ESTIMADA

    Fondo inicial
    + efectivo cobrado
    - dinero enviado a bolsas
    - gastos
    =====================================================
  */

  metrics.push(
    metricCard(
      'Caja actual',
      formatMoney(
        finance?.cash?.expected ??
        0
      ),
      `Fondo ${formatMoney(
        finance?.cash?.openingFund ??
        0
      )} + cobrado ${formatMoney(
        finance?.cash?.collected ??
        0
      )} - bolsas ${formatMoney(
        finance?.cash?.transferredToWallets ??
        0
      )} - gastos ${formatMoney(
        finance?.cash?.expenses ??
        0
      )}`
    )
  );


  /*
    =====================================================
    VALOR TOTAL DE VENTAS
    =====================================================
  */

  metrics.push(
    metricCard(
      'Ventas $',
      formatMoney(
        finance?.sales?.revenue ??
        0
      )
    )
  );


  /*
    =====================================================
    DINERO REALMENTE COBRADO
    =====================================================
  */

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


  /*
    =====================================================
    DINERO PENDIENTE
    =====================================================
  */

  metrics.push(
    metricCard(
      'Pendiente dinero',
      formatMoney(
        accounts.moneyDue
      )
    )
  );


  /*
    =====================================================
    GANANCIA DISPONIBLE
    =====================================================
  */

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



  /* =======================================================
     BOLSAS
  ======================================================= */

  setText(
    'dashboardDuragasWallet',
    formatMoney(
      wallets[
        GAS_IDS.DURAGAS
      ].balance
    )
  );


  setText(
    'dashboardDuragasEquivalent',
    `${wallets[
      GAS_IDS.DURAGAS
    ].equivalentUnits} × ${formatMoney(
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )}`
  );


  setText(
    'dashboardDuragasWalletFormula',
    `${formatMoney(
      wallets[
        GAS_IDS.DURAGAS
      ].balance
    )} / ${formatMoney(
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )}`
  );


  setText(
    'dashboardKingGasWallet',
    formatMoney(
      wallets[
        GAS_IDS.KING_GAS
      ].balance
    )
  );


  setText(
    'dashboardKingGasEquivalent',
    `${wallets[
      GAS_IDS.KING_GAS
    ].equivalentUnits} × ${formatMoney(
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )}`
  );


  setText(
    'dashboardKingGasWalletFormula',
    `${formatMoney(
      wallets[
        GAS_IDS.KING_GAS
      ].balance
    )} / ${formatMoney(
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )}`
  );



  /* =======================================================
     GANANCIAS
  ======================================================= */

  setText(
    'dashboardDuragasProfit',
    formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.DURAGAS]
        ?.availableProfit ??
      0
    )
  );


  setText(
    'dashboardKingGasProfit',
    formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.KING_GAS]
        ?.availableProfit ??
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
      finance
        ?.byGas
        ?.[GAS_IDS.DURAGAS]
        ?.revenue ??
      0
    )} − reposición ${formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.DURAGAS]
        ?.reserveRequired ??
      0
    )}`
  );


  setText(
    'dashboardDuragasReserveFormula',
    `Reposición: ${
      finance
        ?.byGas
        ?.[GAS_IDS.DURAGAS]
        ?.units ??
      0
    } × ${formatMoney(
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )} = ${formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.DURAGAS]
        ?.reserveRequired ??
      0
    )}`
  );


  setText(
    'dashboardKingGasProfitFormula',
    `Ventas ${formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.KING_GAS]
        ?.revenue ??
      0
    )} − reposición ${formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.KING_GAS]
        ?.reserveRequired ??
      0
    )}`
  );


  setText(
    'dashboardKingGasReserveFormula',
    `Reposición: ${
      finance
        ?.byGas
        ?.[GAS_IDS.KING_GAS]
        ?.units ??
      0
    } × ${formatMoney(
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )} = ${formatMoney(
      finance
        ?.byGas
        ?.[GAS_IDS.KING_GAS]
        ?.reserveRequired ??
      0
    )}`
  );


  setText(
    'dashboardCollectedProfitFormula',
    `Cobrado después de separar reposición: ${formatMoney(
      finance?.collection?.profit ??
      0
    )}`
  );



  /* =======================================================
     INVENTARIO ACTUAL
  ======================================================= */

  setHtml(
    'inventorySnapshot',
    `
      <div class="inventory-main-grid">

        ${dashboardGasInventoryCard(
          GAS_IDS.DURAGAS,
          inventory.duragas,
          finance
            ?.byGas
            ?.[GAS_IDS.DURAGAS]
            ?.units ??
          0
        )}

        ${dashboardGasInventoryCard(
          GAS_IDS.KING_GAS,
          inventory.kinggas,
          finance
            ?.byGas
            ?.[GAS_IDS.KING_GAS]
            ?.units ??
          0
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



  /* =======================================================
     PENDIENTES
  ======================================================= */

  setHtml(
    'pendingSnapshot',
    `
      <div class="inventory-control-summary">

        <div>
          <span>Cuentas abiertas</span>
          <strong>
            ${accounts.openAccounts}
          </strong>
        </div>

        <div>
          <span>Dinero pendiente</span>
          <strong>
            ${formatMoney(
              accounts.moneyDue
            )}
          </strong>
        </div>

        <div>
          <span>Tanques pendientes</span>
          <strong>
            ${accounts.tanksDue.total}
          </strong>
        </div>

      </div>
    `
  );


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
            Llenos ahora
          </span>

          <strong>
            ${inventory.full}
          </strong>

        </div>


        <div class="inventory-number empty">

          <span>
            Vacíos ahora
          </span>

          <strong>
            ${inventory.empty}
          </strong>

        </div>


        <div class="inventory-number reserved">

          <span>
            Reservados
          </span>

          <strong>
            ${inventory.reserved}
          </strong>

        </div>


        <div class="inventory-number loaned">

          <span>
            Prestados
          </span>

          <strong>
            ${inventory.loaned}
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

  const wallets =
    getWalletSummary();


  setText(
    'openingDuragasWallet',
    formatMoney(
      wallets[
        GAS_IDS.DURAGAS
      ].balance
    )
  );


  setText(
    'openingDuragasWalletEquivalent',
    `${wallets[
      GAS_IDS.DURAGAS
    ].equivalentUnits} × ${formatMoney(
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )}`
  );


  setText(
    'openingKingGasWallet',
    formatMoney(
      wallets[
        GAS_IDS.KING_GAS
      ].balance
    )
  );


  setText(
    'openingKingGasWalletEquivalent',
    `${wallets[
      GAS_IDS.KING_GAS
    ].equivalentUnits} × ${formatMoney(
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )}`
  );


  const day =
    getActiveDay();


  setOperationStatus(
    'openingWarning',

    day
      ? 'Ya existe una jornada abierta.'
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
    String(duragas)
  );


  setText(
    'kinggasOpeningTotal',
    String(kinggas)
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

  const wallets =
    getWalletSummary();


  setText(
    'replenishmentDuragasWallet',
    formatMoney(
      wallets[
        GAS_IDS.DURAGAS
      ].balance
    )
  );


  setText(
    'replenishmentDuragasEquivalent',
    `${wallets[
      GAS_IDS.DURAGAS
    ].equivalentUnits} × ${formatMoney(
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )}`
  );


  setText(
    'replenishmentDuragasWalletFormula',
    `${formatMoney(
      wallets[GAS_IDS.DURAGAS].balance
    )} / ${formatMoney(
      getReplacementCost(
        GAS_IDS.DURAGAS
      )
    )}`
  );


  setText(
    'replenishmentKingGasWallet',
    formatMoney(
      wallets[
        GAS_IDS.KING_GAS
      ].balance
    )
  );


  setText(
    'replenishmentKingGasEquivalent',
    `${wallets[
      GAS_IDS.KING_GAS
    ].equivalentUnits} × ${formatMoney(
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
    )}`
  );


  setText(
    'replenishmentKingGasWalletFormula',
    `${formatMoney(
      wallets[GAS_IDS.KING_GAS].balance
    )} / ${formatMoney(
      getReplacementCost(
        GAS_IDS.KING_GAS
      )
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


  const contributionSection =
    byId(
      'replenishmentExtraContributionSection'
    );


  if (contributionSection) {

    contributionSection.hidden =
      preview.extraNeededBeforeContribution <= 0;

  }


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

  /* =======================================================
     INVENTARIO ACTUAL DE LA MARCA
  ======================================================= */

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
    `Pedido: ${preview.quantity} × $1,15 = ${formatMoney(
      preview.quantity * 1.15
    )}`
  );


  setText(
    'replenishmentArrivalCostFormula',
    `Llegada carro: ${preview.quantity} × $0,55 = ${formatMoney(
      preview.quantity * 0.55
    )}`
  );


  setText(
    'replenishmentTotalCostFormula',
    `Total: ${preview.quantity} × ${formatMoney(
      preview.unitCost
    )} = ${formatMoney(
      preview.gasCost
    )}`
  );


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
      )} para pagar el gas.`
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
      'Reposición lista para registrar.',
      'good'
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


  setText(
    'inventoryDuragasTotal',
    String(
      inventory
        .duragas
        .controlled
    )
  );


  setText(
    'inventoryDuragasFull',
    String(
      inventory.duragas.full
    )
  );


  setText(
    'inventoryDuragasEmpty',
    String(
      inventory.duragas.empty
    )
  );


  setText(
    'inventoryDuragasReserved',
    String(
      inventory
        .duragas
        .reserved
    )
  );


  setText(
    'inventoryDuragasLoaned',
    String(
      inventory
        .duragas
        .loaned
    )
  );


  setText(
    'inventoryDuragasControlled',
    String(
      inventory
        .duragas
        .controlled
    )
  );


  setText(
    'inventoryKingGasTotal',
    String(
      inventory
        .kinggas
        .controlled
    )
  );


  setText(
    'inventoryKingGasFull',
    String(
      inventory.kinggas.full
    )
  );


  setText(
    'inventoryKingGasEmpty',
    String(
      inventory.kinggas.empty
    )
  );


  setText(
    'inventoryKingGasReserved',
    String(
      inventory
        .kinggas
        .reserved
    )
  );


  setText(
    'inventoryKingGasLoaned',
    String(
      inventory
        .kinggas
        .loaned
    )
  );


  setText(
    'inventoryKingGasControlled',
    String(
      inventory
        .kinggas
        .controlled
    )
  );


  setText(
    'inventoryPhysicalTotal',
    String(
      inventory.totals.physical
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


  const allowedTypes =
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


  const movements =
    sortNewestFirst(
      getState()
        .movements
        .filter(
          item =>
            allowedTypes.has(
              item.type
            )
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
                ? GAS_TYPES[
                    movement.gasId
                  ]?.name ??
                  movement.gasId
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
          <strong>${summary.openAccounts}</strong>
        </div>

        <div>
          <span>Dinero por cobrar</span>
          <strong>${formatMoney(
            summary.moneyDue
          )}</strong>
        </div>

        <div>
          <span>Tanques por recibir</span>
          <strong>${summary.tanksDue.total}</strong>
        </div>

      </div>
    `
  );


  const container =
    byId('accountsCards');


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


    return;

  }


  const finance =
    data.finance;


  setText(
    'closingSalesRevenue',
    formatMoney(
      finance.sales.revenue
    )
  );


  setText(
    'closingCollected',
    formatMoney(
      finance.collection.total
    )
  );


  setText(
    'closingCashGenerated',
    formatMoney(
      finance.collection.cash
    )
  );


  setText(
    'closingTransfers',
    formatMoney(
      finance.collection.transfers
    )
  );


  setText(
    'closingOpeningCashFund',
    formatMoney(
      finance.cash.openingFund
    )
  );


  setText(
    'closingCashExpenses',
    formatMoney(
      finance.cash.expenses
    )
  );


  const wallets =
    data.wallets;


  setText(
    'closingDuragasWallet',
    formatMoney(
      wallets[
        GAS_IDS.DURAGAS
      ].balance
    )
  );


  setText(
    'closingDuragasWalletEquivalent',
    `${wallets[
      GAS_IDS.DURAGAS
    ].equivalentUnits} tanque(s)`
  );


  setText(
    'closingKingGasWallet',
    formatMoney(
      wallets[
        GAS_IDS.KING_GAS
      ].balance
    )
  );


  setText(
    'closingKingGasWalletEquivalent',
    `${wallets[
      GAS_IDS.KING_GAS
    ].equivalentUnits} tanque(s)`
  );


  setText(
    'closingDuragasProfit',
    formatMoney(
      finance
        .byGas[
          GAS_IDS.DURAGAS
        ].availableProfit
    )
  );


  setText(
    'closingKingGasProfit',
    formatMoney(
      finance
        .byGas[
          GAS_IDS.KING_GAS
        ].availableProfit
    )
  );


  setText(
    'closingTotalProfit',
    formatMoney(
      finance.profit.available
    )
  );


  setText(
    'closingDuragasReplenished',
    String(
      finance
        .replenishments[
          GAS_IDS.DURAGAS
        ].quantity
    )
  );


  setText(
    'closingDuragasReplenishmentPaid',
    formatMoney(
      finance
        .replenishments[
          GAS_IDS.DURAGAS
        ].gasPaid
    )
  );


  setText(
    'closingDuragasExtraCosts',
    formatMoney(
      finance
        .replenishments[
          GAS_IDS.DURAGAS
        ].additionalCosts
    )
  );


  setText(
    'closingKingGasReplenished',
    String(
      finance
        .replenishments[
          GAS_IDS.KING_GAS
        ].quantity
    )
  );


  setText(
    'closingKingGasReplenishmentPaid',
    formatMoney(
      finance
        .replenishments[
          GAS_IDS.KING_GAS
        ].gasPaid
    )
  );


  setText(
    'closingKingGasExtraCosts',
    formatMoney(
      finance
        .replenishments[
          GAS_IDS.KING_GAS
        ].additionalCosts
    )
  );


  setText(
    'closingExpectedCash',
    formatMoney(
      finance.cash.expected
    )
  );


  renderExpectedClosingInventory();

  renderClosingPending(
    data.pending
  );

}



/* =========================================================
   RELLENAR INVENTARIO ESPERADO EN CIERRE
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
        counts[gasId];


      setText(
        `closingExpected${prefix}Full`,
        String(gas.full)
      );


      setText(
        `closingExpected${prefix}Empty`,
        String(gas.empty)
      );


      setText(
        `closingExpected${prefix}Reserved`,
        String(gas.reserved)
      );


      setText(
        `closingExpected${prefix}Loaned`,
        String(gas.loaned)
      );


      const total =

        gas.full +
        gas.empty +
        gas.reserved +
        gas.loaned;


      setText(
        `closing${prefix}ExpectedTotal`,
        String(total)
      );


      /*
        Prestados son solo informativos.
        Siempre mostramos el valor lógico.
      */

      setValue(
        `closing${prefix}Loaned`,
        gas.loaned
      );


      const loanedInput =
        byId(
          `closing${prefix}Loaned`
        );


      if (
        loanedInput
      ) {

        loanedInput.readOnly =
          true;

      }


      /*
        Llenos, vacíos y reservados sí son
        los que la persona confirma físicamente.
      */

      if (setInputs) {

        setValue(
          `closing${prefix}Full`,
          gas.full
        );


        setValue(
          `closing${prefix}Empty`,
          gas.empty
        );


        setValue(
          `closing${prefix}Reserved`,
          gas.reserved
        );

      }

    }
  );

}


/* =========================================================
   PENDIENTES EN CIERRE
========================================================= */

function renderClosingPending(
  pending
) {

  setHtml(
    'closingPendingSummary',
    `
      <div>
        <span>Cuentas abiertas</span>
        <strong>${pending.openAccounts}</strong>
      </div>

      <div>
        <span>Dinero pendiente</span>
        <strong>${formatMoney(
          pending.moneyDue
        )}</strong>
      </div>

      <div>
        <span>Tanques pendientes</span>
        <strong>${pending.tanksDue.total}</strong>
      </div>

      <div>
        <span>Pagados por retirar</span>
        <strong>${pending.pickupDue.total}</strong>
      </div>
    `
  );

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


  setText(
    'closingExpectedCash',
    formatMoney(
      preview.cash.expected
    )
  );


  setText(
    'closingCashDifference',
    formatMoney(
      preview.cash.difference
    )
  );


  setText(
    'closingCashDifferenceText',
    preview.cash.text
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
      duragas.controlledDifference
    )
  );


  setText(
    'closingKingGasDifference',
    String(
      kinggas.controlledDifference
    )
  );


  setOperationStatus(
    'closingStatus',

    preview.hasAnyDifference
      ? 'Hay diferencias. Puedes cerrar, pero quedarán registradas.'
      : 'Caja e inventario coinciden con el sistema.',

    preview.hasAnyDifference
      ? 'warn'
      : 'good'
  );



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
              preview.cash.expected
            )}
          </strong>
        </div>

        <div>
          <span>Caja contada</span>
          <strong>
            ${formatMoney(
              preview.cash.counted
            )}
          </strong>
        </div>

        <div>
          <span>Diferencia</span>
          <strong>
            ${formatMoney(
              preview.cash.difference
            )}
          </strong>
        </div>

      </div>
    `
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


  setText(
    'dayDetailTitle',
    `Detalle · ${detail.day.date}`
  );


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
    `
  );



  /* =======================================================
     BOLSAS DEL CIERRE
  ======================================================= */

  if (
    detail.wallets
  ) {

    const duragas =
      detail.wallets[
        GAS_IDS.DURAGAS
      ];


    const kinggas =
      detail.wallets[
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
  else {

    setHtml(
      'dayDetailWallets',
      '<p>Sin información de bolsas.</p>'
    );

  }



  /* =======================================================
     VENTAS
  ======================================================= */

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



  /* =======================================================
     REPOSICIONES
  ======================================================= */

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
            item => `
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
                  ${formatMoney(
                    item.totalPaid
                  )}
                </td>

              </tr>
            `
          ).join('');

  }



  /* =======================================================
     MOVIMIENTOS
  ======================================================= */

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



  /* =======================================================
     CIERRE
  ======================================================= */

  const closing =
    detail.closing;


  setHtml(
    'dayDetailClosing',

    !closing

      ? 'No existe cierre guardado.'

      : `
        <div class="closing-result-grid">

          <div>
            <span>Caja esperada</span>
            <strong>
              ${formatMoney(
                closing.cash?.expected ??
                0
              )}
            </strong>
          </div>

          <div>
            <span>Caja contada</span>
            <strong>
              ${formatMoney(
                closing.cash?.counted ??
                0
              )}
            </strong>
          </div>

          <div>
            <span>Diferencia caja</span>
            <strong>
              ${formatMoney(
                closing.cash?.difference ??
                0
              )}
            </strong>
          </div>

          <div>
            <span>Diferencia inventario</span>
            <strong>
              ${closing
                .inventory
                ?.controlled
                ?.difference ?? 0}
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
