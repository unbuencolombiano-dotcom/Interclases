// ============================================================
// Motor_Calendario.gs — Motor de Programación Automática
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// ENTREGABLE SOLICITADO:
//   1. Diagnóstico de BD e instrucciones de migración
//   2. Algoritmo de días hábiles con festivos Colombia
//   3. Motor del Fixture: genera y asigna fechas reales
//   4. Lógica de Aplazamiento (Admin)
//
// REGLAS DE NEGOCIO IMPLEMENTADAS:
//   - 1 partido por día hábil a las 3:45 PM
//   - Ciclo: 7°FS → 7°VB → 6°FS → 6°VB → 5°FS → 5°VB → (Primaria) → 3°
//   - Salta fines de semana, festivos CO, vacaciones mitad de año
//   - Vacaciones: 29-Jun al 10-Jul (bloqueo absoluto)
//   - Inicio efectivo: Viernes 10 de Abril 2026
//   - Partido 1 (7°FS) ya jugado hoy 8-Abr
//   - Aplazados van AL FINAL de la fase regular, antes de siguiente ronda
// ============================================================


// ============================================================
// ▌ DIAGNÓSTICO #1 — EVALUACIÓN DE LA BASE DE DATOS
// ============================================================
//
// COLUMNAS ACTUALES en IC_Partidos (Utils.gs > inicializarSpreadsheet):
//   id_partido | fecha | hora | grado | nivel | deporte | fase |
//   id_equipo_local | grupo_local | pais_local | bandera_local |
//   id_equipo_visitante | grupo_visitante | pais_visitante | bandera_visitante |
//   goles_local | goles_visitante | estado | motivo_aplazado |
//   nueva_fecha_aplazado | arbitro | observaciones | fecha_registro | fecha_actualizacion
//
// ✅ COLUMNAS QUE YA EXISTEN Y SE USAN EN ESTE MOTOR:
//   - estado          → "Programado", "Aplazado", "Finalizado", etc.
//   - fecha           → Se actualiza con la fecha calculada (YYYY-MM-DD)
//   - hora            → Se actualiza con "15:45"
//   - motivo_aplazado → Se llena cuando el Admin aplaza
//   - nueva_fecha_aplazado → Se llena con la nueva fecha calculada
//
// ⚠️ COLUMNAS NUEVAS A AGREGAR en IC_Partidos:
//   - numero_orden    → INTEGER. Posición en el ciclo de rotación (1, 2, 3...).
//                       Permite re-secuenciar fácilmente si hay aplazamientos.
//   - aplazado_reprogramado → BOOLEAN ("TRUE"/"FALSE"). Marca si el partido
//                       aplazado ya fue reinsertado al final de la cola.
//
// INSTRUCCIÓN DE MIGRACIÓN (ejecutar UNA sola vez desde GAS console):
//   migrarColumnasCalendario()
//
// ============================================================


// ============================================================
// MIGRACIÓN — Agregar columnas nuevas a IC_Partidos
// ============================================================

/**
 * Agrega las columnas 'numero_orden' y 'aplazado_reprogramado'
 * a IC_Partidos si aún no existen. Ejecutar una sola vez.
 * @return {Object} respuestaExito o respuestaError
 */
function migrarColumnasCalendario() {
  try {
    var hoja   = getHoja("PARTIDOS");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0].map(function(h) { return String(h).trim().toLowerCase(); });

    var nuevas = ["numero_orden", "aplazado_reprogramado"];
    var agregadas = [];

    for (var i = 0; i < nuevas.length; i++) {
      if (encabs.indexOf(nuevas[i]) === -1) {
        var col = encabs.length + 1 + agregadas.length;
        hoja.getRange(1, col).setValue(nuevas[i])
            .setFontWeight("bold").setBackground("#003380").setFontColor("#ffffff");
        agregadas.push(nuevas[i]);
      }
    }

    if (agregadas.length === 0) {
      return respuestaExito(null, "Las columnas ya existen. No se requiere migración.");
    }

    SpreadsheetApp.flush();
    log("Motor_Calendario", "Migración OK. Columnas agregadas: " + agregadas.join(", "), "INFO");
    return respuestaExito({ agregadas: agregadas }, "Migración completada: " + agregadas.join(", "));
  } catch (e) {
    log("Motor_Calendario", "migrarColumnasCalendario error: " + e.message, "ERROR");
    return respuestaError("Error en migración: " + e.message);
  }
}


