/* =========================================================
   CONTROLGAS
   UTILIDADES GENERALES

   Funciones reutilizables para:
   - Dinero
   - Fechas
   - Horas
   - IDs
   - Números seguros
   - Redondeos
   - Texto seguro
   - Validaciones pequeñas

   Este archivo NO modifica el estado de la aplicación.
========================================================= */


/* =========================================================
   NÚMEROS
========================================================= */

/*
  Convierte cualquier valor a número seguro.

  Si no es válido devuelve el valor indicado
  en fallback.
*/

export function toNumber(
  value,
  fallback = 0
) {

  const number =
    Number(value);


  return Number.isFinite(number)
    ? number
    : fallback;

}



/*
  Convierte un valor a entero.

  Útil para cantidades de cilindros.
*/

export function toInteger(
  value,
  fallback = 0
) {

  const number =
    Number.parseInt(value, 10);


  return Number.isFinite(number)
    ? number
    : fallback;

}



/*
  Devuelve un entero igual o mayor que cero.
*/

export function toNonNegativeInteger(
  value,
  fallback = 0
) {

  return Math.max(
    0,
    toInteger(
      value,
      fallback
    )
  );

}



/*
  Devuelve un número igual o mayor que cero.
*/

export function toNonNegativeNumber(
  value,
  fallback = 0
) {

  return Math.max(
    0,
    toNumber(
      value,
      fallback
    )
  );

}



/* =========================================================
   REDONDEO
========================================================= */

export function roundTo(
  value,
  decimals = 2
) {

  const number =
    toNumber(value);


  const factor =
    10 ** decimals;


  return Math.round(
    (
      number +
      Number.EPSILON
    ) *
    factor
  ) / factor;

}



/*
  Redondeo monetario estándar.
*/

export function roundMoney(value) {

  return roundTo(
    value,
    2
  );

}



/* =========================================================
   COMPARACIONES DE DINERO
========================================================= */

/*
  Evita problemas típicos de JavaScript como:

  0.1 + 0.2 !== 0.3
*/

export function moneyEquals(
  first,
  second,
  tolerance = 0.005
) {

  return Math.abs(
    toNumber(first) -
    toNumber(second)
  ) < tolerance;

}



/*
  Comprueba si el primer valor es mayor
  que el segundo teniendo en cuenta
  una pequeña tolerancia.
*/

export function moneyGreaterThan(
  first,
  second,
  tolerance = 0.005
) {

  return (
    toNumber(first) -
    toNumber(second)
  ) > tolerance;

}



/*
  Comprueba si el primer valor es menor
  que el segundo.
*/

export function moneyLessThan(
  first,
  second,
  tolerance = 0.005
) {

  return (
    toNumber(second) -
    toNumber(first)
  ) > tolerance;

}



/* =========================================================
   FORMATO DE DINERO
========================================================= */

