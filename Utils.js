// ============================================================
// Utils.gs — Modulo base: helpers, Gemini API, cache, respuestas
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// CAMBIOS v2:
// - CONFIG.DEPORTES_CODIGO agregado (claves cortas para id_equipo)
// - generarIdEquipo() nueva funcion clave
// - GRUPOS ahora se usa junto con DEPORTES para formar equipos
// - inicializarSpreadsheet() agrega columnas deporte y nivel
// ------------------------------------------------------------
// AUDITORIA v3 (2026-04-10):
// - ESTADOS_PARTIDO: agregado "Oculto" para control de visibilidad
// - leerHoja(): normaliza Date objects de Sheets a strings seguros
// - _normalizarCeldaSheets(): helper de normalizacion de tipos
// - log(): escribe en BD_Logs (hoja oculta) ademas de Logger
// - limpiarLogsAntiguos(): mantenimiento de BD_Logs
// ============================================================


// ============================================================
// CONFIGURACION GLOBAL DEL SISTEMA
// ============================================================

var CONFIG = {
  NOMBRE_TORNEO    : "Mundial GABO 2026",
  INSTITUCION      : "I.E. GABO",
  CIUDAD           : "Cartago, Valle del Cauca",
  DOCENTE          : "Elkin Dario Florez Valderrama",
  JORNADA          : "Tarde",
  ANIO             : 2026,
  VERSION          : "3.0",

  SPREADSHEET_NAME : "Mundial GABO 2026 - Base de Datos",

  HOJAS: {
    EQUIPOS          : "IC_Equipos",
    JUGADORES        : "IC_Jugadores",
    PARTIDOS         : "IC_Partidos",
    GOLEADORES       : "IC_Goleadores",
    TABLA_POSICIONES : "IC_Tabla_Posiciones",
    REPECHAJE        : "IC_Repechaje",
    PREMIOS          : "IC_Premios",
    NOTICIAS         : "BD_Noticias",
    PRESELECCION     : "IC_Preseleccion",
    CONFIG           : "IC_Config",
    SANCIONES        : "IC_Sanciones",
    FICHAS_PARTIDO   : "IC_FichasPartido"
  },

  ESTADOS_PARTIDO: {
    PROGRAMADO    : "Programado",
    EN_JUEGO      : "En juego",
    MEDIO_TIEMPO  : "Medio tiempo",
    FINALIZADO    : "Finalizado",
    APLAZADO      : "Aplazado",
    SUSPENDIDO    : "Suspendido",
    WO            : "W.O.",
    OCULTO        : "Oculto"   // Partidos en borrador — NO visibles al publico
  },

  GRADOS: {
    PRIMARIA    : ["3","4","5"],
    BACHILLERATO: ["6","7"]
  },

  GRUPOS: {
    "3": ["301","302","303","304"],
    "4": ["401","402","403","404"],
    "5": ["501","502","503","504"],
    "6": ["601","602","603"],
    "7": ["702","703","704"]
  },

  // Deportes por nivel
  DEPORTES: {
    PRIMARIA    : ["Mini Futsal","Mini Voleibol"],
    BACHILLERATO: ["Futsal","Voleibol"]
  },

  // Codigos cortos para construir id_equipo = grupo + "_" + codigo
  // Ejemplo: 301 jugando Mini Futsal → id = "301_MF"
  DEPORTES_CODIGO: {
    "Mini Futsal"   : "MF",
    "Mini Voleibol" : "MV",
    "Futsal"        : "FS",
    "Voleibol"      : "VB"
  },

  PUNTOS: {
    VICTORIA : 3,
    EMPATE   : 1,
    DERROTA  : 0
  }
};


// ============================================================
// FUNCION CLAVE — ID DE EQUIPO
// ============================================================

function generarIdEquipo(grupo, deporte) {
  var codigo = CONFIG.DEPORTES_CODIGO[deporte];
  if (!codigo) {
    throw new Error("Deporte no reconocido en DEPORTES_CODIGO: " + deporte);
  }
  return String(grupo) + "_" + codigo;
}

