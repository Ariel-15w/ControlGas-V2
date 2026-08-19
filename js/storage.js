/* =========================================================
   CONTROLGAS
   ALMACENAMIENTO Y RESPALDOS

   Responsabilidades:
   - Guardar V5 en localStorage
   - Cargar V5
   - Detectar datos antiguos
   - Intentar migrar V4 / V3
   - Exportar respaldo JSON
   - Importar respaldo JSON
   - No borrar automáticamente bases antiguas

   IMPORTANTE:
   Este archivo NO calcula ventas, ganancias
   ni movimientos de inventario.
========================================================= */

import {
  APP_CONFIG,
  STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  GAS_IDS,
  DAY_STATUS,
} from './config.js';


import {
  getState,
  getStateSnapshot,
  replaceState,
  resetState,
  touchState,
  normalizeStateShape,
  auditState,
} from './state.js';


import {
  cloneData,
  ensureArray,
  ensureObject,
  getLocalDateKey,
  nowIso,
  roundMoney,
  toNonNegativeInteger,
  toNonNegativeNumber,
} from './utils.js';



/* =========================================================
   COMPROBAR LOCALSTORAGE
========================================================= */

export function isStorageAvailable() {

  try {

    const testKey =
      '__controlgas_storage_test__';


    localStorage.setItem(
      testKey,
      '1'
    );


    localStorage.removeItem(
      testKey
    );


    return true;

  }
  catch (error) {

    console.error(
      'ControlGas no puede utilizar localStorage.',
      error
    );


    return false;

  }

}



/* =========================================================
   GUARDAR ESTADO
========================================================= */

export function saveState() {

  if (!isStorageAvailable()) {

    throw new Error(
      'No se pudo acceder al almacenamiento del navegador.'
    );

  }


  touchState();


  const snapshot =
    getStateSnapshot();


  try {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(snapshot)
    );

  }
  catch (error) {

    console.error(
      'Error guardando ControlGas:',
      error
    );


    throw new Error(
      'No se pudieron guardar los datos. Revisa el espacio disponible del navegador.'
    );

  }


  return snapshot;

}



/* =========================================================
   LEER UNA CLAVE
========================================================= */

function readStorageKey(
  key
) {

  if (!key) {

    return null;

  }


  const raw =
    localStorage.getItem(key);


  if (!raw) {

    return null;

  }


  try {

    return JSON.parse(raw);

  }
  catch (error) {

    console.error(
      `No se pudo leer ${key}:`,
      error
    );


    return null;

  }

}



/* =========================================================
   DETECTAR CONTENIDO DE RESPALDO
========================================================= */

/*
  Los respaldos V5 nuevos tendrán esta forma:

  {
    backup: {...},
    data: {...}
  }

  Pero también aceptaremos estados directos:

  {
    meta: {...},
    sales: [...]
  }
*/

function extractStateFromBackup(
  parsed
) {

  const source =
    ensureObject(parsed);


  if (
    source.data &&
    typeof source.data === 'object'
  ) {

    return source.data;

  }


  return source;

}



/* =========================================================
   COMPROBAR SI PARECE CONTROLGAS
========================================================= */

function looksLikeControlGasData(
  value
) {

  const source =
    ensureObject(value);


  return Boolean(

    source.meta ||

    source.inventory ||

    source.days ||

    source.sales ||

    source.saleLines ||

    source.movements

  );

}



/* =========================================================
   DETECTAR VERSIÓN
========================================================= */

function getSchemaVersion(
  rawState
) {

  const source =
    ensureObject(rawState);


  const meta =
    ensureObject(
      source.meta
    );


  const possibleVersion =

    meta.schemaVersion ??

    source.schemaVersion ??

    source.version ??
    0;


  const numeric =
    Number(possibleVersion);


  return Number.isFinite(numeric)
    ? numeric
    : 0;

}



/* =========================================================
   NORMALIZACIÓN DE INVENTARIO ANTIGUO
========================================================= */

function getLegacyGasObject(
  inventory,
  gasId
) {

  const source =
    ensureObject(inventory);


  if (
    gasId ===
    GAS_IDS.DURAGAS
  ) {

    return ensureObject(

      source.duragas ??

      source.Duragas ??

      source.DURAGAS ??

      source.amarillo ??

      source.yellow

    );

  }


  return ensureObject(

    source.kinggas ??

    source.kingGas ??

    source.KingGas ??

    source.KINGGAS ??

    source.rosado ??

    source.pink

  );

}



