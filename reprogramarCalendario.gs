// ============================================================
// reprogramarCalendario.gs
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// Script AUTÓNOMO: no depende de ningún otro archivo del proyecto.
// Pega este contenido completo en un archivo .gs nuevo o en
// el editor de Apps Script y ejecuta reprogramarCalendario().
//
// COLUMNAS ESPERADAS en IC_Partidos (índice 0-based):
//   0  id_partido          | 1  fecha               | 2  hora
//   3  grado               | 4  nivel               | 5  deporte
//   6  fase                | 7  id_equipo_local      | 8  grupo_local
//   9  pais_local          | 10 bandera_local        | 11 id_equipo_visitante
//   12 grupo_visitante     | 13 pais_visitante       | 14 bandera_visitante
//   15 goles_local         | 16 goles_visitante      | 17 estado
//   18 motivo_aplazado     | 19 nueva_fecha_aplazado | 20 arbitro
//   21 observaciones       | 22 fecha_registro       | 23 fecha_actualizacion
//   24 numero_orden        | 25 aplazado_reprogramado
// ============================================================


// ────────────────────────────────────────────────────────────
// CONSTANTES DE CONFIGURACIÓN
// ────────────────────────────────────────────────────────────

/** Nombre exacto de la hoja en Google Sheets */
var NOMBRE_HOJA_PARTIDOS = "IC_Partidos";

/** Hora fija para todos los partidos (regla de negocio) */
var HORA_FIJA = "15:45";

/**
 * Fecha del primer partido (ya jugado). El algoritmo NO la toca.
 * Formato: "YYYY-MM-DD"
 */
var FECHA_PARTIDO_1_YA_JUGADO = "2026-04-08";

/**
 * Fecha desde la que el motor empieza a asignar (partido #2 en adelante).
 * Regla de negocio: el Voleibol 7° se juega el Viernes 10-Abr-2026.
 */
var FECHA_INICIO_PROGRAMACION = "2026-04-10";

/**
 * Ciclo de rotación estricto (grados de mayor a menor, alternando deporte).
 * El motor recorre este array en loop hasta asignar todos los partidos.
 */
var CICLO = [
  { grado: "7", deporte: "Futsal"        },
  { grado: "7", deporte: "Voleibol"      },
  { grado: "6", deporte: "Futsal"        },
  { grado: "6", deporte: "Voleibol"      },
  { grado: "5", deporte: "Mini Futsal"   },
  { grado: "5", deporte: "Mini Voleibol" },
  { grado: "4", deporte: "Mini Futsal"   },
  { grado: "4", deporte: "Mini Voleibol" },
  { grado: "3", deporte: "Mini Futsal"   },
  { grado: "3", deporte: "Mini Voleibol" }
];

/** Índices de columna (0-based) en IC_Partidos */
var COL = {
  ID_PARTIDO           : 0,
  FECHA                : 1,
  HORA                 : 2,
  GRADO                : 3,
  NIVEL                : 4,
  DEPORTE              : 5,
  FASE                 : 6,
  ESTADO               : 17,
  MOTIVO_APLAZADO      : 18,
  NUEVA_FECHA_APLAZADO : 19,
  FECHA_ACTUALIZACION  : 23,
  NUMERO_ORDEN         : 24,
  APLAZADO_REPROG      : 25
};


// ────────────────────────────────────────────────────────────
// FUNCIÓN AUXILIAR #1: FESTIVOS Y DÍAS HÁBILES
// ────────────────────────────────────────────────────────────

/**
 * Retorna el siguiente día hábil después de `fechaActual`.
 * Un día hábil es: lunes-viernes, no festivo CO, fuera de vacaciones.
 *
 * @param  {Date} fechaActual  - Fecha de referencia
 * @return {Date}              - Siguiente día hábil (nuevo objeto Date)
 */