function getDeportesGrupo(grupo) {
  var grado = getGradoGrupo(grupo);
  if (CONFIG.GRADOS.PRIMARIA.indexOf(grado) !== -1) {
    return CONFIG.DEPORTES.PRIMARIA;
  }
  return CONFIG.DEPORTES.BACHILLERATO;
}


// ============================================================
// CACHE DEL SPREADSHEET
// ============================================================

var _spreadsheetCache = null;

function getSpreadsheet() {
  if (_spreadsheetCache) return _spreadsheetCache;

  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty("SPREADSHEET_ID");

  if (ssId) {
    try {
      _spreadsheetCache = SpreadsheetApp.openById(ssId);
      return _spreadsheetCache;
    } catch (e) {
      Logger.log("Cache SS por ID fallo: " + e.message);
    }
  }

  var archivos = DriveApp.getFilesByName(CONFIG.SPREADSHEET_NAME);
  if (!archivos.hasNext()) {
    throw new Error("No se encontro el Spreadsheet: " + CONFIG.SPREADSHEET_NAME);
  }
  _spreadsheetCache = SpreadsheetApp.openById(archivos.next().getId());
  props.setProperty("SPREADSHEET_ID", _spreadsheetCache.getId());
  return _spreadsheetCache;
}

function invalidarCacheSpreadsheet() {
  _spreadsheetCache = null;
}

function getHoja(nombreHoja) {
  var ss     = getSpreadsheet();
  var nombre = CONFIG.HOJAS[nombreHoja];
  if (!nombre) throw new Error("Hoja no reconocida: " + nombreHoja);
  var hoja = ss.getSheetByName(nombre);
  if (!hoja) throw new Error("Hoja no encontrada en Sheets: " + nombre);
  return hoja;
}


// ============================================================
// NORMALIZACION DE TIPOS — Fix critico de fechas
// ============================================================

/**
 * Convierte los tipos que Sheets devuelve en getValues() a tipos
 * seguros para JSON y el frontend.
 * - Date con año > 1900 → "YYYY-MM-DD"
 * - Date con año 1899/1900 (hora pura de Sheets) → "HH:MM"
 * - null/undefined → ""
 * - Cualquier otro valor → sin cambio
 *
 * @param  {*}      valor  - Valor crudo de getValues()
 * @param  {string} enc    - Nombre de columna normalizado (reservado)
 * @return {string|number|boolean}
 */
function _normalizarCeldaSheets(valor, enc) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === 'string') return valor.trim();
  if (!(valor instanceof Date)) return valor;

  var anio = valor.getFullYear();

  // Hora pura: Sheets usa fecha base 30/12/1899 (compatible con Excel)
  if (anio <= 1900) {
    var hh = valor.getHours();
    var mm = valor.getMinutes();
    return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }

  // Fecha: convertir a YYYY-MM-DD usando valores locales (sin UTC shift)
  var y = valor.getFullYear();
  var m = valor.getMonth() + 1;
  var d = valor.getDate();
  return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
}


// ============================================================
// CRUD GENERICO
// ============================================================

function invalidarCacheHoja(nombreHoja) {
  try {
    CacheService.getScriptCache().remove("HOJA_" + nombreHoja);
  } catch (e) {}
}

/**
 * Lee una hoja completa y retorna array de objetos.
 * v3: normaliza Date objects de Sheets a strings seguros (fix bug pantalla cargando).
 * @param {string} nombreHoja - Clave en CONFIG.HOJAS
 * @return {Array.<Object>}
 */