/* =========================================================
   LEER UNA PROPIEDAD ANTIGUA
========================================================= */

function firstDefined(
  object,
  keys,
  fallback = 0
) {

  const source =
    ensureObject(object);


  for (
    const key
    of keys
  ) {

    if (
      source[key] !== undefined &&
      source[key] !== null
    ) {

      return source[key];

    }

  }


  return fallback;

}



/* =========================================================
   CONVERTIR INVENTARIO ANTIGUO DE UNA MARCA
========================================================= */

function migrateLegacyGasInventory(
  rawGas
) {

  const source =
    ensureObject(rawGas);


  return {

    full:
      toNonNegativeInteger(
        firstDefined(
          source,
          [
            'full',
            'filled',
            'llenos',
            'lleno',
            'available',
            'disponibles',
          ]
        )
      ),


    empty:
      toNonNegativeInteger(
        firstDefined(
          source,
          [
            'empty',
            'empties',
            'vacios',
            'vacíos',
            'vacio',
            'vacío',
          ]
        )
      ),


    reserved:
      toNonNegativeInteger(
        firstDefined(
          source,
          [
            'reserved',
            'reservados',
            'apartados',
          ]
        )
      ),


    /*
      Las versiones anteriores no manejaban
      necesariamente cilindros prestados.
    */

    loaned:
      toNonNegativeInteger(
        firstDefined(
          source,
          [
            'loaned',
            'prestados',
            'borrowed',
          ],
          0
        )
      ),

  };

}



/* =========================================================
   CONVERTIR INVENTARIO ANTIGUO
========================================================= */

function migrateLegacyInventory(
  rawInventory
) {

  return {

    [GAS_IDS.DURAGAS]:

      migrateLegacyGasInventory(

        getLegacyGasObject(
          rawInventory,
          GAS_IDS.DURAGAS
        )

      ),


    [GAS_IDS.KING_GAS]:

      migrateLegacyGasInventory(

        getLegacyGasObject(
          rawInventory,
          GAS_IDS.KING_GAS
        )

      ),

  };

}



/* =========================================================
   BUSCAR INVENTARIO EN UNA BASE ANTIGUA
========================================================= */

function findLegacyInventory(
  source
) {

  const raw =
    ensureObject(source);


  /*
    PRIMERA OPCIÓN:
    si la versión antigua guardaba el inventario actual.
  */

  if (raw.inventory) {

    return migrateLegacyInventory(
      raw.inventory
    );

  }


  if (raw.currentInventory) {

    return migrateLegacyInventory(
      raw.currentInventory
    );

  }


  if (raw.stock) {

    return migrateLegacyInventory(
      raw.stock
    );

  }



  /*
    SEGUNDA OPCIÓN:
    buscar información dentro del día activo.
  */

  const days =
    ensureArray(
      raw.days
    );


  let activeDay = null;


  if (raw.activeDayId) {

    activeDay =
      days.find(
        day =>
          day?.id ===
          raw.activeDayId
      ) ?? null;

  }


  if (!activeDay) {

    activeDay =
      days.find(
        day =>
          day?.status ===
            DAY_STATUS.OPEN
      ) ?? null;

  }



  if (activeDay) {

    const candidates = [

      activeDay.currentInventory,

      activeDay.inventory,

      activeDay?.closing?.inventory,

      activeDay?.opening?.inventory,

      activeDay.openingInventory,

    ];


    for (
      const candidate
      of candidates
    ) {

      if (candidate) {

        return migrateLegacyInventory(
          candidate
        );

      }

    }

  }



  /*
    TERCERA OPCIÓN:
    usar el inventario de un cierre reciente
    si existe.
  */

  const closings =
    ensureArray(
      raw.closings
    );


  const latestClosing =

    [...closings]

      .sort(
        (
          first,
          second
        ) => {

          return new Date(
            second?.closedAt ??
            second?.createdAt ??
            0
          ).getTime()

          -

          new Date(
            first?.closedAt ??
            first?.createdAt ??
            0
          ).getTime();

        }
      )

      .find(Boolean);


  if (latestClosing) {

    const candidates = [

      latestClosing.inventory,

      latestClosing.closingInventory,

      latestClosing.physicalInventory,

      latestClosing.expectedInventory,

    ];


    for (
      const candidate
      of candidates
    ) {

      if (candidate) {

        return migrateLegacyInventory(
          candidate
        );

      }

    }

  }



  /*
    Si no se puede determinar con seguridad,
    comenzamos en cero.

    IMPORTANTE:
    NO eliminamos la base antigua.
    Por tanto el respaldo original continúa disponible.
  */

  return {

    [GAS_IDS.DURAGAS]: {

      full: 0,

      empty: 0,

      reserved: 0,

      loaned: 0,

    },


    [GAS_IDS.KING_GAS]: {

      full: 0,

      empty: 0,

      reserved: 0,

      loaned: 0,

    },

  };

}



