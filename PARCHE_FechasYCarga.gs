// ============================================================
// PARCHE_FechasYCarga.gs  — Corrección crítica de producción
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// BUGS CORREGIDOS:
//
//  BUG #1 — ROOT CAUSE — "Pantalla cargando infinita"
//  ─────────────────────────────────────────────────
//  Origen: reprogramarCalendario() escribió fechas como strings
//  "YYYY-MM-DD" en la columna `fecha` de IC_Partidos.
//  Google Sheets AUTOCONVIERTE cualquier texto con formato de fecha
//  a un objeto Date interno. Cuando leerHoja() llama a
//  hoja.getDataRange().getValues(), esa celda llega al backend
//  como un objeto Date de JavaScript, NO como string.
//
//  Consecuencia en cadena:
//    leerHoja()          → objeto[fecha] = Date(2026, 3, 10)   ← Date nativo
//    respuestaExito()    → serializa a JSON via GAS
//    GAS JSON serializer → convierte Date a "2026-04-10T05:00:00.000Z"
//    Frontend recibe     → string ISO con "T" y "Z"
//    formatFecha(f)      → hace split("-") → ["2026","04","10T05:00:00.000Z"]
//    p[2]                → "10T05:00:00.000Z"  ← BASURA
//    formatFechaCorta()  → idéntico problema
//    formatFechaTexto()  → new Date("2026-04-10T05:00:00.000Z") → OK pero
//                          zona horaria UTC-5 lo convierte al día ANTERIOR
//
//  Impacto: getProximosPartidos() ordena con String(Date) que da
//  "Fri Apr 10 2026 00:00:00 GMT..." → la comparación de strings falla
//  → los partidos "próximos" nunca se muestran → spinner infinito.
//
//  FIX: Normalizar TODOS los valores de celdas fecha en leerHoja()
//  convirtiéndolos a string "YYYY-MM-DD" antes de devolver el objeto.
//  Solución aplicada en _normalizarValor() integrada en leerHoja().
//
//  BUG #2 — "hora" también llega como Date object
//  ───────────────────────────────────────────────
//  Sheets también convierte "15:45" a objeto de tiempo interno.
//  Al serializar: "1899-12-30T20:45:00.000Z" (fecha cero de Excel + hora)
//  Frontend muestra "1899-12-30T20:45:..." en vez de "15:45".
//  FIX: Detectar Date objects cuyo año es 1899 (fecha cero de Sheets)
//  y extraer solo HH:MM.
//
//  BUG #3 — frontend: formatFechaTexto con timezone offset
//  ────────────────────────────────────────────────────────
//  new Date("2026-04-10") en UTC-5 crea el 9 de abril a las 19:00
//  → toLocaleDateString devuelve "9 de abril" en vez de "10 de abril".
//  FIX en frontend: parsear YYYY-MM-DD manualmente sin pasar por Date.
//
//  BUG #4 — leerHoja omite filas válidas con numero_orden = 0
//  ────────────────────────────────────────────────────────────
//  La lógica "fila vacía" evalúa if(fila[j]) → 0 es falsy en JS.
//  Si numero_orden = 0 y es la única celda no-vacía → fila se omite.
//  FIX: chequear !== "" && !== null && !== undefined (ya existía,
//  pero numero_orden vacío "" pasa el test. OK, este bug es menor).
// ============================================================


// ============================================================
// PASO 1 — REEMPLAZAR leerHoja() en Utils.gs
// ============================================================
// Copia este código completo y REEMPLAZA la función leerHoja()
// existente en Utils.gs. No toques nada más en ese archivo.

/*
function leerHoja(nombreHoja) {
  var hoja  = getHoja(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  if (!datos || datos.length < 2) return [];

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
    var vacia = true;
    for (var j = 0; j < fila.length; j++) {
      if (fila[j] !== "" && fila[j] !== null && fila[j] !== undefined) {
        vacia = false; break;
      }
    }
    if (vacia) continue;

    var objeto = {};
    for (var k = 0; k < encabezados.length; k++) {
      // ── FIX CRÍTICO: normalizar Date objects de Sheets ──
      objeto[encabezados[k]] = _normalizarCeldaSheets(fila[k], encabezados[k]);
    }
    resultado.push(objeto);
  }
  return resultado;
}
*/