function obtenerSiguienteDiaHabil(fechaActual) {

  // ── Festivos oficiales Colombia 2026 ──────────────────────
  // Fuente: Ley 51/1983, festivos fijos + Ley Emiliani (traslado al lunes).
  // Semana Santa 2026: Pascua = 5 de Abril.
  var FESTIVOS_2026 = [
    // ── Fijos (no se trasladan) ──
    "2026-01-01",  // Año Nuevo
    "2026-05-01",  // Día del Trabajo
    "2026-07-20",  // Independencia de Colombia
    "2026-08-07",  // Batalla de Boyacá
    "2026-12-08",  // Inmaculada Concepción
    "2026-12-25",  // Navidad

    // ── Semana Santa (variables, Pascua 5-Abr-2026) ──
    "2026-04-02",  // Jueves Santo
    "2026-04-03",  // Viernes Santo

    // ── Trasladados por Ley Emiliani (al lunes siguiente si no caen en lunes) ──
    "2026-01-12",  // Reyes Magos     (6-Ene → Lun 12-Ene)
    "2026-03-23",  // San José        (19-Mar → Lun 23-Mar)
    "2026-05-18",  // Ascensión       (40 días post-Pascua: 14-May → Lun 18-May)
    "2026-06-08",  // Corpus Christi  (60 días post-Pascua: 4-Jun → Lun 8-Jun)
    "2026-06-15",  // Sagrado Corazón (68 días post-Pascua: 12-Jun → Lun 15-Jun)
    "2026-06-29",  // San Pedro y San Pablo (29-Jun ya es lunes)
    "2026-08-17",  // Asunción        (15-Ago → Lun 17-Ago)
    "2026-10-12",  // Día de la Raza  (12-Oct ya es lunes)
    "2026-11-02",  // Todos los Santos (1-Nov → Lun 2-Nov)
    "2026-11-16"   // Independencia Cartagena (11-Nov → Lun 16-Nov)
  ];

  // ── Vacaciones mitad de año: 29-Jun al 10-Jul (inclusive) ──
  var VAC_INICIO = new Date("2026-06-29T12:00:00");
  var VAC_FIN    = new Date("2026-07-10T12:00:00");

  // Trabajar con una copia para no mutar el parámetro
  var cursor = new Date(fechaActual.getTime());

  // Avanzar siempre al menos 1 día
  cursor.setDate(cursor.getDate() + 1);

  // Seguir avanzando mientras el día NO sea hábil
  while (true) {
    var dow    = cursor.getDay();           // 0=Dom, 6=Sáb
    var esFind = (dow === 0 || dow === 6);

    // Formato YYYY-MM-DD para comparar con el array de festivos
    var y = cursor.getFullYear();
    var m = (cursor.getMonth() + 1 < 10 ? "0" : "") + (cursor.getMonth() + 1);
    var d = (cursor.getDate() < 10 ? "0" : "") + cursor.getDate();
    var strFecha = y + "-" + m + "-" + d;

    var esFestivo   = (FESTIVOS_2026.indexOf(strFecha) !== -1);
    var esVacacion  = (cursor >= VAC_INICIO && cursor <= VAC_FIN);

    if (!esFind && !esFestivo && !esVacacion) break;  // ← día hábil ✓

    cursor.setDate(cursor.getDate() + 1);
  }

  return cursor;
}


// ────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL: reprogramarCalendario()
// ────────────────────────────────────────────────────────────

/**
 * Lee IC_Partidos, ordena los partidos "Programado" según el
 * Ciclo de Rotación y sobreescribe las columnas `fecha` y `hora`
 * con días hábiles consecutivos, empezando el 10-Abr-2026.
 *
 * El Partido #1 (Futsal 7°, ya jugado el 08-Abr) NO se modifica.
 *
 * Al finalizar escribe en el log el resumen de la operación.
 */