function leerHoja(nombreHoja) {
  var cache = CacheService.getScriptCache();
  var cacheKey = "HOJA_" + nombreHoja;
  var cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  var hoja  = getHoja(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  if (!datos || datos.length < 2) return [];

  // Normalizar encabezados: minusculas + guion bajo
  var encabezadosRaw = datos[0];
  var encabezados = encabezadosRaw.map(function(h) {
    return String(h || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i")
      .replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");
  });

  var resultado = [];

  for (var i = 1; i < datos.length; i++) {
    var fila  = datos[i];
    // Saltar filas donde TODAS las celdas estan vacias
    var vacia = true;
    for (var j = 0; j < fila.length; j++) {
      if (fila[j] !== "" && fila[j] !== null && fila[j] !== undefined) {
        vacia = false; break;
      }
    }
    if (vacia) continue;

    var objeto = {};
    for (var k = 0; k < encabezados.length; k++) {
      // FIX CRITICO: normalizar Date objects de Sheets a strings
      objeto[encabezados[k]] = _normalizarCeldaSheets(fila[k], encabezados[k]);
    }
    resultado.push(objeto);
  }

  try { cache.put(cacheKey, JSON.stringify(resultado), 60); } catch (e) {}
  return resultado;
}

function agregarFila(nombreHoja, valores) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja       = getHoja(nombreHoja);
    var ultimaFila = hoja.getLastRow() + 1;
    hoja.getRange(ultimaFila, 1, 1, valores.length).setValues([valores]);
    invalidarCacheHoja(nombreHoja);
    SpreadsheetApp.flush();
    return ultimaFila;
  } finally {
    lock.releaseLock();
  }
}

function actualizarFila(nombreHoja, numeroFila, valores) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = getHoja(nombreHoja);
    hoja.getRange(numeroFila, 1, 1, valores.length).setValues([valores]);
    invalidarCacheHoja(nombreHoja);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function actualizarCelda(nombreHoja, fila, columna, valor) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var hoja = getHoja(nombreHoja);
    hoja.getRange(fila, columna).setValue(valor);
    invalidarCacheHoja(nombreHoja);
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

function buscarFila(nombreHoja, columnaKey, valorBuscar) {
  var hoja   = getHoja(nombreHoja);
  var datos  = hoja.getDataRange().getValues();
  if (!datos || datos.length < 2) return null;

  var encabezadosRaw = datos[0];
  var encabezados    = encabezadosRaw.map(function(h) {
    return String(h || "")
      .trim().toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i")
      .replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");
  });

  var columnaKeyNorm = String(columnaKey || "")
    .trim().toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i")
    .replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");

  var indiceColumna = encabezados.indexOf(columnaKeyNorm);
  if (indiceColumna === -1) {
    throw new Error(
      "Columna no encontrada: '" + columnaKey + "' en " + nombreHoja +
      " (buscada como '" + columnaKeyNorm + "'). " +
      "Encabezados disponibles: [" + encabezadosRaw.join(" | ") + "]"
    );
  }

  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][indiceColumna]).trim() === String(valorBuscar).trim()) {
      var objeto = {};
      for (var j = 0; j < encabezados.length; j++) {
        objeto[encabezados[j]] = _normalizarCeldaSheets(datos[i][j], encabezados[j]);
      }
      return { fila: i + 1, datos: objeto };
    }
  }
  return null;
}


// ============================================================
// ID UNICO GENERICO
// ============================================================

function generarId(prefijo) {
  var ts  = new Date().getTime();
  var rnd = Math.floor(Math.random() * 9000) + 1000;
  return prefijo + "_" + ts + "_" + rnd;
}


// ============================================================
// FECHAS
// ============================================================

function fechaHoraActual() {
  var ahora  = new Date();
  var offset = -5 * 60;
  var utc    = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
  var col    = new Date(utc + (offset * 60000));
  return (
    col.getFullYear() + "-" +
    pad2(col.getMonth() + 1) + "-" +
    pad2(col.getDate()) + " " +
    pad2(col.getHours()) + ":" +
    pad2(col.getMinutes()) + ":" +
    pad2(col.getSeconds())
  );
}

function fechaActual() { return fechaHoraActual().split(" ")[0]; }

function formatearFecha(fecha) {
  if (!fecha || !(fecha instanceof Date)) return "";
  return pad2(fecha.getDate()) + "/" + pad2(fecha.getMonth() + 1) + "/" +
         fecha.getFullYear() + " " + pad2(fecha.getHours()) + ":" + pad2(fecha.getMinutes());
}

function pad2(n) { return n < 10 ? "0" + n : String(n); }


// ============================================================
// RESPUESTAS ESTANDAR
// ============================================================

function respuestaExito(datos, mensaje) {
  return { ok: true, datos: datos || null, mensaje: mensaje || "OK", timestamp: fechaHoraActual() };
}

function respuestaError(mensaje, codigo) {
  return { ok: false, datos: null, mensaje: mensaje || "Error", codigo: codigo || "ERROR", timestamp: fechaHoraActual() };
}

