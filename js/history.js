/* =========================================================
   CONTROLGAS
   HISTORIAL Y CONSULTAS

   Responsabilidades:
   - Historial de días cerrados
   - Historial de ventas
   - Filtros por:
       fecha
       cliente
       marca
       precio
       método de pago
   - Estadísticas de ventas filtradas
   - Historial general de movimientos
   - Historial de reposiciones
   - Detalle completo de una jornada
   - Preparar información para análisis futuros

   IMPORTANTE:

   Este archivo NO modifica inventario,
   NO registra ventas y NO mueve dinero.

   Solamente consulta y organiza información existente.
========================================================= */

import {
  GAS_IDS,
  GAS_ID_LIST,
  GAS_TYPES,
} from './config.js';


import {
  getState,
  getDayById,
  getClosingById,
} from './state.js';


import {
  getClosedDays,
  getClosedDayDetail,
} from './closing.js';


import {
  getSaleLines,
} from './state.js';


import {
  cloneData,
  formatDate,
  formatDateTime,
  isDateWithinRange,
  normalizeSearchText,
  roundMoney,
  sortNewestFirst,
  sumBy,
  toNonNegativeInteger,
  toNonNegativeNumber,
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
   VALORES DE UNA LÍNEA DE VENTA
========================================================= */

/*
  También soporta algunos nombres de propiedades
  de versiones anteriores.
*/

function normalizeSaleLine(
  line
) {

  const gasId =
    line?.gasId ??
    line?.gasType ??
    null;


  const quantity =
    toNonNegativeInteger(

      line?.quantity ??
      line?.qty

    );


  const unitPrice =
    roundMoney(
      toNonNegativeNumber(

        line?.unitPrice ??
        line?.price

      )
    );


  const revenue =
    roundMoney(

      line?.revenue !== undefined

        ? toNonNegativeNumber(
            line.revenue
          )

        : quantity *
          unitPrice

    );


  const reserveRequired =
    roundMoney(
      toNonNegativeNumber(
        line?.reserveRequired
      )
    );


  const grossProfit =
    roundMoney(

      line?.grossProfit !== undefined

        ? toNonNegativeNumber(
            line.grossProfit
          )

        : revenue -
          reserveRequired

    );


  return {

    ...cloneData(
      line ?? {}
    ),

    gasId,

    quantity,

    unitPrice,

    revenue,

    reserveRequired,

    grossProfit,

  };

}



/* =========================================================
   LÍNEAS NORMALIZADAS DE UNA VENTA
========================================================= */

function getNormalizedSaleLines(
  saleId
) {

  return getSaleLines(
    saleId
  ).map(
    normalizeSaleLine
  );

}



/* =========================================================
   ¿UNA VENTA CONTIENE UNA MARCA?
========================================================= */

function saleContainsGas(
  sale,
  gasId
) {

  if (!gasId) {

    return true;

  }


  if (
    !GAS_ID_LIST.includes(
      gasId
    )
  ) {

    return false;

  }


  /*
    Primero revisamos las cantidades guardadas
    directamente en la venta.
  */

  if (
    toNonNegativeInteger(
      sale?.quantities?.[gasId]
    ) > 0
  ) {

    return true;

  }


  /*
    Respaldo para datos migrados.
  */

  return getNormalizedSaleLines(
    sale.id
  ).some(
    line =>
      line.gasId ===
        gasId &&
      line.quantity > 0
  );

}



/* =========================================================
   FILTRO DE CLIENTE
========================================================= */

function matchesCustomer(
  sale,
  customer
) {

  const query =
    normalizeSearchText(
      customer
    );


  if (!query) {

    return true;

  }


  const saleCustomer =
    normalizeSearchText(
      sale?.customer
    );


  return saleCustomer.includes(
    query
  );

}



/* =========================================================
   FILTRO DE PRECIO
========================================================= */

function matchesPrice(
  sale,
  price
) {

  if (
    price === '' ||
    price === null ||
    price === undefined
  ) {

    return true;

  }


  const requested =
    roundMoney(
      price
    );


  const salePrice =
    roundMoney(

      sale?.unitPrice ??
      sale?.price ??
      0

    );


  return Math.abs(
    requested -
    salePrice
  ) < 0.001;

}



/* =========================================================
   FILTRO DE MÉTODO DE PAGO
========================================================= */

function matchesPaymentMethod(
  sale,
  paymentMethod
) {

  if (!paymentMethod) {

    return true;

  }


  return (
    sale?.paymentMethod ===
    paymentMethod
  );

}



/* =========================================================
   FILTRAR VENTAS
========================================================= */

export function filterSales({

  from = '',

  to = '',

  gasId = '',

  price = '',

  paymentMethod = '',

  customer = '',

} = {}) {

  const state =
    getState();


  const filtered =
    state.sales.filter(
      sale => {

        if (
          !isDateWithinRange(
            sale.createdAt,
            from,
            to
          )
        ) {

          return false;

        }


        if (
          gasId &&
          !saleContainsGas(
            sale,
            gasId
          )
        ) {

          return false;

        }


        if (
          !matchesPrice(
            sale,
            price
          )
        ) {

          return false;

        }


        if (
          !matchesPaymentMethod(
            sale,
            paymentMethod
          )
        ) {

          return false;

        }


        if (
          !matchesCustomer(
            sale,
            customer
          )
        ) {

          return false;

        }


        return true;

      }
    );


  return sortNewestFirst(

    filtered,

    sale =>
      sale.createdAt

  );

}



/* =========================================================
   CREAR FILAS DE HISTORIAL DE VENTAS
========================================================= */

export function getSalesHistory(
  filters = {}
) {

  const sales =
    filterSales(
      filters
    );


  const requestedGasId =
    filters.gasId || null;


  return sales.map(
    sale => {

      let lines =
        getNormalizedSaleLines(
          sale.id
        );


      /*
        Cuando el usuario selecciona una marca,
        mostramos solamente esa parte de la venta
        para estadísticas por marca.

        La venta original sigue siendo una sola.
      */

      if (
        requestedGasId
      ) {

        lines =
          lines.filter(
            line =>
              line.gasId ===
              requestedGasId
          );

      }


      const units =
        sumBy(
          lines,
          line =>
            line.quantity
        );


      const revenue =
        roundMoney(
          sumBy(
            lines,
            line =>
              line.revenue
          )
        );


      const profit =
        roundMoney(
          sumBy(
            lines,
            line =>
              line.grossProfit
          )
        );


      const products =
        lines

          .filter(
            line =>
              line.quantity > 0
          )

          .map(
            line =>
              `${
                line.quantity
              } ${
                getGasName(
                  line.gasId
                )
              }`
          )

          .join(
            ' + '
          );


      return {

        id:
          sale.id,

        dayId:
          sale.dayId,

        createdAt:
          sale.createdAt,

        date:
          formatDate(
            sale.createdAt
          ),

        dateTime:
          formatDateTime(
            sale.createdAt
          ),

        customer:
          sale.customer ||
          'Venta mostrador',

        products:
          products ||
          'Sin detalle',

        units,

        price:
          roundMoney(
            sale.unitPrice ??
            sale.price ??
            0
          ),

        total:
          requestedGasId

            ? revenue

            : roundMoney(
                sale.total
              ),

        revenue,

        profit,

        paymentMethod:
          sale.paymentMethod,

        paidNow:
          roundMoney(
            sale.paidNow
          ),

        moneyDue:
          roundMoney(
            sale.moneyDue
          ),

        change:
          roundMoney(
            sale.change
          ),

        saleMode:
          sale.saleMode,

        status:
          sale.status,

        note:
          sale.note ?? '',

        lines:
          cloneData(
            lines
          ),

      };

    }
  );

}



/* =========================================================
   ESTADÍSTICAS DE VENTAS FILTRADAS
========================================================= */

export function getSalesHistoryStats(
  filters = {}
) {

  const rows =
    getSalesHistory(
      filters
    );


  return {

    count:
      rows.length,

    units:
      sumBy(
        rows,
        row =>
          row.units
      ),

    revenue:
      roundMoney(
        sumBy(
          rows,
          row =>
            row.revenue
        )
      ),

    profit:
      roundMoney(
        sumBy(
          rows,
          row =>
            row.profit
        )
      ),

  };

}



/* =========================================================
   HISTORIAL GENERAL DE MOVIMIENTOS
========================================================= */

export function getMovementsHistory({

  from = '',

  to = '',

  type = '',

} = {}) {

  const movements =
    getState()
      .movements
      .filter(
        movement => {

          if (
            !isDateWithinRange(
              movement.createdAt,
              from,
              to
            )
          ) {

            return false;

          }


          if (
            type &&
            movement.type !==
              type
          ) {

            return false;

          }


          return true;

        }
      );


  return sortNewestFirst(

    movements,

    movement =>
      movement.createdAt

  ).map(
    movement => ({

      ...cloneData(
        movement
      ),

      date:
        formatDate(
          movement.createdAt
        ),

      dateTime:
        formatDateTime(
          movement.createdAt
        ),

    })
  );

}



/* =========================================================
   HISTORIAL DE REPOSICIONES
========================================================= */

export function getReplenishmentsHistory({

  from = '',

  to = '',

  gasId = '',

} = {}) {

  const items =
    getState()
      .replenishments
      .filter(
        item => {

          if (
            !isDateWithinRange(
              item.createdAt,
              from,
              to
            )
          ) {

            return false;

          }


          if (
            gasId &&
            item.gasId !==
              gasId
          ) {

            return false;

          }


          return true;

        }
      );


  return sortNewestFirst(

    items,

    item =>
      item.createdAt

  ).map(
    item => ({

      ...cloneData(
        item
      ),

      gasName:
        getGasName(
          item.gasId
        ),

      date:
        formatDate(
          item.createdAt
        ),

      dateTime:
        formatDateTime(
          item.createdAt
        ),

    })
  );

}



/* =========================================================
   ESTADÍSTICAS DE REPOSICIONES
========================================================= */

export function getReplenishmentsHistoryStats(
  filters = {}
) {

  const items =
    getReplenishmentsHistory(
      filters
    );


  const duragasQuantity =
    sumBy(

      items.filter(
        item =>
          item.gasId ===
          GAS_IDS.DURAGAS
      ),

      item =>
        item.quantity

    );


  const kinggasQuantity =
    sumBy(

      items.filter(
        item =>
          item.gasId ===
          GAS_IDS.KING_GAS
      ),

      item =>
        item.quantity

    );


  return {

    operations:
      items.length,

    duragas:
      duragasQuantity,

    kinggas:
      kinggasQuantity,

    totalUnits:
      duragasQuantity +
      kinggasQuantity,

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
            item.additionalCosts
        )
      ),

    totalPaid:
      roundMoney(
        sumBy(
          items,
          item =>
            item.totalPaid
        )
      ),

    extraContributions:
      roundMoney(
        sumBy(
          items,
          item =>
            item.extraContribution
        )
      ),

  };

}