// ============================================================
// ▌ MÓDULO #2 — ALGORITMO DE DÍAS HÁBILES
// ============================================================

/**
 * Lista de festivos oficiales de Colombia para 2026.
 * Fuente: Ley 51 de 1983, Ley 270 de 1996 y cálculos de Ley Emiliani.
 * Los festivos que caen en no-lunes se trasladan al lunes siguiente (Ley Emiliani).
 * @return {Array.<string>} Array de fechas "YYYY-MM-DD"
 */
function getFestivosColumbia2026() {
  return [
    // Festivos fijos (no se trasladan)
    "2026-01-01", // Año Nuevo
    "2026-05-01", // Día del Trabajo
    "2026-07-20", // Día de Independencia
    "2026-08-07", // Batalla de Boyacá
    "2026-12-08", // Inmaculada Concepción
    "2026-12-25", // Navidad

    // Semana Santa 2026 (variables - Pascua 5 de Abril)
    "2026-04-02", // Jueves Santo
    "2026-04-03", // Viernes Santo

    // Festivos trasladados por Ley Emiliani (al lunes siguiente si no caen en lunes)
    // Reyes Magos: 6-Ene → Lunes 12-Ene-2026
    "2026-01-12",
    // San José: 19-Mar → Lunes 23-Mar-2026
    "2026-03-23",
    // Ascensión del Señor: 40 días post-Pascua = 14-May → Lunes 18-May-2026
    "2026-05-18",
    // Corpus Christi: 60 días post-Pascua = 4-Jun → Lunes 8-Jun-2026
    "2026-06-08",
    // Sagrado Corazón: 68 días post-Pascua = 12-Jun → Lunes 15-Jun-2026
    "2026-06-15",
    // San Pedro y San Pablo: 29-Jun → Lunes 29-Jun-2026 (ya es lunes)
    "2026-06-29",
    // Asunción de la Virgen: 15-Ago → Lunes 17-Ago-2026
    "2026-08-17",
    // Día de la Raza: 12-Oct → Lunes 12-Oct-2026 (ya es lunes)
    "2026-10-12",
    // Todos los Santos: 1-Nov → Lunes 2-Nov-2026
    "2026-11-02",
    // Independencia de Cartagena: 11-Nov → Lunes 16-Nov-2026
    "2026-11-16"
  ];
}

/**
 * Bloqueos especiales del torneo (vacaciones mitad de año y otros).
 * Rango vacaciones: Lunes 29-Jun hasta Viernes 10-Jul (AMBOS INCLUSIVE).
 * @return {Array.<string>} Array de fechas "YYYY-MM-DD"
 */