const MONEY_FORMATTER =
  new Intl.NumberFormat(
    'es-EC',
    {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );


export function formatMoney(value) {

  return MONEY_FORMATTER.format(
    roundMoney(value)
  );

}



/*
  Si necesitas únicamente:
  12.50
  sin símbolo de dólar.
*/

export function formatMoneyNumber(value) {

  return roundMoney(value)
    .toFixed(2);

}



/* =========================================================
   FORMATO DE CANTIDADES
========================================================= */

export function formatUnits(
  value,
  singular = 'tanque',
  plural = 'tanques'
) {

  const quantity =
    toNonNegativeInteger(value);


  return `${quantity} ${
    quantity === 1
      ? singular
      : plural
  }`;

}



/* =========================================================
   FECHAS
========================================================= */

const DATE_FORMATTER =
  new Intl.DateTimeFormat(
    'es-EC',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  );


const DATE_TIME_FORMATTER =
  new Intl.DateTimeFormat(
    'es-EC',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );


const TIME_FORMATTER =
  new Intl.DateTimeFormat(
    'es-EC',
    {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }
  );


const SHORT_TIME_FORMATTER =
  new Intl.DateTimeFormat(
    'es-EC',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  );



/*
  Convierte un valor a Date.

  Si el valor no es válido devuelve null.
*/

export function toDate(value) {

  if (
    value instanceof Date &&
    !Number.isNaN(
      value.getTime()
    )
  ) {

    return value;

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null;

  }


  return date;

}



/*
  Fecha:
  18/08/2026
*/

export function formatDate(value) {

  const date =
    toDate(value);


  return date
    ? DATE_FORMATTER.format(date)
    : '--';

}



/*
  Fecha y hora:
  18/08/2026, 10:15 p. m.
*/

export function formatDateTime(value) {

  const date =
    toDate(value);


  return date
    ? DATE_TIME_FORMATTER.format(date)
    : '--';

}



/*
  Hora con segundos.
*/

export function formatTime(value) {

  const date =
    toDate(value);


  return date
    ? TIME_FORMATTER.format(date)
    : '--:--:--';

}



/*
  Hora corta para tablas.
*/

export function formatShortTime(value) {

  const date =
    toDate(value);


  return date
    ? SHORT_TIME_FORMATTER.format(date)
    : '--:--';

}



/* =========================================================
   FECHA LOCAL YYYY-MM-DD
========================================================= */

/*
  No utilizamos:

  new Date().toISOString().slice(0, 10)

  para la fecha del negocio porque UTC puede
  cambiar el día dependiendo de la hora local.
*/

export function getLocalDateKey(
  value = new Date()
) {

  const date =
    toDate(value);


  if (!date) {

    return '';

  }


  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(
      2,
      '0'
    );


  const day =
    String(
      date.getDate()
    ).padStart(
      2,
      '0'
    );


  return `${year}-${month}-${day}`;

}



/*
  Fecha y hora ISO completa para guardar
  movimientos de forma precisa.
*/

export function nowIso() {

  return new Date()
    .toISOString();

}



/* =========================================================
   INICIO / FIN DE DÍA
========================================================= */

export function startOfLocalDay(value) {

  const date =
    toDate(value);


  if (!date) {

    return null;

  }


  const result =
    new Date(date);


  result.setHours(
    0,
    0,
    0,
    0
  );


  return result;

}


export function endOfLocalDay(value) {

  const date =
    toDate(value);


  if (!date) {

    return null;

  }


  const result =
    new Date(date);


  result.setHours(
    23,
    59,
    59,
    999
  );


  return result;

}



/* =========================================================
   FILTRAR POR FECHAS
========================================================= */

export function isDateWithinRange(
  value,
  fromDate = '',
  toDateValue = ''
) {

  const date =
    toDate(value);


  if (!date) {

    return false;

  }


  if (fromDate) {

    const from =
      startOfLocalDay(
        `${fromDate}T00:00:00`
      );


    if (
      from &&
      date < from
    ) {

      return false;

    }

  }


  if (toDateValue) {

    const to =
      endOfLocalDay(
        `${toDateValue}T00:00:00`
      );


    if (
      to &&
      date > to
    ) {

      return false;

    }

  }


  return true;

}



/* =========================================================
   IDENTIFICADORES ÚNICOS
========================================================= */

/*
  crypto.randomUUID funciona en navegadores modernos
  y también en GitHub Pages.

  Se deja un respaldo por compatibilidad.
*/

export function uid(prefix = 'id') {

  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {

    return `${prefix}_${crypto.randomUUID()}`;

  }


  return `${prefix}_${
    Date.now().toString(36)
  }_${
    Math.random()
      .toString(36)
      .slice(2, 10)
  }`;

}



/* =========================================================
   TEXTO
========================================================= */

export function normalizeText(value) {

  return String(
    value ?? ''
  )
    .trim();

}



/*
  Convierte a minúsculas y elimina tildes.

  Útil para búsquedas de clientes.
*/

export function normalizeSearchText(value) {

  return normalizeText(value)

    .normalize('NFD')

    .replace(
      /[\u0300-\u036f]/g,
      ''
    )

    .toLowerCase();

}



/* =========================================================
   ESCAPE HTML
========================================================= */

/*
  Evita que un nombre de cliente o nota
  pueda insertar HTML dentro de las tablas.
*/

export function escapeHtml(value) {

  return String(
    value ?? ''
  )

    .replaceAll(
      '&',
      '&amp;'
    )

    .replaceAll(
      '<',
      '&lt;'
    )

    .replaceAll(
      '>',
      '&gt;'
    )

    .replaceAll(
      '"',
      '&quot;'
    )

    .replaceAll(
      "'",
      '&#039;'
    );

}



/* =========================================================
   CLAMP
========================================================= */

export function clamp(
  value,
  minimum,
  maximum
) {

  return Math.min(
    maximum,
    Math.max(
      minimum,
      toNumber(value)
    )
  );

}



/* =========================================================
   SUMAS
========================================================= */

export function sum(
  values = []
) {

  if (!Array.isArray(values)) {

    return 0;

  }


  return values.reduce(

    (
      total,
      value
    ) => {

      return total +
        toNumber(value);

    },

    0

  );

}



/*
  Suma una propiedad de una lista.

  Ejemplo:

  sumBy(
    ventas,
    venta => venta.total
  )
*/

export function sumBy(
  items = [],
  selector = item => item
) {

  if (!Array.isArray(items)) {

    return 0;

  }


  return items.reduce(

    (
      total,
      item,
      index
    ) => {

      return total +
        toNumber(
          selector(
            item,
            index
          )
        );

    },

    0

  );

}



/* =========================================================
   ORDENAR POR FECHA
========================================================= */

export function sortNewestFirst(
  items = [],
  dateSelector = item => item.createdAt
) {

  return [...items].sort(

    (
      first,
      second
    ) => {

      const firstDate =
        toDate(
          dateSelector(first)
        );


      const secondDate =
        toDate(
          dateSelector(second)
        );


      return (
        secondDate?.getTime() ?? 0
      ) -
      (
        firstDate?.getTime() ?? 0
      );

    }

  );

}



/*
  Orden cronológico:
  antiguo → reciente.
*/

export function sortOldestFirst(
  items = [],
  dateSelector = item => item.createdAt
) {

  return [...items].sort(

    (
      first,
      second
    ) => {

      const firstDate =
        toDate(
          dateSelector(first)
        );


      const secondDate =
        toDate(
          dateSelector(second)
        );


      return (
        firstDate?.getTime() ?? 0
      ) -
      (
        secondDate?.getTime() ?? 0
      );

    }

  );

}



/* =========================================================
   AGRUPAR
========================================================= */

export function groupBy(
  items = [],
  selector
) {

  const result = {};


  if (
    !Array.isArray(items) ||
    typeof selector !== 'function'
  ) {

    return result;

  }


  items.forEach(

    (
      item,
      index
    ) => {

      const key =
        selector(
          item,
          index
        );


      if (
        !Object.prototype.hasOwnProperty.call(
          result,
          key
        )
      ) {

        result[key] = [];

      }


      result[key].push(item);

    }

  );


  return result;

}



/* =========================================================
   CLONADO SEGURO
========================================================= */

/*
  Para los objetos simples que utilizaremos
  en el estado de ControlGas.
*/

export function cloneData(value) {

  if (
    typeof structuredClone === 'function'
  ) {

    return structuredClone(value);

  }


  return JSON.parse(
    JSON.stringify(value)
  );

}



/* =========================================================
   ARRAY SEGURO
========================================================= */

export function ensureArray(value) {

  return Array.isArray(value)
    ? value
    : [];

}



/* =========================================================
   OBJETO SEGURO
========================================================= */

export function ensureObject(value) {

  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {

    return value;

  }


  return {};

}



/* =========================================================
   BOOLEAN
========================================================= */

export function toBoolean(
  value,
  fallback = false
) {

  if (
    value === true ||
    value === false
  ) {

    return value;

  }


  if (
    value === 'true' ||
    value === 1 ||
    value === '1'
  ) {

    return true;

  }


  if (
    value === 'false' ||
    value === 0 ||
    value === '0'
  ) {

    return false;

  }


  return fallback;

}



/* =========================================================
   INPUTS DEL DOM
========================================================= */

export function getInputNumber(
  element,
  fallback = 0
) {

  if (!element) {

    return fallback;

  }


  return toNumber(
    element.value,
    fallback
  );

}


export function getInputInteger(
  element,
  fallback = 0
) {

  if (!element) {

    return fallback;

  }


  return toNonNegativeInteger(
    element.value,
    fallback
  );

}



/*
  Asigna un entero no negativo a un input.
*/

export function setInputInteger(
  element,
  value
) {

  if (!element) {

    return;

  }


  element.value =
    String(
      toNonNegativeInteger(value)
    );

}



/*
  Asigna dinero con 2 decimales.
*/

export function setInputMoney(
  element,
  value
) {

  if (!element) {

    return;

  }


  element.value =
    formatMoneyNumber(value);

}



/* =========================================================
   CAMBIO DE CONTADORES
========================================================= */

/*
  Facilita los botones:

  −  cantidad  +

  No permite bajar de cero.
*/

export function stepNonNegativeInteger(
  currentValue,
  step
) {

  const current =
    toNonNegativeInteger(
      currentValue
    );


  const movement =
    toInteger(
      step
    );


  return Math.max(
    0,
    current +
    movement
  );

}



/* =========================================================
   DATOS VACÍOS
========================================================= */

export function isBlank(value) {

  return normalizeText(value) === '';

}



/* =========================================================
   ASSERT SIMPLE
========================================================= */

/*
  Útil para detectar errores de programación.

  Ejemplo:
  assert(day, 'No existe día activo');
*/

export function assert(
  condition,
  message = 'Operación inválida'
) {

  if (!condition) {

    throw new Error(message);

  }

}



/* =========================================================
   DIFERENCIA CON SIGNO
========================================================= */

export function signedNumber(value) {

  const number =
    toNumber(value);


  if (number > 0) {

    return `+${number}`;

  }


  return String(number);

}



/* =========================================================
   DIFERENCIA MONETARIA CON SIGNO
========================================================= */

export function signedMoney(value) {

  const number =
    roundMoney(value);


  if (number > 0) {

    return `+${formatMoney(number)}`;

  }


  if (number < 0) {

    return `-${formatMoney(
      Math.abs(number)
    )}`;

  }


  return formatMoney(0);

}