/* =========================================================
   TARJETAS DE DÍAS CERRADOS
========================================================= */
export function getClosedDaysHistory() {

  const state =
    getState();


  const days =
    getClosedDays();


  return days.map(
    day => {

      let closing = null;


      if (
        day.closingId
      ) {

        closing =
          getClosingById(
            day.closingId
          );

      }


      if (!closing) {

        closing =
          state.closings.find(
            item =>
              item.dayId ===
              day.id
          ) ?? null;

      }


      const sales =
        state.sales.filter(
          sale =>
            sale.dayId ===
            day.id
        );


      return {

        dayId:
          day.id,

        dateKey:
          day.dateKey,

        openedAt:
          day.openedAt,

        closedAt:
          day.closedAt,

        date:
          formatDate(
            day.openedAt
          ),

        salesCount:
          sales.length,

        units:
          closing
            ?.finance
            ?.sales
            ?.units ??
          0,

        revenue:
          roundMoney(
            closing
              ?.finance
              ?.sales
              ?.revenue ??
            0
          ),

        collected:
          roundMoney(
            closing
              ?.finance
              ?.collection
              ?.total ??
            0
          ),

        profit:
          roundMoney(
            closing
              ?.finance
              ?.profit
              ?.available ??
            closing
              ?.finance
              ?.profit
              ?.net ??
            0
          ),

        cashDifference:
          roundMoney(
            closing
              ?.cash
              ?.difference ??
            0
          ),

        /*
          CIERRES NUEVOS:
          warehouse = diferencia física real en bodega.

          CIERRES ANTIGUOS:
          puede existir solamente controlled.

          Nunca usamos controlled como primera opción
          porque incluye cilindros en ruta y prestados.
        */

        inventoryDifference:
          Number(

            closing
              ?.inventory
              ?.warehouse
              ?.difference

            ??

            closing
              ?.inventory
              ?.controlled
              ?.difference

            ??

            0

          ),

        hasAnyDifference:
          Boolean(
            closing
              ?.hasAnyDifference
          ),

        closingId:
          closing?.id ??
          null,

      };

    }
  );

}