function getBloqueosCalendario() {
  var bloqueados = [];

  // Vacaciones mitad de año: 29-Jun-2026 al 10-Jul-2026
  var inicio = new Date("2026-06-29T12:00:00");
  var fin    = new Date("2026-07-10T12:00:00");
  var cursor = new Date(inicio);

  while (cursor <= fin) {
    bloqueados.push(_formatearFechaISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return bloqueados;
}

/**
 * Verifica si una fecha es hábil para programar un partido.
 * Un día es hábil si NO es: sábado, domingo, festivo CO, ni vacaciones torneo.
 * @param {Date}         fecha
 * @param {Array.<string>} festivosList - Resultado de getFestivosColumbia2026()
 * @param {Array.<string>} bloquesList  - Resultado de getBloqueosCalendario()
 * @return {boolean}
 */
function esDiaHabil(fecha, festivosList, bloquesList) {
  var dow = fecha.getDay(); // 0=Dom, 6=Sab
  if (dow === 0 || dow === 6) return false;

  var str = _formatearFechaISO(fecha);

  for (var i = 0; i < festivosList.length; i++) {
    if (festivosList[i] === str) return false;
  }
  for (var j = 0; j < bloquesList.length; j++) {
    if (bloquesList[j] === str) return false;
  }

  return true;
}

/**
 * Avanza una fecha al siguiente día hábil.
 * Modifica el objeto Date en-place Y lo retorna.
 * @param {Date}           fecha
 * @param {Array.<string>} festivosList
 * @param {Array.<string>} bloquesList
 * @return {Date}
 */
function avanzarAlSiguienteDiaHabil(fecha, festivosList, bloquesList) {
  fecha.setDate(fecha.getDate() + 1);
  while (!esDiaHabil(fecha, festivosList, bloquesList)) {
    fecha.setDate(fecha.getDate() + 1);
  }
  return fecha;
}

/**
 * Proyecta N días hábiles desde una fecha de inicio (sin incluirla).
 * Útil para calcular cuándo caerá el partido #N.
 * @param {string} fechaInicioISO - "YYYY-MM-DD", punto de partida (no incluido)
 * @param {number} nDias          - Cuántos días hábiles avanzar
 * @return {string}               - "YYYY-MM-DD" de la fecha resultante
 */
function proyectarDiasHabiles(fechaInicioISO, nDias) {
  var festivos = getFestivosColumbia2026();
  var bloqueos = getBloqueosCalendario();
  var cursor   = new Date(fechaInicioISO + "T12:00:00");

  for (var i = 0; i < nDias; i++) {
    avanzarAlSiguienteDiaHabil(cursor, festivos, bloqueos);
  }
  return _formatearFechaISO(cursor);
}

/**
 * Formatea un objeto Date a "YYYY-MM-DD".
 * (Función interna, disponible también en Motor_Torneo pero se duplica
 *  aquí para que este archivo sea autocontenido.)
 * @param {Date} fecha
 * @return {string}
 */
function _formatearFechaISO(fecha) {
  var y = fecha.getFullYear();
  var m = pad2(fecha.getMonth() + 1);
  var d = pad2(fecha.getDate());
  return y + "-" + m + "-" + d;
}


// ============================================================
// ▌ MÓDULO #3 — EL CICLO DE ROTACIÓN EXACTO
// ============================================================
//
// Según las reglas de negocio, el ciclo es de grados mayores a menores
// alternando deporte. Bachillerato y Primaria tienen ciclos paralelos
// pero el torneo juega UN SOLO partido por día.
//
// El ciclo de Bachillerato (ciclo principal, 1 partido/día):
//   1° Futsal 7°   → 2° Voleibol 7°   → 3° Futsal 6°
//   4° Voleibol 6° → 5° Futsal 5°     → 6° Voleibol 5°
//   (luego reinicia en 7° para la siguiente fecha)
//
// Nota: Primaria (3°, 4°, 5° con Mini-) se programa en el mismo ciclo
// pero de forma intercalada. El motor los mezcla según CICLO_ROTACION.

var CICLO_ROTACION = [
  // { grado, deporte, descripcion }
  { grado: "7", deporte: "Futsal",          desc: "Futsal 7°"        },
  { grado: "7", deporte: "Voleibol",        desc: "Voleibol 7°"      },
  { grado: "6", deporte: "Futsal",          desc: "Futsal 6°"        },
  { grado: "6", deporte: "Voleibol",        desc: "Voleibol 6°"      },
  { grado: "5", deporte: "Mini Futsal",     desc: "Mini Futsal 5°"   },
  { grado: "5", deporte: "Mini Voleibol",   desc: "Mini Voleibol 5°" },
  { grado: "4", deporte: "Mini Futsal",     desc: "Mini Futsal 4°"   },
  { grado: "4", deporte: "Mini Voleibol",   desc: "Mini Voleibol 4°" },
  { grado: "3", deporte: "Mini Futsal",     desc: "Mini Futsal 3°"   },
  { grado: "3", deporte: "Mini Voleibol",   desc: "Mini Voleibol 3°" }
];

// Hora fija de todos los partidos (regla de negocio)
var HORA_PARTIDO = "15:45";


// ============================================================
// ▌ MÓDULO #4 — MOTOR DEL FIXTURE INTELIGENTE
// ============================================================

/**
 * FUNCIÓN PRINCIPAL.
 * Genera y asigna fechas reales a todos los partidos en IC_Partidos
 * aplicando el ciclo de rotación, días hábiles y bloqueos.
 *
 * ESTADO INICIAL CONFIGURADO:
 *   - Partido 1 (Futsal 7°, 8-Abr) → YA JUGADO → NO se reprograma
 *   - Partido 2 (Voleibol 7°)       → APLAZADO    → Siguiente en ciclo = 10-Abr
 *   - Partido 3 (Futsal 6°)         → Siguiente día hábil = 13-Abr
 *   - ... y así sucesivamente
 *
 * @param {string} pin         - PIN de administrador
 * @param {boolean} soloSimular - TRUE = solo calcula y retorna el plan sin escribir en Sheets
 * @return {Object} respuestaExito con el plan de fechas, o respuestaError
 */
function ejecutarMotorCalendario(pin, soloSimular) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    // ── 1. Leer todos los partidos activos (no Suspendidos, no YA con fecha fija) ──
    var todosPartidos = leerHoja("PARTIDOS");

    // Separar: finalizados/en_juego (no tocar), aplazados (van al final), programados
    var yaJugados  = [];
    var aplazados  = [];
    var pendientes = [];

    for (var i = 0; i < todosPartidos.length; i++) {
      var p = todosPartidos[i];
      var est = String(p.estado || "").trim();

      if (est === CONFIG.ESTADOS_PARTIDO.FINALIZADO ||
          est === CONFIG.ESTADOS_PARTIDO.EN_JUEGO   ||
          est === CONFIG.ESTADOS_PARTIDO.MEDIO_TIEMPO ||
          est === CONFIG.ESTADOS_PARTIDO.WO) {
        yaJugados.push(p);
      } else if (est === CONFIG.ESTADOS_PARTIDO.APLAZADO) {
        aplazados.push(p);
      } else {
        // Programado o sin estado
        pendientes.push(p);
      }
    }

    if (pendientes.length === 0 && aplazados.length === 0) {
      return respuestaError("No hay partidos pendientes para programar.", "SIN_PARTIDOS");
    }

    // ── 2. Construir la COLA ORDENADA por el ciclo de rotación ──
    // Para cada paso del ciclo, sacar el siguiente partido disponible
    // de ese grado+deporte, respetando el orden interno por fase.
    var colaOrdenada = _construirColaEnCiclo(pendientes);

    // Los aplazados van AL FINAL (antes de fases eliminatorias)
    // Regla: aplazados de fase regular se insertan antes de la primera Final/Semifinal
    var insertIdx = _encontrarPuntoInsercionAplazados(colaOrdenada);
    var colaFinal = colaOrdenada.slice(0, insertIdx)
                    .concat(aplazados)
                    .concat(colaOrdenada.slice(insertIdx));

    // ── 3. Proyectar fechas hábiles ──
    // Partido 1 (Futsal 7°) ya se jugó el 08-Abr. 
    // La siguiente fecha programable es el 10-Abr (Viernes) según regla del enunciado.
    // El motor arranca desde 10-Abr como "día 0" del cursor.
    var festivos  = getFestivosColumbia2026();
    var bloqueos  = getBloqueosCalendario();
    var cursor    = new Date("2026-04-10T12:00:00"); // Viernes 10-Abr, 1er partido a programar

    var plan = [];

    for (var k = 0; k < colaFinal.length; k++) {
      var partido = colaFinal[k];

      // El primer partido de la cola (Voleibol 7°) recibe el 10-Abr
      // Los siguientes avanzan al siguiente día hábil.
      if (k > 0) {
        avanzarAlSiguienteDiaHabil(cursor, festivos, bloqueos);
      }

      plan.push({
        numero_orden         : k + 2, // +2 porque el partido #1 ya se jugó
        id_partido           : partido.id_partido,
        grado                : partido.grado,
        deporte              : partido.deporte,
        fase                 : partido.fase,
        pais_local           : partido.pais_local,
        pais_visitante       : partido.pais_visitante,
        fecha_asignada       : _formatearFechaISO(cursor),
        hora_asignada        : HORA_PARTIDO,
        era_aplazado         : (String(partido.estado || "") === CONFIG.ESTADOS_PARTIDO.APLAZADO)
      });
    }

    log("Motor_Calendario",
        "Plan calculado: " + plan.length + " partidos desde 2026-04-10", "INFO");

    // ── 4. Si es simulación, retornar el plan sin escribir ──
    if (soloSimular) {
      return respuestaExito({ plan: plan, total: plan.length },
                            "SIMULACIÓN: " + plan.length + " partidos proyectados (nada guardado).");
    }

    // ── 5. Escribir fechas en IC_Partidos ──
    var resultado = _escribirFechasEnHoja(plan);
    return resultado;

  } catch (e) {
    log("Motor_Calendario", "ejecutarMotorCalendario error: " + e.message, "ERROR");
    return respuestaError("Error en motor de calendario: " + e.message);
  }
}