function jsonOutput(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// SISTEMA DE LOGS PERSISTENTE
// ============================================================

/**
 * Registra un evento en Logger.log() Y en la hoja oculta BD_Logs.
 * Solo persiste en Sheets si nivel es WARN/ERROR (o si LOG_DEBUG_MODE="si").
 *
 * Para activar logs INFO:
 *   PropertiesService.getScriptProperties().setProperty("LOG_DEBUG_MODE","si")
 *
 * @param {string} modulo  - Nombre del modulo (ej: "Motor_Calendario")
 * @param {string} mensaje - Descripcion del evento
 * @param {string} nivel   - "INFO" | "WARN" | "ERROR"
 */
function log(modulo, mensaje, nivel) {
  var lvl = nivel || "INFO";
  var ts  = fechaHoraActual();

  // Siempre loguear en Logger (visible en editor GAS, desaparece al cerrar)
  Logger.log("[" + ts + "] [" + lvl + "] [" + modulo + "] " + mensaje);

  // Solo persistir en Sheets si es WARN/ERROR o modo debug activo
  try {
    var props     = PropertiesService.getScriptProperties();
    var debugMode = props.getProperty("LOG_DEBUG_MODE") || "no";
    if (lvl === "INFO" && debugMode !== "si") return;

    var ss   = getSpreadsheet();
    var hoja = ss.getSheetByName("BD_Logs");

    // Auto-crear hoja de logs si no existe
    if (!hoja) {
      hoja = ss.insertSheet("BD_Logs");
      hoja.getRange(1, 1, 1, 5)
          .setValues([["timestamp","nivel","modulo","mensaje","version"]])
          .setFontWeight("bold")
          .setBackground("#1a1a2e")
          .setFontColor("#ffffff");
      hoja.hideSheet(); // Ocultar a usuarios finales
      Logger.log("[LOG_SYSTEM] Hoja BD_Logs creada y ocultada.");
    }

    // Limitar a 500 registros para evitar crecimiento infinito
    var totalFilas = hoja.getLastRow();
    if (totalFilas > 500) {
      hoja.deleteRows(2, totalFilas - 500);
    }

    hoja.appendRow([ts, lvl, modulo, String(mensaje).substring(0, 500), CONFIG.VERSION]);

  } catch (eLog) {
    // El sistema de logs nunca debe romper la aplicacion
    Logger.log("[LOG_ERROR] No se pudo escribir en BD_Logs: " + eLog.message);
  }
}

/**
 * Limpia manualmente la hoja BD_Logs, manteniendo los ultimos 200 registros.
 * Ejecutar desde el menu de Sheets si la hoja crece demasiado.
 */
function limpiarLogsAntiguos() {
  try {
    var ss   = getSpreadsheet();
    var hoja = ss.getSheetByName("BD_Logs");
    if (!hoja) { Logger.log("BD_Logs no existe."); return; }

    var totalFilas = hoja.getLastRow();
    var maxLogs    = 200;

    if (totalFilas > maxLogs + 1) {
      var filasAEliminar = totalFilas - maxLogs;
      hoja.deleteRows(2, filasAEliminar);
      Logger.log("BD_Logs limpiado: " + filasAEliminar + " entradas eliminadas.");
      SpreadsheetApp.getUi().alert("BD_Logs: " + filasAEliminar + " entradas antiguas eliminadas.");
    } else {
      SpreadsheetApp.getUi().alert("BD_Logs esta dentro del limite (" + (totalFilas - 1) + " registros).");
    }
  } catch (e) {
    Logger.log("limpiarLogsAntiguos error: " + e.message);
  }
}


// ============================================================
// GEMINI API
// ============================================================

/**
 * Llama a Gemini (texto puro, sin imagen).
 * Incluye Exponential Backoff ante errores 503/429.
 * @param {string} prompt    - Prompt de texto
 * @param {number} maxTokens - Limite de tokens de salida (default 1024)
 * @return {string} Texto generado
 */
function llamarGemini(prompt, maxTokens) {
  var props  = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en PropertiesService.");

  var tokens = maxTokens || 1024;
  var url    = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: tokens, temperature: 0.7 }
  };

  var opciones = {
    method            : "post",
    contentType       : "application/json",
    payload           : JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var MAX_INTENTOS   = 4;
  var ESPERA_BASE_MS = 2000; // 2s -> 4s -> 8s

  for (var intento = 1; intento <= MAX_INTENTOS; intento++) {
    var resp   = UrlFetchApp.fetch(url, opciones);
    var code   = resp.getResponseCode();
    var cuerpo = resp.getContentText();

    if (code === 200) {
      var json = JSON.parse(cuerpo);
      if (
        json && json.candidates && json.candidates[0] &&
        json.candidates[0].content && json.candidates[0].content.parts &&
        json.candidates[0].content.parts[0]
      ) {
        return json.candidates[0].content.parts[0].text;
      }
      throw new Error("Respuesta inesperada de Gemini: " + cuerpo.slice(0, 200));
    }

    if ((code === 503 || code === 429) && intento < MAX_INTENTOS) {
      var espera = ESPERA_BASE_MS * Math.pow(2, intento - 1);
      log("Utils", "llamarGemini error " + code + " (intento " + intento + "/" + MAX_INTENTOS + "). Reintentando en " + (espera/1000) + "s...", "WARN");
      Utilities.sleep(espera);
      continue;
    }

    throw new Error("Gemini API error " + code + ": " + cuerpo.slice(0, 300));
  }

  throw new Error("Gemini no respondio tras " + MAX_INTENTOS + " intentos. Intenta de nuevo.");
}