/* =========================================================
   MIGRAR BOLSAS ANTIGUAS
========================================================= */

function migrateLegacyWallets(
  source
) {

  const raw =
    ensureObject(source);


  const wallets =
    ensureObject(

      raw.wallets ??

      raw.replacementWallets ??

      raw.reserveWallets ??

      raw.repositionFunds

    );


  const duragas =

    wallets.duragas ??

    wallets.Duragas ??

    wallets.amarillo ??
    0;


  const kinggas =

    wallets.kinggas ??

    wallets.kingGas ??

    wallets.KingGas ??

    wallets.rosado ??
    0;


  return {

    [GAS_IDS.DURAGAS]:
      roundMoney(
        toNonNegativeNumber(
          duragas
        )
      ),


    [GAS_IDS.KING_GAS]:
      roundMoney(
        toNonNegativeNumber(
          kinggas
        )
      ),

  };

}



/* =========================================================
   NORMALIZAR DÍAS ANTIGUOS
========================================================= */

function migrateLegacyDays(
  rawDays
) {

  return ensureArray(
    rawDays
  ).map(

    day => {

      const source =
        ensureObject(day);


      let status =
        source.status;


      if (
        status !==
          DAY_STATUS.OPEN &&
        status !==
          DAY_STATUS.CLOSED
      ) {

        status =
          source.closedAt ||
          source.isClosed === true

            ? DAY_STATUS.CLOSED

            : DAY_STATUS.OPEN;

      }


      return {

        ...cloneData(source),

        status,

      };

    }

  );

}



/* =========================================================
   DETERMINAR DÍA ACTIVO ANTIGUO
========================================================= */

function findLegacyActiveDayId(
  source,
  days
) {

  const raw =
    ensureObject(source);


  if (
    raw.activeDayId &&
    days.some(
      day =>
        day.id ===
        raw.activeDayId
    )
  ) {

    return raw.activeDayId;

  }


  const openDay =
    days.find(
      day =>
        day.status ===
        DAY_STATUS.OPEN
    );


  return openDay?.id ?? null;

}



/* =========================================================
   MIGRACIÓN V3/V4 → V5
========================================================= */

export function migrateLegacyState(
  legacyState,
  sourceName = 'legacy'
) {

  const source =
    ensureObject(
      legacyState
    );


  const days =
    migrateLegacyDays(
      source.days
    );


  const migrated = {

    meta: {

      schemaVersion:
        APP_CONFIG.schemaVersion,

      appVersion:
        APP_CONFIG.version,

      createdAt:
        source?.meta?.createdAt ??
        source.createdAt ??
        nowIso(),

      updatedAt:
        nowIso(),

    },


    activeDayId:
      findLegacyActiveDayId(
        source,
        days
      ),


    /*
      Inventario actual.
    */

    inventory:
      findLegacyInventory(
        source
      ),


    /*
      Versiones anteriores no tenían necesariamente
      estas dos bolsas.

      Si existen las migramos.
      Si no existen empiezan en $0.
    */

    wallets:
      migrateLegacyWallets(
        source
      ),


    /*
      Conservamos toda la información histórica
      compatible que ya existía.
    */

    days,


    sales:
      cloneData(
        ensureArray(
          source.sales
        )
      ),


    saleLines:
      cloneData(
        ensureArray(
          source.saleLines
        )
      ),


    accounts:
      cloneData(
        ensureArray(
          source.accounts
        )
      ),


    accountBalances:
      cloneData(
        ensureArray(
          source.accountBalances
        )
      ),


    /*
      Nuevos módulos.
    */

    replenishments:
      cloneData(
        ensureArray(
          source.replenishments
        )
      ),


    walletMovements:
      cloneData(
        ensureArray(
          source.walletMovements
        )
      ),


    expenses:
      cloneData(
        ensureArray(
          source.expenses
        )
      ),


    adjustments:
      cloneData(
        ensureArray(
          source.adjustments
        )
      ),


    loans:
      cloneData(
        ensureArray(
          source.loans
        )
      ),


    movements:
      cloneData(
        ensureArray(
          source.movements
        )
      ),


    closings:
      cloneData(
        ensureArray(
          source.closings
        )
      ),


    ui: {

      lastPrice:
        Number(
          source?.ui?.lastPrice ??
          2.25
        ),


      activeView:
        'dashboard',


      historyMode:
        'days',

    },

  };


  console.info(
    `ControlGas: datos migrados desde ${sourceName}.`
  );


  return normalizeStateShape(
    migrated
  );

}