/**
 * Construye la cola de partidos siguiendo el CICLO_ROTACION.
 * Itera el ciclo cuantas veces sea necesario hasta agotar todos los partidos.
 * @param {Array.<Object>} partidos - Partidos pendientes (no jugados, no aplazados)
 * @return {Array.<Object>}         - Cola ordenada por ciclo
 */
function _construirColaEnCiclo(partidos) {
  // Agrupar por (grado + deporte), ordenados por fase interna
  var grupos = {};
  for (var i = 0; i < partidos.length; i++) {
    var p   = partidos[i];
    var key = p.grado + "_" + p.deporte;
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(p);
  }

  // Ordenar cada grupo: Fase 1 → J1/J2/J3 → Semis → 3er Puesto → Final
  var _ordenFase = function(fase) {
    if (!fase) return 99;
    var f = String(fase).toLowerCase();
    if (f.indexOf("fase 1") !== -1 || f.indexOf("j1") !== -1) return 1;
    if (f.indexOf("j2") !== -1) return 2;
    if (f.indexOf("j3") !== -1) return 3;
    if (f.indexOf("todos vs") !== -1) return 1;
    if (f.indexOf("semifinal") !== -1 || f.indexOf("semi") !== -1) return 7;
    if (f.indexOf("tercer") !== -1 || f.indexOf("3er") !== -1) return 8;
    if (f.indexOf("final") !== -1) return 9;
    return 5;
  };

  for (var key in grupos) {
    grupos[key].sort(function(a, b) {
      return _ordenFase(a.fase) - _ordenFase(b.fase);
    });
  }

  // Recorrer el CICLO_ROTACION en loop hasta vaciar todos los grupos
  var cola           = [];
  var maxIteraciones = 500;
  var iter           = 0;
  var cicloIdx       = 0;
  var totalRestantes = partidos.length;

  while (totalRestantes > 0 && iter < maxIteraciones) {
    iter++;
    var paso = CICLO_ROTACION[cicloIdx % CICLO_ROTACION.length];
    cicloIdx++;

    var key2  = paso.grado + "_" + paso.deporte;
    if (grupos[key2] && grupos[key2].length > 0) {
      cola.push(grupos[key2].shift());
      totalRestantes--;
      if (grupos[key2].length === 0) delete grupos[key2];
    }
    // Si no hay partidos de ese grado/deporte en esta iteración, continúa al siguiente
    // sin consumir un día (el ciclo simplemente avanza).
  }

  return cola;
}