function asignarPaisesConIA(solicitudes) {
  var listaSolicitudes = "";
  for (var i = 0; i < solicitudes.length; i++) {
    var s = solicitudes[i];
    listaSolicitudes = listaSolicitudes +
      "- Grupo " + s.grupo + " (" + s.deporte + ")" +
      " opcion A: " + s.opcionA +
      ", B: " + s.opcionB +
      ", C: " + s.opcionC + "\n";
  }

  var prompt =
    "Eres el asistente oficial del torneo 'Mundial GABO 2026' en Cartago, Colombia.\n\n" +
    "Asigna un pais del mundo a cada combinacion grupo-deporte, con estas reglas:\n" +
    "1. Respetar preferencias (A > B > C).\n" +
    "2. Ningun pais puede repetirse en todo el torneo.\n" +
    "3. Grado 3 -> Sudamerica o Caribe.\n" +
    "4. Grado 4 -> Norte o Centroamerica.\n" +
    "5. Grado 5 -> Europa occidental.\n" +
    "6. Grado 6 -> Europa del Este o Asia.\n" +
    "7. Grado 7 -> Africa, Oceania o Medio Oriente.\n" +
    "8. El deporte no afecta la asignacion de pais; el criterio es el grado.\n\n" +
    "Solicitudes:\n" + listaSolicitudes + "\n" +
    "Responde SOLO con JSON, sin texto adicional, formato:\n" +
    "{ \"301_MF\": { \"pais\": \"Brasil\", \"bandera\": \"BR\", \"continente\": \"Sudamerica\" } }\n" +
    "La clave es id_equipo (grupo + _ + codigo deporte: MF, MV, FS, VB).\n" +
    "'bandera' es codigo ISO 3166-1 alpha-2.";

  var textoRespuesta = llamarGemini(prompt, 2048);
  var jsonTexto = textoRespuesta.trim().replace(/```json/g,"").replace(/```/g,"").trim();
  try {
    return JSON.parse(jsonTexto);
  } catch (e) {
    throw new Error("Gemini no retorno JSON valido. Respuesta: " + textoRespuesta);
  }
}

function analizarJugadorConIA(jugador, estadisticas) {
  var statsTexto = "";
  for (var k in estadisticas) { statsTexto = statsTexto + k + ": " + estadisticas[k] + "\n"; }

  var prompt =
    "Eres asistente deportivo del 'Mundial GABO 2026'.\n\n" +
    "Genera una nota breve (3-4 oraciones) sobre el jugador para posible pre-seleccion a intercolegiados.\n\n" +
    "Jugador: " + jugador.nombre + "\nGrado: " + jugador.grado + "\n" +
    "Posicion: " + jugador.posicion + "\nGenero: " + jugador.genero + "\n\n" +
    "Estadisticas:\n" + statsTexto +
    "\nEscribe en espanol, tono profesional y amigable, contexto escolar colombiano.";

  return llamarGemini(prompt, 512);
}