function reprogramarCalendario() {

  // ── 1. Abrir hoja ─────────────────────────────────────────
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(NOMBRE_HOJA_PARTIDOS);

  if (!hoja) {
    Browser.msgBox('❌ Hoja "' + NOMBRE_HOJA_PARTIDOS + '" no encontrada.');
    return;
  }

  var rango  = hoja.getDataRange();
  var datos  = rango.getValues();          // Array 2D (incluye encabezado)
  var encabs = datos[0];                   // Fila 0 = encabezados
  var filas  = datos.slice(1);             // Filas de datos (sin encabezado)

  Logger.log("Total de filas de datos: " + filas.length);

  // ── 2. Detectar columnas dinámicamente ───────────────────
  // (Por si el orden de columnas cambia; usamos COL como fallback)
  var enc = encabs.map(function(h) {
    return String(h).trim().toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[áà]/g,"a").replace(/[éè]/g,"e")
      .replace(/[íì]/g,"i").replace(/[óò]/g,"o")
      .replace(/[úù]/g,"u").replace(/ñ/g,"n");
  });

  var iGrado   = enc.indexOf("grado")   !== -1 ? enc.indexOf("grado")   : COL.GRADO;
  var iDeporte = enc.indexOf("deporte") !== -1 ? enc.indexOf("deporte") : COL.DEPORTE;
  var iFecha   = enc.indexOf("fecha")   !== -1 ? enc.indexOf("fecha")   : COL.FECHA;
  var iHora    = enc.indexOf("hora")    !== -1 ? enc.indexOf("hora")    : COL.HORA;
  var iEstado  = enc.indexOf("estado")  !== -1 ? enc.indexOf("estado")  : COL.ESTADO;
  var iFechaU  = enc.indexOf("fecha_actualizacion") !== -1
                 ? enc.indexOf("fecha_actualizacion") : COL.FECHA_ACTUALIZACION;
  var iOrden   = enc.indexOf("numero_orden")         !== -1
                 ? enc.indexOf("numero_orden")         : COL.NUMERO_ORDEN;

  // ── 3. Separar partidos por tipo ──────────────────────────
  //   - yaJugados   → estado = Finalizado / En juego / Medio tiempo / W.O. → NO tocar
  //   - aplazados   → estado = Aplazado → van AL FINAL de la cola
  //   - programados → estado = Programado (o vacío) → ordenar por ciclo y reasignar

  var estadosIntocables = ["finalizado", "en juego", "medio tiempo", "w.o.", "wo", "suspendido"];

  var programados = [];  // { filaIdx (0-based en `filas`), grado, deporte, fase }
  var aplazados   = [];
  var intocables  = [];

  for (var r = 0; r < filas.length; r++) {
    var fila   = filas[r];
    var estado = String(fila[iEstado] || "").trim().toLowerCase();

    if (estadosIntocables.indexOf(estado) !== -1) {
      intocables.push(r);
    } else if (estado === "aplazado") {
      aplazados.push({ idx: r, fila: fila });
    } else {
      // "programado" o vacío
      programados.push({ idx: r, fila: fila });
    }
  }

  Logger.log("Intocables: " + intocables.length +
             " | Programados: " + programados.length +
             " | Aplazados: " + aplazados.length);

  // ── 4. Construir la cola ordenada por CICLO ───────────────
  //
  // Agrupamos los partidos programados por key "grado_deporte".
  // Dentro de cada grupo, ordenamos por fase (Fase 1 → ... → Final).
  // Luego recorremos el CICLO en loop sacando 1 partido por paso.

  // 4a. Agrupar
  var grupos = {};
  for (var p = 0; p < programados.length; p++) {
    var item    = programados[p];
    var grado   = String(item.fila[iGrado]).trim();
    var deporte = String(item.fila[iDeporte]).trim();
    var key     = grado + "|||" + deporte;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(item);
  }

  // 4b. Ordenar cada grupo por prioridad de fase
  var prioridadFase = function(fase) {
    if (!fase) return 99;
    var f = String(fase).toLowerCase();
    if (f.indexOf("todos vs") !== -1)   return 0;
    if (f.indexOf("fase 1")   !== -1)   return 1;
    if (/\bj1\b/.test(f))               return 1;
    if (/\bj2\b/.test(f))               return 2;
    if (/\bj3\b/.test(f))               return 3;
    if (f.indexOf("cuarto")   !== -1)   return 6;
    if (f.indexOf("semi")     !== -1)   return 7;
    if (f.indexOf("tercer")   !== -1 ||
        f.indexOf("3er")      !== -1)   return 8;
    if (f.indexOf("final")    !== -1)   return 9;
    return 5;
  };

  var iFase = enc.indexOf("fase") !== -1 ? enc.indexOf("fase") : COL.FASE;

  for (var key in grupos) {
    grupos[key].sort(function(a, b) {
      return prioridadFase(a.fila[iFase]) - prioridadFase(b.fila[iFase]);
    });
  }

  // 4c. Construir cola recorriendo el CICLO en loop
  var cola           = [];
  var cicloIdx       = 0;
  var maxIteraciones = programados.length * CICLO.length + 100; // techo de seguridad
  var iter           = 0;
  var gruposVacios   = 0;

  while (Object.keys(grupos).length > 0 && iter < maxIteraciones) {
    iter++;
    var paso    = CICLO[cicloIdx % CICLO.length];
    cicloIdx++;
    var keyCiclo = paso.grado + "|||" + paso.deporte;

    if (grupos[keyCiclo] && grupos[keyCiclo].length > 0) {
      cola.push(grupos[keyCiclo].shift());
      if (grupos[keyCiclo].length === 0) delete grupos[keyCiclo];
    }
    // Si no hay partido de ese grado/deporte en este paso, simplemente continúa.
    // NO cuenta como día (el ciclo es solo de ordenamiento, no de fechas).
  }

  // 4d. Los aplazados se insertan ANTES de la primera fase eliminatoria
  //     (Semis / Final / Tercer Puesto). Si no hay, van al final.
  var puntoInsercion = cola.length; // por defecto: al final
  for (var ci = 0; ci < cola.length; ci++) {
    var prio = prioridadFase(cola[ci].fila[iFase]);
    if (prio >= 7) { // semifinal o posterior
      puntoInsercion = ci;
      break;
    }
  }

  var colaFinal = cola.slice(0, puntoInsercion)
                      .concat(aplazados)
                      .concat(cola.slice(puntoInsercion));

  Logger.log("Cola final de partidos a reprogramar: " + colaFinal.length);

  // ── 5. Proyectar fechas hábiles ───────────────────────────
  //
  // Regla:
  //   - Partido #1 (Futsal 7°, índice 0 del CICLO) → 2026-04-08  → YA JUGADO, no tocar.
  //   - colaFinal[0] (Voleibol 7°) → 2026-04-10  (fijo por regla de negocio)
  //   - colaFinal[1] en adelante → siguiente día hábil tras la fecha anterior

  // Usar un cursor de tipo Date; hora media para evitar problemas de DST
  var cursor = new Date(FECHA_INICIO_PROGRAMACION + "T12:00:00");

  // Mapear filaIdx → nueva fecha (string YYYY-MM-DD) para batch update
  // También guardaremos el número de orden.
  var asignaciones = []; // [{ idx, fecha, hora, orden }]

  for (var q = 0; q < colaFinal.length; q++) {
    var item2 = colaFinal[q];

    // El primer elemento recibe FECHA_INICIO_PROGRAMACION directamente.
    // Los siguientes avanzan al siguiente día hábil.
    if (q > 0) {
      cursor = obtenerSiguienteDiaHabil(cursor);
    }

    var y2 = cursor.getFullYear();
    var m2 = (cursor.getMonth() + 1 < 10 ? "0" : "") + (cursor.getMonth() + 1);
    var d2 = (cursor.getDate()     < 10 ? "0" : "") + cursor.getDate();
    var fechaStr = y2 + "-" + m2 + "-" + d2;

    asignaciones.push({
      idx   : item2.idx,   // índice 0-based en `filas`
      fecha : fechaStr,
      hora  : HORA_FIJA,
      orden : q + 2        // +2 porque el partido #1 ya se jugó con orden=1
    });
  }

  // ── 6. Aplicar cambios con setValues() (batch óptimo) ─────
  //
  // Estrategia: reconstruir el array 2D completo de la hoja
  // y hacer UN SOLO setValues() al final → mínimas llamadas a la API.

  var ahora = _timestampColombia();

  // Crear copia mutable de `filas`
  var filasActualizadas = filas.map(function(f) { return f.slice(); });

  for (var a = 0; a < asignaciones.length; a++) {
    var asig = asignaciones[a];
    var fila = filasActualizadas[asig.idx];

    fila[iFecha]  = asig.fecha;
    fila[iHora]   = asig.hora;
    if (iOrden  !== -1) fila[iOrden]  = asig.orden;
    if (iFechaU !== -1) fila[iFechaU] = ahora;

    // Si era aplazado, devolverlo a "Programado" y limpiar metadatos
    var estadoActual = String(fila[iEstado] || "").trim().toLowerCase();
    if (estadoActual === "aplazado") {
      fila[iEstado] = "Programado";
      var iAplRep = enc.indexOf("aplazado_reprogramado");
      if (iAplRep !== -1) fila[iAplRep] = "TRUE";
    }
  }

  // Escribir todo de una sola vez (excluye la fila de encabezados)
  var rangoData = hoja.getRange(2, 1, filasActualizadas.length, encabs.length);
  rangoData.setValues(filasActualizadas);

  // ── 7. Log resumen ────────────────────────────────────────
  var primera = asignaciones.length > 0 ? asignaciones[0].fecha : "N/A";
  var ultima  = asignaciones.length > 0 ? asignaciones[asignaciones.length - 1].fecha : "N/A";

  Logger.log("════════════════════════════════════════");
  Logger.log("✅ reprogramarCalendario() completado");
  Logger.log("Partidos reprogramados : " + asignaciones.length);
  Logger.log("Primer partido         : " + primera + " " + HORA_FIJA);
  Logger.log("Último partido         : " + ultima  + " " + HORA_FIJA);
  Logger.log("Partidos intocables    : " + intocables.length);
  Logger.log("Partidos aplazados     : " + aplazados.length + " (reinsertados antes de fases finales)");
  Logger.log("════════════════════════════════════════");

  // Notificación en la interfaz de GAS (solo si se ejecuta desde el editor)
  try {
    SpreadsheetApp.getUi().alert(
      "✅ Calendario reprogramado\n\n" +
      "Partidos actualizados: " + asignaciones.length + "\n" +
      "Inicio: " + primera + " — Cierre: " + ultima + "\n\n" +
      "Revisa el Log (Ver > Registros) para el detalle completo."
    );
  } catch (uiErr) {
    // Si no hay UI disponible (ejecución por trigger), silenciar el error
  }
}