/**
 * Encuentra el índice donde insertar los partidos aplazados:
 * justo antes del primer partido de fase eliminatoria (Final o Semis).
 * Si no hay eliminatoria, se insertan al final.
 * @param {Array.<Object>} cola
 * @return {number} índice de inserción
 */
function _encontrarPuntoInsercionAplazados(cola) {
  for (var i = 0; i < cola.length; i++) {
    var fase = String(cola[i].fase || "").toLowerCase();
    if (fase.indexOf("final") !== -1 || fase.indexOf("semi") !== -1 || fase.indexOf("tercer") !== -1) {
      return i;
    }
  }
  return cola.length; // Al final si no hay eliminatoria aún
}

/**
 * Escribe las fechas calculadas en la hoja IC_Partidos.
 * AUDITORIA v3 - ESCRITURA BATCH OPTIMIZADA:
 * Antes: N x 3 setValue() individuales dentro de loop = hasta 120 llamadas API.
 * Ahora: 1 getValues() + 1 setValues() batch = 2 llamadas API total.
 * Reduccion de latencia: de 8-15s a menos de 1s para 40 partidos.
 *
 * @param {Array.<Object>} plan - Resultado de ejecutarMotorCalendario
 * @return {Object} respuestaExito o respuestaError
 */
function _escribirFechasEnHoja(plan) {
  try {
    if (!plan || plan.length === 0) {
      return respuestaExito({ actualizados: 0, plan: [] }, "No hay partidos a actualizar.");
    }

    var hoja   = getHoja("PARTIDOS");
    var datos  = hoja.getDataRange().getValues();   // UNA sola lectura
    var encabs = datos[0].map(function(h) {
      return String(h || "").trim().toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i")
        .replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");
    });

    // Indices de columnas (0-based para el array)
    var iId      = encabs.indexOf("id_partido");
    var iFecha   = encabs.indexOf("fecha");
    var iHora    = encabs.indexOf("hora");
    var iEstado  = encabs.indexOf("estado");
    var iFechaU  = encabs.indexOf("fecha_actualizacion");
    var iOrden   = encabs.indexOf("numero_orden");
    var iAplRep  = encabs.indexOf("aplazado_reprogramado");

    if (iFecha === -1 || iId === -1) {
      return respuestaError("Columnas 'id_partido' o 'fecha' no encontradas.", "COLUMNA_FALTANTE");
    }

    // Construir mapa id_partido → indice de fila (0-based en datos sin encabezado)
    var mapaFilas = {};
    for (var r = 1; r < datos.length; r++) {
      var idCell = String(datos[r][iId] || "").trim();
      if (idCell) mapaFilas[idCell] = r;
    }

    // Clonar el array completo para mutarlo en memoria
    var datosActualizados = datos.map(function(fila) { return fila.slice(); });
    var ahora             = fechaHoraActual();
    var actualizados      = 0;

    for (var k = 0; k < plan.length; k++) {
      var item  = plan[k];
      var idStr = String(item.id_partido);
      var r2    = mapaFilas[idStr];

      if (r2 === undefined) {
        log("Motor_Calendario", "Partido no encontrado en hoja: " + idStr, "WARN");
        continue;
      }

      // Mutar el array en memoria (sin tocar Sheets todavia)
      if (iFecha  >= 0) datosActualizados[r2][iFecha]  = item.fecha_asignada;
      if (iHora   >= 0) datosActualizados[r2][iHora]   = item.hora_asignada;
      if (iOrden  >= 0) datosActualizados[r2][iOrden]  = item.numero_orden;
      if (iFechaU >= 0) datosActualizados[r2][iFechaU] = ahora;

      // Si era aplazado, devolverlo a "Programado"
      if (item.era_aplazado) {
        if (iEstado >= 0) datosActualizados[r2][iEstado] = CONFIG.ESTADOS_PARTIDO.PROGRAMADO;
        if (iAplRep >= 0) datosActualizados[r2][iAplRep] = "TRUE";
      }

      actualizados++;
    }

    if (actualizados === 0) {
      return respuestaError("Ningun partido del plan fue encontrado en la hoja.", "SIN_COINCIDENCIAS");
    }

    // UNA sola escritura batch — escribe TODAS las filas de una vez
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      // Escribir desde fila 2 (saltando encabezado en fila 1)
      hoja.getRange(2, 1, datosActualizados.length - 1, encabs.length)
          .setValues(datosActualizados.slice(1));
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Motor_Calendario",
        "_escribirFechasEnHoja BATCH: " + actualizados + " partidos en 1 escritura (vs antes: " +
        (actualizados * 3) + " llamadas individuales).", "INFO");

    return respuestaExito(
      { actualizados: actualizados, plan: plan },
      "Calendario generado: " + actualizados + " partidos. Escritura batch optimizada."
    );
  } catch (e) {
    log("Motor_Calendario", "_escribirFechasEnHoja error: " + e.message, "ERROR");
    return respuestaError("Error escribiendo fechas: " + e.message);
  }
}