// ============================================================
// VALIDACIONES
// ============================================================

function grupoValido(grupo) {
  var grado  = String(grupo).charAt(0);
  var grupos = CONFIG.GRUPOS[grado];
  if (!grupos) return false;
  for (var i = 0; i < grupos.length; i++) {
    if (grupos[i] === String(grupo)) return true;
  }
  return false;
}

function deporteValidoParaGrupo(deporte, grupo) {
  var deportes = getDeportesGrupo(grupo);
  for (var i = 0; i < deportes.length; i++) {
    if (deportes[i] === deporte) return true;
  }
  return false;
}

function getNivelGrupo(grupo) {
  var grado = String(grupo).charAt(0);
  for (var i = 0; i < CONFIG.GRADOS.PRIMARIA.length; i++) {
    if (CONFIG.GRADOS.PRIMARIA[i] === grado) return "Primaria";
  }
  for (var j = 0; j < CONFIG.GRADOS.BACHILLERATO.length; j++) {
    if (CONFIG.GRADOS.BACHILLERATO[j] === grado) return "Bachillerato";
  }
  return "Desconocido";
}

function getGradoGrupo(grupo) { return String(grupo).charAt(0); }

function estadoPartidoValido(estado) {
  for (var key in CONFIG.ESTADOS_PARTIDO) {
    if (CONFIG.ESTADOS_PARTIDO[key] === estado) return true;
  }
  return false;
}

function equipoTieneMujer(idEquipo) {
  var jugadores = leerHoja("JUGADORES");
  for (var i = 0; i < jugadores.length; i++) {
    var j = jugadores[i];
    if (String(j.id_equipo) === String(idEquipo)) {
      var genero = String(j.genero).toLowerCase();
      if (genero === "femenino" || genero === "f" || genero === "mujer") return true;
    }
  }
  return false;
}


// ============================================================
// TABLA DE POSICIONES
// ============================================================

function diferenciaGoles(gf, gc) { return (gf || 0) - (gc || 0); }