/* =========================================================
   CARGAR ESTADO
========================================================= */

export function loadState() {

  /*
    Si localStorage no está disponible,
    utilizamos estado vacío en memoria.
  */

  if (!isStorageAvailable()) {

    resetState();


    return {

      state:
        getState(),

      source:
        'memory',

      migrated:
        false,

      warnings: [
        'El almacenamiento del navegador no está disponible.',
      ],

    };

  }



  const warnings = [];



  /* =======================================================
     1. BUSCAR V5
  ======================================================= */

  const currentData =
    readStorageKey(
      STORAGE_KEY
    );


  if (
    currentData &&
    looksLikeControlGasData(
      extractStateFromBackup(
        currentData
      )
    )
  ) {

    const extracted =
      extractStateFromBackup(
        currentData
      );


    replaceState(
      normalizeStateShape(
        extracted
      )
    );


    const audit =
      auditState();


    warnings.push(
      ...audit
    );


    return {

      state:
        getState(),

      source:
        STORAGE_KEY,

      migrated:
        false,

      warnings,

    };

  }



  /* =======================================================
     2. BUSCAR VERSIONES ANTERIORES
  ======================================================= */

  for (
    const legacyKey
    of LEGACY_STORAGE_KEYS
  ) {

    const legacyData =
      readStorageKey(
        legacyKey
      );


    if (
      !legacyData ||
      !looksLikeControlGasData(
        extractStateFromBackup(
          legacyData
        )
      )
    ) {

      continue;

    }


    const extracted =
      extractStateFromBackup(
        legacyData
      );


    const migrated =
      migrateLegacyState(
        extracted,
        legacyKey
      );


    replaceState(
      migrated
    );


    /*
      Guardamos una NUEVA copia V5.

      NO eliminamos V4/V3.
    */

    saveState();


    warnings.push(
      `Se encontraron datos antiguos en ${legacyKey} y se creó una copia V5.`
    );


    /*
      Si la versión vieja no tenía bolsas,
      lo informamos en consola.
    */

    if (
      !extracted.wallets &&
      !extracted.replacementWallets &&
      !extracted.reserveWallets
    ) {

      warnings.push(
        'La versión anterior no tenía bolsas de reposición separadas; comienzan en $0.00.'
      );

    }


    return {

      state:
        getState(),

      source:
        legacyKey,

      migrated:
        true,

      warnings,

    };

  }



  /* =======================================================
     3. NO HAY DATOS
  ======================================================= */

  resetState();


  saveState();


  return {

    state:
      getState(),

    source:
      'new',

    migrated:
      false,

    warnings: [],

  };

}



/* =========================================================
   CREAR PAQUETE DE RESPALDO
========================================================= */

export function createBackupPackage() {

  return {

    backup: {

      app:
        APP_CONFIG.name,

      appVersion:
        APP_CONFIG.version,

      schemaVersion:
        APP_CONFIG.schemaVersion,

      exportedAt:
        nowIso(),

    },


    data:
      getStateSnapshot(),

  };

}



/* =========================================================
   NOMBRE DEL RESPALDO
========================================================= */

function createBackupFileName() {

  const date =
    getLocalDateKey();


  const time =
    new Date()

      .toLocaleTimeString(
        'es-EC',
        {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }
      )

      .replaceAll(
        ':',
        '-'
      );


  return (
    `ControlGas_respaldo_${date}_${time}.json`
  );

}



/* =========================================================
   EXPORTAR RESPALDO
========================================================= */

export function exportBackup() {

  const backup =
    createBackupPackage();


  const json =
    JSON.stringify(
      backup,
      null,
      2
    );


  const blob =
    new Blob(
      [json],
      {
        type:
          'application/json;charset=utf-8',
      }
    );


  const url =
    URL.createObjectURL(
      blob
    );


  const link =
    document.createElement(
      'a'
    );


  link.href =
    url;


  link.download =
    createBackupFileName();


  document.body.appendChild(
    link
  );


  link.click();


  link.remove();


  setTimeout(
    () => {

      URL.revokeObjectURL(
        url
      );

    },
    1000
  );


  return true;

}