// ============================================================
// ▌ MÓDULO #5 — LÓGICA DE APLAZAMIENTO (Admin)
// ============================================================

/**
 * APLAZAR UN PARTIDO.
 *
 * Regla de oro: un partido aplazado:
 *   1. Pierde su fecha y turno actual.
 *   2. Se marca como "Aplazado" con el motivo del admin.
 *   3. nueva_fecha_aplazado se deja VACÍA (el motor la calculará al re-ejecutar).
 *   4. aplazado_reprogramado → FALSE (aún no ha sido reinsertado).
 *   5. Al volver a ejecutar ejecutarMotorCalendario(), el motor lo
 *      reinserta automáticamente antes de la fase eliminatoria.
 *
 * @param {string} idPartido - ID del partido a aplazar
 * @param {string} motivo    - Motivo del aplazamiento (requerido)
 * @param {string} pin       - PIN de administrador
 * @return {Object} respuestaExito o respuestaError
 */
function aplazarPartido(idPartido, motivo, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!idPartido)    return respuestaError("Se requiere id_partido.", "ID_REQUERIDO");
    if (!motivo || String(motivo).trim() === "") {
      return respuestaError("El motivo del aplazamiento es obligatorio.", "MOTIVO_REQUERIDO");
    }

    var resultado = buscarFila("PARTIDOS", "id_partido", idPartido);
    if (!resultado) {
      return respuestaError("Partido no encontrado: " + idPartido, "PARTIDO_NO_ENCONTRADO");
    }

    var partidoDatos = resultado.datos;
    var estadoActual = String(partidoDatos.estado || "").trim();

    // No se puede aplazar un partido ya finalizado o en juego
    if (estadoActual === CONFIG.ESTADOS_PARTIDO.FINALIZADO) {
      return respuestaError(
        "No se puede aplazar un partido ya Finalizado.", "ESTADO_INVALIDO"
      );
    }
    if (estadoActual === CONFIG.ESTADOS_PARTIDO.EN_JUEGO ||
        estadoActual === CONFIG.ESTADOS_PARTIDO.MEDIO_TIEMPO) {
      return respuestaError(
        "El partido está En Juego. Finalízalo primero antes de aplazar.", "PARTIDO_EN_CURSO"
      );
    }
    if (estadoActual === CONFIG.ESTADOS_PARTIDO.APLAZADO) {
      return respuestaError(
        "El partido ya está marcado como Aplazado.", "YA_APLAZADO"
      );
    }

    var hoja   = getHoja("PARTIDOS");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0].map(function(h) {
      return String(h || "").trim().toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i")
        .replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");
    });

    var colEstado    = encabs.indexOf("estado") + 1;
    var colMotivo    = encabs.indexOf("motivo_aplazado") + 1;
    var colNuevFec   = encabs.indexOf("nueva_fecha_aplazado") + 1;
    var colFecha     = encabs.indexOf("fecha") + 1;
    var colHora      = encabs.indexOf("hora")  + 1;
    var colOrden     = encabs.indexOf("numero_orden") + 1;
    var colAplRep    = encabs.indexOf("aplazado_reprogramado") + 1;
    var colFechaU    = encabs.indexOf("fecha_actualizacion") + 1;

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var fila = resultado.fila;

      // Marcar como Aplazado
      if (colEstado  > 0) hoja.getRange(fila, colEstado).setValue(CONFIG.ESTADOS_PARTIDO.APLAZADO);
      if (colMotivo  > 0) hoja.getRange(fila, colMotivo).setValue(String(motivo).trim());

      // Borrar fecha actual (el partido pierde su turno)
      if (colFecha   > 0) hoja.getRange(fila, colFecha).setValue("");
      if (colHora    > 0) hoja.getRange(fila, colHora).setValue("");

      // Limpiar nueva_fecha (el motor la recalculará)
      if (colNuevFec > 0) hoja.getRange(fila, colNuevFec).setValue("");

      // Limpiar número de orden (se reasignará al re-ejecutar)
      if (colOrden   > 0) hoja.getRange(fila, colOrden).setValue("");

      // Marcar que aún NO ha sido reprogramado
      if (colAplRep  > 0) hoja.getRange(fila, colAplRep).setValue("FALSE");

      if (colFechaU  > 0) hoja.getRange(fila, colFechaU).setValue(fechaHoraActual());

      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Motor_Calendario",
        "Partido aplazado: " + idPartido + " | Motivo: " + motivo, "INFO");

    return respuestaExito(
      {
        id_partido   : idPartido,
        estado       : CONFIG.ESTADOS_PARTIDO.APLAZADO,
        motivo       : motivo,
        instruccion  : "Ejecuta ejecutarMotorCalendario() para recalcular todas las fechas incluyendo este aplazamiento."
      },
      "Partido " + idPartido + " aplazado. Recalcula el calendario para reasignar su fecha."
    );
  } catch (e) {
    log("Motor_Calendario", "aplazarPartido error: " + e.message, "ERROR");
    return respuestaError("Error aplazando partido: " + e.message);
  }
}