/* =========================================================
   DETALLE COMPLETO DE UN DÍA
========================================================= */

export function getDayHistoryDetail(
  dayId
) {

  const detail =
    getClosedDayDetail(
      dayId
    );


  if (!detail) {

    return null;

  }


  const state =
    getState();


  const day =
    detail.day;


  const closing =
    detail.closing;


  /*
    Ventas enriquecidas.
  */

  const sales =
    detail.sales.map(
      sale => {

        const lines =
          detail.saleLines

            .filter(
              line =>
                line.saleId ===
                sale.id
            )

            .map(
              normalizeSaleLine
            );


        const products =
          lines

            .map(
              line =>
                `${line.quantity} ${getGasName(line.gasId)}`
            )

            .join(
              ' + '
            );


        return {

          ...cloneData(
            sale
          ),

          lines,

          products:
            products ||
            'Sin detalle',

          dateTime:
            formatDateTime(
              sale.createdAt
            ),

        };

      }
    );



  /*
    Movimientos ordenados cronológicamente
    para poder reconstruir la jornada.
  */

  const movements =
    [...detail.movements]
      .sort(
        (
          first,
          second
        ) => {

          return (
            new Date(
              first.createdAt
            ).getTime()

            -

            new Date(
              second.createdAt
            ).getTime()
          );

        }
      )
      .map(
        movement => ({

          ...cloneData(
            movement
          ),

          dateTime:
            formatDateTime(
              movement.createdAt
            ),

        })
      );



  /*
    Cuentas creadas originalmente durante ese día.
    Pueden estar cerradas actualmente.
  */

  const accounts =
    state.accounts
      .filter(
        account =>
          account.dayId ===
          dayId
      )
      .map(
        account => {

          const currentBalance =
            state
              .accountBalances
              .find(
                balance =>
                  balance.accountId ===
                  account.id
              );


          return {

            ...cloneData(
              account
            ),

            currentBalance:
              currentBalance
                ? cloneData(
                    currentBalance
                  )
                : null,

          };

        }
      );


  return {

    day: {

      ...cloneData(
        day
      ),

      date:
        formatDate(
          day.openedAt
        ),

      openedDateTime:
        formatDateTime(
          day.openedAt
        ),

      closedDateTime:
        formatDateTime(
          day.closedAt
        ),

    },


    closing:
      closing
        ? cloneData(
            closing
          )
        : null,


    metrics: {

      sales:
        closing
          ?.finance
          ?.sales
          ?.count ??
        sales.length,

      units:
        closing
          ?.finance
          ?.sales
          ?.units ??
        sumBy(
          sales,
          sale =>
            sale.totalUnits
        ),

      revenue:
        roundMoney(
          closing
            ?.finance
            ?.sales
            ?.revenue ??
          sumBy(
            sales,
            sale =>
              sale.total
          )
        ),

      collected:
        roundMoney(
          closing
            ?.finance
            ?.collection
            ?.total ??
          0
        ),

      profit:
        roundMoney(
          closing
            ?.finance
            ?.profit
            ?.available ??
          closing
            ?.finance
            ?.profit
            ?.net ??
          0
        ),

    },


    wallets:
      closing?.wallets
        ? cloneData(
            closing.wallets
          )
        : null,


    sales,


    replenishments:
      cloneData(
        detail.replenishments
      ),


    adjustments:
      cloneData(
        detail.adjustments
      ),


    loans:
      cloneData(
        detail.loans
      ),


    expenses:
      cloneData(
        detail.expenses
      ),


    accounts,


    walletMovements:
      cloneData(
        detail.walletMovements
      ),


    movements,

  };

}