function ordenarTabla(equipos) {
  return equipos.slice().sort(function(a, b) {
    if ((b.puntos || 0) !== (a.puntos || 0)) return (b.puntos || 0) - (a.puntos || 0);
    if ((b.dg || 0) !== (a.dg || 0))         return (b.dg || 0) - (a.dg || 0);
    if ((b.gf || 0) !== (a.gf || 0))         return (b.gf || 0) - (a.gf || 0);
    var na = String(a.nombre || "").toLowerCase();
    var nb = String(b.nombre || "").toLowerCase();
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
}


// ============================================================
// CONFIG DEL TORNEO (IC_Config)
// ============================================================

function getConfig(clave, valorPorDefecto) {
  try {
    var configs = leerHoja("CONFIG");
    for (var i = 0; i < configs.length; i++) {
      if (String(configs[i].clave) === String(clave)) return configs[i].valor;
    }
  } catch (e) { Logger.log("Error leyendo config '" + clave + "': " + e.message); }
  return (valorPorDefecto !== undefined) ? valorPorDefecto : null;
}

function setConfig(clave, valor) {
  var resultado = buscarFila("CONFIG", "clave", clave);
  if (resultado) {
    actualizarCelda("CONFIG", resultado.fila, 2, valor);
  } else {
    agregarFila("CONFIG", [clave, valor, fechaHoraActual()]);
  }
}


// ============================================================
// INICIALIZACION DEL SPREADSHEET
// ============================================================

function inicializarSpreadsheet() {
  var ss = getSpreadsheet();

  var estructuras = {
    IC_Equipos: [
      "id_equipo","grupo","grado","nivel","deporte",
      "nombre_equipo","pais","bandera_codigo","color_camiseta","capitan",
      "fecha_inscripcion","pais_opcionA","pais_opcionB","pais_opcionC","estado"
    ],
    IC_Jugadores: [
      "id_jugador","id_equipo","grupo","deporte","nombre_completo","genero",
      "numero_camiseta","posicion","autoriza_imagen","fecha_registro"
    ],
    IC_Partidos: [
      "id_partido","fecha","hora","grado","nivel","deporte","fase",
      "id_equipo_local","grupo_local","pais_local","bandera_local",
      "id_equipo_visitante","grupo_visitante","pais_visitante","bandera_visitante",
      "goles_local","goles_visitante","estado","motivo_aplazado",
      "nueva_fecha_aplazado","arbitro","observaciones","fecha_registro","fecha_actualizacion",
      "numero_orden","aplazado_reprogramado"
    ],
    IC_Goleadores: [
      "id_gol","id_partido","id_jugador","id_equipo","grupo",
      "nombre_jugador","goles","deporte","fecha_partido"
    ],
    IC_Tabla_Posiciones: [
      "id","grado","deporte","id_equipo","grupo","pais","bandera",
      "pj","pg","pe","pp","gf","gc","dg","puntos","posicion","fecha_actualizacion"
    ],
    IC_Repechaje: [
      "id_repechaje","numero_partido","id_equipo_a","grupo_a","pais_a",
      "refuerzos_a","id_equipo_b","grupo_b","pais_b","refuerzos_b",
      "goles_a","goles_b","estado","observaciones_docente","fecha"
    ],
    IC_Premios: [
      "id_premio","categoria","descripcion","id_ganador","nombre_ganador",
      "grupo","pais","bandera","valor","fecha_entrega","observaciones"
    ],
    BD_Noticias: [
      "id_noticia","titulo","contenido","categoria","imagen_url",
      "autor","fecha_publicacion","activa","destacada"
    ],
    IC_Preseleccion: [
      "id_pre","id_jugador","nombre_jugador","grupo","pais","posicion",
      "genero","observaciones_docente","analisis_ia","fecha_marcado"
    ],
    IC_Config: ["clave","valor","fecha_actualizacion"],
    IC_Sanciones: [
      "id_sancion","id_partido","id_jugador","id_equipo","grupo","deporte",
      "tipo_tarjeta","minuto","descripcion","fecha_partido","fecha_registro"
    ],
    IC_FichasPartido: [
      "id_ficha","id_partido","grupo_local","grupo_visitante","deporte",
      "goles_local","goles_visitante","goleadores_local","goleadores_visitante",
      "faltas_local","faltas_visitante",
      "tarjetas_amarillas_local","tarjetas_amarillas_visitante",
      "tarjetas_rojas_local","tarjetas_rojas_visitante",
      "puntos_local","puntos_visitante",
      "sets_local","sets_visitante",
      "arbitro","observaciones","fuente","fecha_escaneado","fecha_registro"
    ]
  };

  for (var nombreHoja in estructuras) {
    var hoja = ss.getSheetByName(nombreHoja);
    if (!hoja) {
      hoja = ss.insertSheet(nombreHoja);
      Logger.log("Hoja creada: " + nombreHoja);
    }
    if (hoja.getLastRow() === 0) {
      var encabezados = estructuras[nombreHoja];
      hoja.getRange(1, 1, 1, encabezados.length)
          .setValues([encabezados])
          .setFontWeight("bold")
          .setBackground("#003380")
          .setFontColor("#ffffff");
    }
  }

  setConfig("nombre_torneo",  CONFIG.NOMBRE_TORNEO);
  setConfig("institucion",    CONFIG.INSTITUCION);
  setConfig("docente",        CONFIG.DOCENTE);
  setConfig("fase_actual",    "inscripcion");
  setConfig("torneo_activo",  "true");

  Logger.log("Inicializacion completada (v3 con log persistente y normalizacion de fechas).");
  return respuestaExito(null, "Spreadsheet inicializado correctamente (v3).");
}


// ============================================================
// HELPERS ADICIONALES
// ============================================================

function calcularHora(horaBase, minutosExtra) {
  if (!horaBase) return "";
  var partes    = horaBase.split(":");
  var horas     = parseInt(partes[0]) || 0;
  var minutos   = parseInt(partes[1]) || 0;
  var total     = horas * 60 + minutos + minutosExtra;
  return pad2(Math.floor(total / 60) % 24) + ":" + pad2(total % 60);
}