// ============================================================
// PASO 2 — AGREGAR _normalizarCeldaSheets() en Utils.gs
// ============================================================
// Agrega esta función nueva al final de Utils.gs
// (o justo antes de leerHoja, donde prefieras).

/*
** Normaliza los valores crudos que devuelve getValues() de Sheets.
** Google Sheets convierte automáticamente:
**   - Celdas con formato fecha   → objeto Date de JS
**   - Celdas con formato hora    → objeto Date de JS (año 1899, fecha cero Excel)
**   - Celdas numéricas           → number
**   - Celdas vacías              → "" (string vacío)
**
** Esta función los convierte a tipos seguros para JSON y el frontend.
**
** @param  {*}      valor      - Valor crudo de getValues()
** @param  {string} encabezado - Nombre normalizado de la columna
** @return {string|number|boolean}
*/

// PEGAR ESTA FUNCIÓN EN Utils.gs:
// function _normalizarCeldaSheets(valor, encabezado) {
//   if (valor === null || valor === undefined) return "";
//
//   if (valor instanceof Date) {
//     // Detectar si es solo hora (fecha cero de Excel/Sheets = año 1899 o 1900)
//     var anio = valor.getFullYear();
//     if (anio === 1899 || anio === 1900) {
//       // Es una hora pura — extraer HH:MM
//       var hh = valor.getHours();
//       var mm = valor.getMinutes();
//       return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
//     }
//     // Es una fecha — convertir a YYYY-MM-DD
//     var y = valor.getFullYear();
//     var m = valor.getMonth() + 1;
//     var d = valor.getDate();
//     return y + "-" + (m < 10 ? "0" : "") + m + "-" + (d < 10 ? "0" : "") + d;
//   }
//
//   return valor;
// }


// ============================================================
// VERSIÓN EJECUTABLE — Función de un solo disparo
// que corrige la hoja IC_Partidos directamente en Sheets,
// convirtiendo todos los Date objects a strings YYYY-MM-DD y HH:MM.
// Ejecutar UNA SOLA VEZ desde el editor de GAS.
// ============================================================

/**
 * CORRECCIÓN DE EMERGENCIA.
 * Lee IC_Partidos, detecta objetos Date en las columnas `fecha` y `hora`,
 * los convierte a strings y los reescribe con setValues().
 * Ejecutar desde: Editor GAS → seleccionar normalizarFechasIC_Partidos → ▶ Ejecutar
 */
function normalizarFechasIC_Partidos() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName("IC_Partidos");

  if (!hoja) {
    Browser.msgBox("❌ Hoja IC_Partidos no encontrada.");
    return;
  }

  var rango  = hoja.getDataRange();
  var datos  = rango.getValues();
  var encabs = datos[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var colFecha = encabs.indexOf("fecha");
  var colHora  = encabs.indexOf("hora");
  var colFechaU = encabs.indexOf("fecha_actualizacion");
  var colFechaR = encabs.indexOf("fecha_registro");

  if (colFecha === -1) {
    Browser.msgBox("❌ Columna 'fecha' no encontrada.");
    return;
  }

  var ahora       = new Date();
  var corregidos  = 0;
  var log_lines   = [];

  for (var i = 1; i < datos.length; i++) {
    var fila     = datos[i];
    var modificada = false;

    // ── Corregir columna `fecha` ──
    if (colFecha !== -1) {
      var vFecha = fila[colFecha];
      if (vFecha instanceof Date && vFecha !== "") {
        var anioF = vFecha.getFullYear();
        var mesF  = vFecha.getMonth() + 1;
        var diaF  = vFecha.getDate();
        var strF  = anioF + "-" + (mesF < 10 ? "0" : "") + mesF + "-" + (diaF < 10 ? "0" : "") + diaF;
        fila[colFecha] = strF;
        log_lines.push("Fila " + (i+1) + " → fecha: " + strF);
        modificada = true;
      }
    }

    // ── Corregir columna `hora` ──
    if (colHora !== -1) {
      var vHora = fila[colHora];
      if (vHora instanceof Date && vHora !== "") {
        var hh   = vHora.getHours();
        var mm   = vHora.getMinutes();
        var strH = (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
        fila[colHora] = strH;
        log_lines.push("Fila " + (i+1) + " → hora: " + strH);
        modificada = true;
      }
    }

    // ── Corregir fecha_actualizacion y fecha_registro si son Date ──
    [colFechaU, colFechaR].forEach(function(col) {
      if (col !== -1 && fila[col] instanceof Date) {
        var d = fila[col];
        // Mantener como string legible "YYYY-MM-DD HH:MM:SS"
        var pad = function(n) { return n < 10 ? "0" + n : String(n); };
        fila[col] = d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate()) +
                    " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
        modificada = true;
      }
    });

    if (modificada) corregidos++;
  }

  // Escribir todo de una vez
  if (corregidos > 0) {
    rango.setValues(datos);
    SpreadsheetApp.flush();
  }

  Logger.log("normalizarFechasIC_Partidos completado:");
  Logger.log("Filas corregidas: " + corregidos);
  log_lines.forEach(function(l) { Logger.log(l); });

  try {
    Browser.msgBox(
      "✅ Corrección completada\n\n" +
      "Filas normalizadas: " + corregidos + "\n" +
      "Las columnas fecha y hora ahora son texto puro YYYY-MM-DD y HH:MM.\n\n" +
      "Revisa el Log (Ver > Registros) para ver el detalle."
    );
  } catch(e) {}
}