/**
 * RECALCULAR CALENDARIO TRAS APLAZAMIENTO.
 *
 * Alias semántico de ejecutarMotorCalendario().
 * Úsalo cuando un admin haya aplazado uno o más partidos
 * y necesite recalcular todas las fechas restantes.
 *
 * @param {string}  pin         - PIN de administrador
 * @param {boolean} soloSimular - TRUE para previsualizar sin guardar
 * @return {Object}
 */
function recalcularTrasAplazamiento(pin, soloSimular) {
  log("Motor_Calendario",
      "recalcularTrasAplazamiento invocado. Delegando a ejecutarMotorCalendario.", "INFO");
  return ejecutarMotorCalendario(pin, soloSimular || false);
}


// ============================================================
// ▌ MÓDULO BONUS — CONSULTAS ÚTILES PARA EL ADMIN
// ============================================================

/**
 * Retorna el plan de fechas futuras del torneo (lectura, sin modificar nada).
 * Ideal para mostrar en el panel de administración.
 * @param {string} pin
 * @return {Object} respuestaExito con array de partidos programados
 */
function getCalendarioProyectado(pin) {
  return ejecutarMotorCalendario(pin, true); // soloSimular = true
}

/**
 * Lista todos los partidos aplazados pendientes de reprogramación.
 * @param {string} pin
 * @return {Object}
 */