// ────────────────────────────────────────────────────────────
// HELPER PRIVADO — Timestamp en hora Colombia (UTC-5)
// ────────────────────────────────────────────────────────────

function _timestampColombia() {
  var ahora  = new Date();
  var offset = -5 * 60;
  var utc    = ahora.getTime() + (ahora.getTimezoneOffset() * 60000);
  var col    = new Date(utc + (offset * 60000));
  var pad    = function(n) { return n < 10 ? "0" + n : String(n); };
  return col.getFullYear() + "-" + pad(col.getMonth() + 1) + "-" + pad(col.getDate()) +
         " " + pad(col.getHours()) + ":" + pad(col.getMinutes()) + ":" + pad(col.getSeconds());
}


// ────────────────────────────────────────────────────────────
// FUNCIÓN DE PRUEBA — Simular sin escribir en Sheets
// ────────────────────────────────────────────────────────────

/**
 * Ejecuta el mismo algoritmo pero SIN modificar la hoja.
 * Imprime el plan completo en el Log de GAS.
 * Ideal para verificar antes de aplicar el cambio real.
 *
 * Ejecutar desde: Editor GAS → seleccionar "simularCalendario" → ▶ Ejecutar
 */
function simularCalendario() {
  Logger.log("════════ SIMULACIÓN — no se modifica la hoja ════════");

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var hoja  = ss.getSheetByName(NOMBRE_HOJA_PARTIDOS);
  if (!hoja) { Logger.log("Hoja no encontrada."); return; }

  var datos  = hoja.getDataRange().getValues();
  var encabs = datos[0];
  var filas  = datos.slice(1);

  var enc = encabs.map(function(h) {
    return String(h).trim().toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[áà]/g,"a").replace(/[éè]/g,"e")
      .replace(/[íì]/g,"i").replace(/[óò]/g,"o")
      .replace(/[úù]/g,"u").replace(/ñ/g,"n");
  });

  var iGrado   = enc.indexOf("grado")   !== -1 ? enc.indexOf("grado")   : COL.GRADO;
  var iDeporte = enc.indexOf("deporte") !== -1 ? enc.indexOf("deporte") : COL.DEPORTE;
  var iFase    = enc.indexOf("fase")    !== -1 ? enc.indexOf("fase")    : COL.FASE;
  var iEstado  = enc.indexOf("estado")  !== -1 ? enc.indexOf("estado")  : COL.ESTADO;
  var iId      = enc.indexOf("id_partido") !== -1 ? enc.indexOf("id_partido") : COL.ID_PARTIDO;

  var estadosIntocables = ["finalizado", "en juego", "medio tiempo", "w.o.", "wo", "suspendido"];
  var programados = [];
  var aplazados   = [];

  for (var r = 0; r < filas.length; r++) {
    var fila   = filas[r];
    var estado = String(fila[iEstado] || "").trim().toLowerCase();
    if (estadosIntocables.indexOf(estado) !== -1) continue;
    if (estado === "aplazado") {
      aplazados.push({ idx: r, fila: fila });
    } else {
      programados.push({ idx: r, fila: fila });
    }
  }

  var grupos = {};
  var prioridadFase = function(fase) {
    if (!fase) return 99;
    var f = String(fase).toLowerCase();
    if (f.indexOf("todos vs") !== -1) return 0;
    if (f.indexOf("fase 1")   !== -1 || /\bj1\b/.test(f)) return 1;
    if (/\bj2\b/.test(f)) return 2;
    if (/\bj3\b/.test(f)) return 3;
    if (f.indexOf("semi")   !== -1) return 7;
    if (f.indexOf("tercer") !== -1 || f.indexOf("3er") !== -1) return 8;
    if (f.indexOf("final")  !== -1) return 9;
    return 5;
  };

  for (var p = 0; p < programados.length; p++) {
    var item    = programados[p];
    var grado   = String(item.fila[iGrado]).trim();
    var deporte = String(item.fila[iDeporte]).trim();
    var key     = grado + "|||" + deporte;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(item);
  }
  for (var key in grupos) {
    grupos[key].sort(function(a, b) {
      return prioridadFase(a.fila[iFase]) - prioridadFase(b.fila[iFase]);
    });
  }

  var cola = [];
  var cicloIdx = 0;
  var iter     = 0;
  var max      = programados.length * CICLO.length + 100;

  while (Object.keys(grupos).length > 0 && iter < max) {
    iter++;
    var paso    = CICLO[cicloIdx % CICLO.length];
    cicloIdx++;
    var keyCiclo = paso.grado + "|||" + paso.deporte;
    if (grupos[keyCiclo] && grupos[keyCiclo].length > 0) {
      cola.push(grupos[keyCiclo].shift());
      if (grupos[keyCiclo].length === 0) delete grupos[keyCiclo];
    }
  }

  var puntoInsercion = cola.length;
  for (var ci = 0; ci < cola.length; ci++) {
    if (prioridadFase(cola[ci].fila[iFase]) >= 7) { puntoInsercion = ci; break; }
  }
  var colaFinal = cola.slice(0, puntoInsercion).concat(aplazados).concat(cola.slice(puntoInsercion));

  var cursor = new Date(FECHA_INICIO_PROGRAMACION + "T12:00:00");

  Logger.log("Nº  | Fecha       | Grado | Deporte          | Fase               | ID Partido");
  Logger.log("───────────────────────────────────────────────────────────────────────────────");

  for (var q = 0; q < colaFinal.length; q++) {
    if (q > 0) cursor = obtenerSiguienteDiaHabil(cursor);

    var fila2   = colaFinal[q].fila;
    var y2 = cursor.getFullYear();
    var m2 = (cursor.getMonth()+1 < 10 ? "0":"") + (cursor.getMonth()+1);
    var d2 = (cursor.getDate()    < 10 ? "0":"") + cursor.getDate();
    var fStr = y2+"-"+m2+"-"+d2;

    var num     = String(q + 2);
    var grado2  = String(fila2[iGrado]).trim();
    var dep2    = String(fila2[iDeporte]).trim();
    var fase2   = String(fila2[iFase]).trim();
    var id2     = String(fila2[iId]).trim();

    Logger.log(
      (num.length < 3 ? ("  " + num).slice(-3) : num) + " | " +
      fStr + " | " +
      ("Grado " + grado2 + "  ").slice(0,7) + " | " +
      (dep2 + "               ").slice(0,17) + " | " +
      (fase2 + "                   ").slice(0,20) + " | " + id2
    );
  }

  Logger.log("═══════════════════════════════════════════════════════════════════════════");
  Logger.log("Total partidos en plan: " + colaFinal.length);
  Logger.log("Revisa el log y si el plan es correcto, ejecuta reprogramarCalendario()");
}