// ============================================================
// PASO 3 — CORRECCIONES EN Utils.gs (backend)
// ============================================================
// Reemplaza la función leerHoja() original en Utils.gs con esta versión.
// Esta es la corrección DEFINITIVA y permanente — una vez aplicada,
// no importa cómo Sheets almacene la fecha internamente.

function leerHojaV2(nombreHoja) {
  var hoja  = getHoja(nombreHoja);
  var datos = hoja.getDataRange().getValues();
  if (!datos || datos.length < 2) return [];

  var encabezados = datos[0].map(function(h) {
    return String(h || "")
      .trim().toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i")
      .replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");
  });

  var resultado = [];

  for (var i = 1; i < datos.length; i++) {
    var fila  = datos[i];
    var vacia = true;
    for (var j = 0; j < fila.length; j++) {
      if (fila[j] !== "" && fila[j] !== null && fila[j] !== undefined) {
        vacia = false; break;
      }
    }
    if (vacia) continue;

    var objeto = {};
    for (var k = 0; k < encabezados.length; k++) {
      objeto[encabezados[k]] = _normalizarCeldaSheets(fila[k], encabezados[k]);
    }
    resultado.push(objeto);
  }
  return resultado;
}

/**
 * Convierte los tipos que Sheets devuelve en getValues() a tipos
 * seguros para JSON y el frontend.
 * - Date con año > 1900 → "YYYY-MM-DD"
 * - Date con año 1899/1900 (hora pura) → "HH:MM"
 * - Cualquier otro valor → sin cambio
 * @param  {*}      valor
 * @param  {string} enc   - nombre de columna normalizado (no usado aún, para extensión futura)
 * @return {string|number|boolean}
 */