/* =========================================================
   PREPARAR DATOS IMPORTADOS
========================================================= */

function prepareImportedState(
  parsed
) {

  const extracted =
    extractStateFromBackup(
      parsed
    );


  if (
    !looksLikeControlGasData(
      extracted
    )
  ) {

    throw new Error(
      'El archivo seleccionado no parece ser un respaldo válido de ControlGas.'
    );

  }


  const schemaVersion =
    getSchemaVersion(
      extracted
    );


  /*
    V5 o superior compatible.
  */

  if (
    schemaVersion >=
    APP_CONFIG.schemaVersion
  ) {

    return normalizeStateShape(
      extracted
    );

  }


  /*
    V3 / V4 o respaldo sin versión.
  */

  return migrateLegacyState(
    extracted,
    `respaldo versión ${
      schemaVersion || 'antigua'
    }`
  );

}



/* =========================================================
   IMPORTAR RESPALDO DESDE ARCHIVO
========================================================= */

export async function importBackupFile(
  file
) {

  if (!file) {

    throw new Error(
      'No se seleccionó ningún archivo.'
    );

  }


  const text =
    await file.text();


  let parsed;


  try {

    parsed =
      JSON.parse(text);

  }
  catch (error) {

    console.error(
      'JSON inválido:',
      error
    );


    throw new Error(
      'El archivo no contiene un JSON válido.'
    );

  }


  const importedState =
    prepareImportedState(
      parsed
    );


  /*
    Antes de reemplazar los datos actuales,
    conservamos una copia en memoria.

    Si el guardado falla podemos restaurarla.
  */

  const previousState =
    getStateSnapshot();


  try {

    replaceState(
      importedState
    );


    saveState();

  }
  catch (error) {

    /*
      Restaurar lo anterior si ocurre
      un problema durante la importación.
    */

    replaceState(
      previousState
    );


    try {

      saveState();

    }
    catch {

      /*
        Si también falla el segundo guardado,
        mantenemos al menos el estado en memoria.
      */

    }


    throw error;

  }


  return {

    state:
      getState(),

    warnings:
      auditState(),

  };

}



/* =========================================================
   IMPORTAR DESDE TEXTO JSON
========================================================= */

/*
  Esta función también será útil para pruebas.
*/

export function importBackupText(
  jsonText
) {

  let parsed;


  try {

    parsed =
      JSON.parse(
        jsonText
      );

  }
  catch {

    throw new Error(
      'El texto no contiene un JSON válido.'
    );

  }


  const importedState =
    prepareImportedState(
      parsed
    );


  replaceState(
    importedState
  );


  saveState();


  return getState();

}



/* =========================================================
   BORRAR SOLO V5
========================================================= */

export function removeCurrentStorage() {

  if (!isStorageAvailable()) {

    resetState();

    return;

  }


  localStorage.removeItem(
    STORAGE_KEY
  );


  resetState();

}



/* =========================================================
   BORRAR DATOS DE CONTROLGAS
========================================================= */

/*
  Por seguridad, de forma predeterminada
  NO eliminamos V3 ni V4.

  Esto evita destruir accidentalmente
  información antigua después de una migración.
*/

export function clearControlGasData({

  includeLegacy = false,

} = {}) {

  if (isStorageAvailable()) {

    localStorage.removeItem(
      STORAGE_KEY
    );


    if (includeLegacy) {

      LEGACY_STORAGE_KEYS.forEach(
        key => {

          localStorage.removeItem(
            key
          );

        }
      );

    }

  }


  resetState();


  return getState();

}



/* =========================================================
   COPIA DE SEGURIDAD DE LA BASE ANTIGUA
========================================================= */

/*
  Devuelve información de qué claves existen.

  No modifica nada.
*/

export function getStorageStatus() {

  const result = {

    current: false,

    legacy: {},

  };


  if (!isStorageAvailable()) {

    return result;

  }


  result.current =
    Boolean(
      localStorage.getItem(
        STORAGE_KEY
      )
    );


  LEGACY_STORAGE_KEYS.forEach(
    key => {

      result.legacy[key] =
        Boolean(
          localStorage.getItem(
            key
          )
        );

    }
  );


  return result;

}