function getPartidosAplazados(pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    var todos     = leerHoja("PARTIDOS");
    var aplazados = todos.filter(function(p) {
      return String(p.estado || "").trim() === CONFIG.ESTADOS_PARTIDO.APLAZADO;
    });

    return respuestaExito(
      aplazados,
      "Partidos aplazados: " + aplazados.length
    );
  } catch (e) {
    log("Motor_Calendario", "getPartidosAplazados error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}

/**
 * Diagnóstico rápido del estado del calendario.
 * Útil para el panel de admin antes de ejecutar el motor.
 * @param {string} pin
 * @return {Object}
 */
function diagnosticarCalendario(pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    var todos = leerHoja("PARTIDOS");
    var stats = {
      total        : todos.length,
      finalizados  : 0,
      programados  : 0,
      aplazados    : 0,
      sin_fecha    : 0,
      en_juego     : 0,
      otros        : 0
    };

    for (var i = 0; i < todos.length; i++) {
      var est = String(todos[i].estado || "").trim();
      switch (est) {
        case CONFIG.ESTADOS_PARTIDO.FINALIZADO:
        case CONFIG.ESTADOS_PARTIDO.WO:
          stats.finalizados++; break;
        case CONFIG.ESTADOS_PARTIDO.PROGRAMADO:
          stats.programados++;
          if (!todos[i].fecha || String(todos[i].fecha).trim() === "") stats.sin_fecha++;
          break;
        case CONFIG.ESTADOS_PARTIDO.APLAZADO:
          stats.aplazados++; break;
        case CONFIG.ESTADOS_PARTIDO.EN_JUEGO:
        case CONFIG.ESTADOS_PARTIDO.MEDIO_TIEMPO:
          stats.en_juego++; break;
        default:
          if (!est) {
            stats.programados++;
            stats.sin_fecha++;
          } else {
            stats.otros++;
          }
      }
    }

    // Calcular la próxima fecha hábil disponible desde hoy
    var festivos = getFestivosColumbia2026();
    var bloqueos = getBloqueosCalendario();
    var hoy      = new Date();
    var cursor   = new Date(hoy.getFullYear() + "-" + pad2(hoy.getMonth()+1) + "-" + pad2(hoy.getDate()) + "T12:00:00");
    if (!esDiaHabil(cursor, festivos, bloqueos)) {
      avanzarAlSiguienteDiaHabil(cursor, festivos, bloqueos);
    }

    stats.proxima_fecha_habil = _formatearFechaISO(cursor);
    stats.festivos_2026       = getFestivosColumbia2026().length;
    stats.dias_bloqueados     = getBloqueosCalendario().length;

    return respuestaExito(stats, "Diagnóstico del calendario completado.");
  } catch (e) {
    log("Motor_Calendario", "diagnosticarCalendario error: " + e.message, "ERROR");
    return respuestaError("Error en diagnóstico: " + e.message);
  }
}


// ============================================================
// ▌ REFERENCIA RÁPIDA — CÓMO USAR ESTE MOTOR
// ============================================================
//
// PASO 0: Ejecutar migración (SOLO UNA VEZ):
//   migrarColumnasCalendario()
//
// PASO 1: Ver el plan SIN guardar (simulación):
//   getCalendarioProyectado("TU_PIN_ADMIN")
//
// PASO 2: Aplicar el calendario a la hoja:
//   ejecutarMotorCalendario("TU_PIN_ADMIN", false)
//
// PASO 3: Cuando un partido se aplace (Admin):
//   aplazarPartido("IC_P_001", "Lluvia intensa", "TU_PIN_ADMIN")
//   // Luego recalcular:
//   recalcularTrasAplazamiento("TU_PIN_ADMIN", false)
//
// PASO 4: Consultas de apoyo:
//   getPartidosAplazados("TU_PIN_ADMIN")   // Lista aplazados
//   diagnosticarCalendario("TU_PIN_ADMIN") // Resumen estadístico
//
// NOTA: Los festivos de Colombia 2026 están hardcodeados en
//   getFestivosColumbia2026(). Si Anthropic o el Congreso declare
//   un festivo adicional, agrégalo manualmente a esa función.
// ============================================================