function _normalizarCeldaSheets(valor, enc) {
  if (valor === null || valor === undefined) return "";
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
// PASO 4 — CORRECCIONES EN EL FRONTEND (HTML modules)
// ============================================================
// Los 3 snippets de abajo van en los archivos HTML indicados.
// Son reemplazos de funciones existentes — busca el nombre de la
// función y reemplaza todo el bloque function...}.

// ── 4A. Reemplazar en Modulo_Fixture.html y Modulo_Partidos.html ──
// Busca: function formatFecha(f) {  →  reemplaza con:

/*
function formatFecha(f) {
  if (!f) return "";
  var s = String(f).trim();

  // Caso normal: "YYYY-MM-DD" o "YYYY-MM-DDTHH:MM..." (ISO con timezone)
  if (s.indexOf("-") !== -1) {
    // Tomar solo la parte de fecha, ignorar parte de tiempo
    var solofecha = s.split("T")[0];
    var p = solofecha.split("-");
    if (p.length === 3) {
      return p[2].substring(0,2) + "/" + p[1] + "/" + p[0];
    }
  }

  // Fallback: devolver el string tal cual
  return s;
}
*/

// ── 4B. Reemplazar en Modulo_Landing.html ──
// Busca: function formatFechaCorta(f) {  →  reemplaza con:

/*
function formatFechaCorta(f) {
  if (!f) return "Por definir";
  var s = String(f).trim().split("T")[0]; // quitar parte de tiempo si viene ISO
  if (s.indexOf("-") !== -1) {
    var p = s.split("-");
    if (p.length >= 3) return p[2].substring(0,2) + "/" + p[1];
  }
  return s;
}
*/

// ── 4C. Reemplazar en Modulo_Landing.html ──
// Busca: function formatFechaTexto(f) {  →  reemplaza con:
// OJO: new Date("YYYY-MM-DD") sufre UTC offset → muestra día anterior en UTC-5.
// Se parsea manualmente para evitar ese bug.

/*
function formatFechaTexto(f) {
  if (!f) return "";
  try {
    var s = String(f).trim().split("T")[0]; // solo YYYY-MM-DD
    var p = s.split("-");
    if (p.length === 3) {
      // Construir Date con hora noon local → evita UTC offset day-shift
      var d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]), 12, 0, 0);
      var opt = { day: "numeric", month: "long" };
      return d.toLocaleDateString("es-CO", opt);
    }
  } catch(e) {}
  return String(f);
}
*/


// ============================================================
// PASO 5 — VERIFICACIÓN POST-CORRECCIÓN
// ============================================================
// Ejecuta esta función después de aplicar los cambios para
// confirmar que la normalización funciona correctamente.

/**
 * Verifica que las fechas en IC_Partidos se lean como strings limpios.
 * Imprime los primeros 10 partidos con sus fechas y horas.
 */
function verificarNormalizacionFechas() {
  var partidos = leerHojaV2("PARTIDOS");

  Logger.log("═══════════════════════════════════════════");
  Logger.log("Verificación de normalización de fechas");
  Logger.log("Total partidos: " + partidos.length);
  Logger.log("───────────────────────────────────────────");

  var muestra = partidos.slice(0, 10);
  for (var i = 0; i < muestra.length; i++) {
    var p = muestra[i];
    Logger.log(
      "ID: " + p.id_partido +
      " | fecha: [" + p.fecha + "] tipo:" + typeof p.fecha +
      " | hora: [" + p.hora + "] tipo:" + typeof p.hora +
      " | estado: " + p.estado
    );
  }

  // Detectar si aún quedan Date objects
  var problemáticos = 0;
  for (var j = 0; j < partidos.length; j++) {
    if (partidos[j].fecha instanceof Date || partidos[j].hora instanceof Date) {
      problemáticos++;
    }
  }

  Logger.log("───────────────────────────────────────────");
  if (problemáticos === 0) {
    Logger.log("✅ TODAS las fechas y horas son strings. Bug corregido.");
  } else {
    Logger.log("❌ Aún hay " + problemáticos + " Date objects. Revisar _normalizarCeldaSheets.");
  }
  Logger.log("═══════════════════════════════════════════");
}


// ============================================================
// RESUMEN DE CAMBIOS A APLICAR
// ============================================================
//
// BACKEND (Google Apps Script):
// ─────────────────────────────
// 1. Utils.gs → Agregar función _normalizarCeldaSheets() (Paso 2/Paso 3)
// 2. Utils.gs → Reemplazar leerHoja() con el código del Paso 3
//    (usa leerHojaV2 como referencia — renómbrala a leerHoja al pegar)
//
// FRONTEND (archivos HTML):
// ─────────────────────────
// 3. Modulo_Fixture.html  → Reemplazar formatFecha()      (Paso 4A)
// 4. Modulo_Partidos.html → Reemplazar formatFecha()      (Paso 4A)
// 5. Modulo_Landing.html  → Reemplazar formatFechaCorta() (Paso 4B)
// 6. Modulo_Landing.html  → Reemplazar formatFechaTexto() (Paso 4C)
//
// EJECUCIÓN ÚNICA (solo si la hoja ya tiene Date objects guardados):
// ──────────────────────────────────────────────────────────────────
// 7. Ejecutar normalizarFechasIC_Partidos() desde el editor GAS
//    (esto arregla los datos ya guardados en la hoja)
//
// VERIFICACIÓN:
// ─────────────
// 8. Ejecutar verificarNormalizacionFechas() para confirmar
//
// ORDEN RECOMENDADO: 7 → 1 → 2 → 3-6 → 8 → probar la plataforma
// ============================================================