/* =========================================================
   ESTADÍSTICA POR DÍA DE LA SEMANA
========================================================= */

/*
  Ya dejamos preparada esta función para análisis futuros.

  Ejemplo:
  saber si los viernes se venden más cilindros.
*/

export function getSalesByWeekday() {

  const rows =
    getSalesHistory();


  const result = {

    0: {
      name: 'Domingo',
      sales: 0,
      units: 0,
      revenue: 0,
    },

    1: {
      name: 'Lunes',
      sales: 0,
      units: 0,
      revenue: 0,
    },

    2: {
      name: 'Martes',
      sales: 0,
      units: 0,
      revenue: 0,
    },

    3: {
      name: 'Miércoles',
      sales: 0,
      units: 0,
      revenue: 0,
    },

    4: {
      name: 'Jueves',
      sales: 0,
      units: 0,
      revenue: 0,
    },

    5: {
      name: 'Viernes',
      sales: 0,
      units: 0,
      revenue: 0,
    },

    6: {
      name: 'Sábado',
      sales: 0,
      units: 0,
      revenue: 0,
    },

  };


  rows.forEach(
    row => {

      const date =
        new Date(
          row.createdAt
        );


      if (
        Number.isNaN(
          date.getTime()
        )
      ) {

        return;

      }


      const weekday =
        date.getDay();


      const target =
        result[
          weekday
        ];


      target.sales +=
        1;


      target.units +=
        row.units;


      target.revenue =
        roundMoney(
          target.revenue +
          row.revenue
        );

    }
  );


  return Object.values(
    result
  );

}



/* =========================================================
   VENTAS POR MARCA
========================================================= */

export function getSalesBrandMix(
  filters = {}
) {

  const sales =
    filterSales(
      filters
    );


  const result = {

    [GAS_IDS.DURAGAS]: {

      gasId:
        GAS_IDS.DURAGAS,

      gasName:
        getGasName(
          GAS_IDS.DURAGAS
        ),

      units: 0,

      revenue: 0,

      profit: 0,

    },


    [GAS_IDS.KING_GAS]: {

      gasId:
        GAS_IDS.KING_GAS,

      gasName:
        getGasName(
          GAS_IDS.KING_GAS
        ),

      units: 0,

      revenue: 0,

      profit: 0,

    },

  };


  sales.forEach(
    sale => {

      const lines =
        getNormalizedSaleLines(
          sale.id
        );


      lines.forEach(
        line => {

          if (
            !result[
              line.gasId
            ]
          ) {

            return;

          }


          const target =
            result[
              line.gasId
            ];


          target.units +=
            line.quantity;


          target.revenue =
            roundMoney(
              target.revenue +
              line.revenue
            );


          target.profit =
            roundMoney(
              target.profit +
              line.grossProfit
            );

        }
      );

    }
  );


  return result;

}



/* =========================================================
   DISTRIBUCIÓN POR PRECIO
========================================================= */

export function getSalesPriceMix(
  filters = {}
) {

  const rows =
    getSalesHistory(
      filters
    );


  const groups = {};


  rows.forEach(
    row => {

      const key =
        row.price.toFixed(
          2
        );


      if (
        !groups[key]
      ) {

        groups[key] = {

          price:
            row.price,

          sales: 0,

          units: 0,

          revenue: 0,

        };

      }


      groups[key].sales +=
        1;


      groups[key].units +=
        row.units;


      groups[key].revenue =
        roundMoney(

          groups[key].revenue

          +

          row.revenue

        );

    }
  );


  return Object.values(
    groups
  ).sort(
    (
      first,
      second
    ) =>
      first.price -
      second.price
  );

}



/* =========================================================
   VENTAS POR HORA
========================================================= */

export function getSalesByHour(
  filters = {}
) {

  const rows =
    getSalesHistory(
      filters
    );


  const hours = {};


  for (
    let hour = 0;
    hour < 24;
    hour += 1
  ) {

    hours[hour] = {

      hour,

      label:
        `${String(hour).padStart(2, '0')}:00`,

      sales: 0,

      units: 0,

      revenue: 0,

    };

  }


  rows.forEach(
    row => {

      const date =
        new Date(
          row.createdAt
        );


      if (
        Number.isNaN(
          date.getTime()
        )
      ) {

        return;

      }


      const hour =
        date.getHours();


      hours[hour].sales +=
        1;


      hours[hour].units +=
        row.units;


      hours[hour].revenue =
        roundMoney(

          hours[hour].revenue

          +

          row.revenue

        );

    }
  );


  return Object.values(
    hours
  );

}



/* =========================================================
   RESUMEN HISTÓRICO GENERAL
========================================================= */

export function getGlobalHistorySummary() {

  const sales =
    getSalesHistory();


  const closedDays =
    getClosedDaysHistory();


  const replenishments =
    getReplenishmentsHistoryStats();


  return {

    closedDays:
      closedDays.length,

    sales:
      sales.length,

    units:
      sumBy(
        sales,
        sale =>
          sale.units
      ),

    revenue:
      roundMoney(
        sumBy(
          sales,
          sale =>
            sale.revenue
        )
      ),

    grossProfit:
      roundMoney(
        sumBy(
          sales,
          sale =>
            sale.profit
        )
      ),

    replenishments:

      cloneData(
        replenishments
      ),

  };

}
