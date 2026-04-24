// ============================================================
// Data_JuegoLimpio.gs — Tarjetas, sanciones y Fair Play
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// Hojas: IC_Sanciones
// Columnas:
//   id_sancion, id_partido, id_jugador, id_equipo, grupo,
//   deporte, tipo_tarjeta, minuto, descripcion,
//   fecha_partido, fecha_registro
//
// tipo_tarjeta: "Amarilla" | "Roja" | "Roja directa"
// ============================================================


// ============================================================
// REGISTRAR SANCIÓN (tarjeta)
// ============================================================

/**
 * Registra una tarjeta (amarilla o roja) para un jugador.
 * Una tarjeta roja acumula automáticamente la amarilla anterior.
 * Dos amarillas en el torneo = suspensión 1 partido.
 *
 * @param {Object} datos
 *   - id_partido     {string}
 *   - id_jugador     {string}
 *   - id_equipo      {string}
 *   - tipo_tarjeta   {string} "Amarilla" | "Roja" | "Roja directa"
 *   - minuto         {number} minuto del partido (opcional)
 *   - descripcion    {string} motivo (opcional)
 *   - pin            {string}
 * @return {Object}
 */
function registrarTarjeta(datos) {
  try {
    var auth = verificarPIN(datos.pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    if (!datos.id_partido) return respuestaError("id_partido requerido.", "CAMPO_REQUERIDO");
    if (!datos.id_jugador) return respuestaError("id_jugador requerido.", "CAMPO_REQUERIDO");
    if (!datos.id_equipo)  return respuestaError("id_equipo requerido.",  "CAMPO_REQUERIDO");

    var tiposValidos = ["Amarilla", "Roja", "Roja directa"];
    var tipo = String(datos.tipo_tarjeta || "Amarilla").trim();
    if (tiposValidos.indexOf(tipo) === -1) {
      return respuestaError("tipo_tarjeta inválido. Use: " + tiposValidos.join(", "), "TIPO_INVALIDO");
    }

    // Buscar datos del partido para obtener grupo, deporte, fecha
    var partRes = buscarFila("PARTIDOS", "id_partido", datos.id_partido);
    var grupo   = partRes ? String(partRes.datos.grado || "")   : "";
    var deporte = partRes ? String(partRes.datos.deporte || "") : "";
    var fechaPar = partRes ? String(partRes.datos.fecha || "")  : "";

    var id  = generarId("SAN");
    var fila = [
      id,
      String(datos.id_partido),
      String(datos.id_jugador),
      String(datos.id_equipo),
      grupo,
      deporte,
      tipo,
      Number(datos.minuto || 0),
      String(datos.descripcion || "").trim(),
      fechaPar,
      fechaHoraActual()
    ];

    agregarFila("SANCIONES", fila);

    // Verificar si el jugador acumula 2 amarillas → alerta de suspensión
    var alerta = _verificarAcumulacion(String(datos.id_jugador), String(datos.id_equipo));

    log("Data_JuegoLimpio",
        "Tarjeta " + tipo + " → Jugador: " + datos.id_jugador +
        " | Partido: " + datos.id_partido, "INFO");

    return respuestaExito({
      id_sancion      : id,
      tipo_tarjeta    : tipo,
      id_jugador      : datos.id_jugador,
      alerta_suspension: alerta.suspension,
      mensaje_alerta  : alerta.mensaje
    }, "Tarjeta " + tipo + " registrada.");

  } catch (e) {
    log("Data_JuegoLimpio", "registrarTarjeta error: " + e.message, "ERROR");
    return respuestaError("Error registrando tarjeta: " + e.message);
  }
}


/**
 * Verifica si un jugador tiene 2+ amarillas (suspensión próximo partido).
 * @private
 */
function _verificarAcumulacion(idJugador, idEquipo) {
  try {
    var sanciones = leerHoja("SANCIONES");
    var amarillas = 0;
    var rojas     = 0;
    for (var i = 0; i < sanciones.length; i++) {
      var s = sanciones[i];
      if (String(s.id_jugador) !== idJugador) continue;
      if (s.tipo_tarjeta === "Amarilla")     amarillas++;
      if (s.tipo_tarjeta === "Roja" ||
          s.tipo_tarjeta === "Roja directa") rojas++;
    }
    var suspension = amarillas >= 2 || rojas >= 1;
    var msg = "";
    if (rojas >= 1)    msg = "⛔ Jugador con tarjeta roja — suspendido 1 partido.";
    else if (amarillas >= 2) msg = "⚠️ Jugador con " + amarillas + " amarillas — suspendido 1 partido.";
    return { suspension: suspension, mensaje: msg, amarillas: amarillas, rojas: rojas };
  } catch (e) {
    return { suspension: false, mensaje: "", amarillas: 0, rojas: 0 };
  }
}


// ============================================================
// ELIMINAR SANCIÓN
// ============================================================

function eliminarTarjeta(idSancion, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    var hoja  = getHoja("SANCIONES");
    var datos = hoja.getDataRange().getValues();
    var enc   = datos[0];
    var colId = enc.indexOf("id_sancion");
    if (colId === -1) return respuestaError("Columna id_sancion no encontrada.");

    for (var i = datos.length - 1; i >= 1; i--) {
      if (String(datos[i][colId]) === String(idSancion)) {
        var lock = LockService.getScriptLock();
        lock.waitLock(10000);
        try { hoja.deleteRow(i + 1); SpreadsheetApp.flush(); }
        finally { lock.releaseLock(); }
        return respuestaExito(null, "Sanción eliminada.");
      }
    }
    return respuestaError("Sanción no encontrada: " + idSancion, "NO_ENCONTRADO");
  } catch (e) {
    log("Data_JuegoLimpio", "eliminarTarjeta error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}


// ============================================================
// CONSULTAS DE SANCIONES
// ============================================================

/**
 * Retorna las sanciones de un partido.
 */
function getSancionesPorPartido(idPartido) {
  try {
    var todas = leerHoja("SANCIONES");
    var result = todas.filter(function(s) {
      return String(s.id_partido) === String(idPartido);
    });
    return respuestaExito(result, result.length + " sanción(es) en el partido.");
  } catch (e) {
    return respuestaError("Error: " + e.message);
  }
}

/**
 * Retorna las sanciones de un equipo en todo el torneo.
 */
function getSancionesPorEquipo(idEquipo) {
  try {
    var todas = leerHoja("SANCIONES");
    var result = todas.filter(function(s) {
      return String(s.id_equipo) === String(idEquipo);
    });
    return respuestaExito(result);
  } catch (e) {
    return respuestaError("Error: " + e.message);
  }
}

/**
 * Retorna el ranking de Fair Play de todos los equipos.
 * Menos puntos negativos = mejor fair play.
 * Puntuación: Amarilla = -1, Roja = -3, Roja directa = -4
 */
function getTablaFairPlay(deporte) {
  try {
    var sanciones = leerHoja("SANCIONES");
    var equipos   = leerHoja("EQUIPOS");

    var PUNTOS_NEG = { "Amarilla": 1, "Roja": 3, "Roja directa": 4 };

    // Construir mapa por equipo
    var mapaEquipo = {};

    for (var i = 0; i < sanciones.length; i++) {
      var s = sanciones[i];
      if (deporte && String(s.deporte) !== String(deporte)) continue;
      var idEq = String(s.id_equipo);
      if (!mapaEquipo[idEq]) {
        mapaEquipo[idEq] = {
          id_equipo : idEq,
          grupo     : s.grupo || "",
          deporte   : s.deporte || "",
          amarillas : 0,
          rojas     : 0,
          rojas_dir : 0,
          puntos_neg: 0
        };
      }
      var m = mapaEquipo[idEq];
      if (s.tipo_tarjeta === "Amarilla")      { m.amarillas++; m.puntos_neg += 1; }
      else if (s.tipo_tarjeta === "Roja")     { m.rojas++;     m.puntos_neg += 3; }
      else if (s.tipo_tarjeta === "Roja directa") { m.rojas_dir++; m.puntos_neg += 4; }
    }

    // Agregar equipos sin sanciones
    for (var k = 0; k < equipos.length; k++) {
      var eq = equipos[k];
      if (deporte && String(eq.deporte) !== String(deporte)) continue;
      var id = String(eq.id_equipo);
      if (!mapaEquipo[id]) {
        mapaEquipo[id] = {
          id_equipo : id,
          grupo     : eq.grupo || "",
          deporte   : eq.deporte || "",
          pais      : eq.pais || "",
          nombre    : eq.nombre_equipo || "",
          amarillas : 0, rojas: 0, rojas_dir: 0, puntos_neg: 0
        };
      }
      // Enriquecer con nombre y país
      mapaEquipo[id].pais   = eq.pais || "";
      mapaEquipo[id].nombre = eq.nombre_equipo || "";
    }

    var lista = Object.keys(mapaEquipo).map(function(k) { return mapaEquipo[k]; });

    // Ordenar: menos puntos negativos primero
    lista.sort(function(a, b) { return a.puntos_neg - b.puntos_neg; });

    return respuestaExito(lista, "Fair Play: " + lista.length + " equipos.");
  } catch (e) {
    log("Data_JuegoLimpio", "getTablaFairPlay error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}

/**
 * Retorna jugadores con riesgo de suspensión (1 amarilla acumulada).
 */
function getJugadoresEnRiesgo() {
  try {
    var sanciones = leerHoja("SANCIONES");
    var mapa = {};

    for (var i = 0; i < sanciones.length; i++) {
      var s  = sanciones[i];
      var id = String(s.id_jugador);
      if (!mapa[id]) mapa[id] = { id_jugador: id, id_equipo: s.id_equipo, nombre: "", amarillas: 0, rojas: 0 };
      if (s.tipo_tarjeta === "Amarilla")                    mapa[id].amarillas++;
      if (s.tipo_tarjeta === "Roja" || s.tipo_tarjeta === "Roja directa") mapa[id].rojas++;
    }

    // Enriquecer con nombres
    var jugadores = leerHoja("JUGADORES");
    for (var j = 0; j < jugadores.length; j++) {
      var jug = jugadores[j];
      var jid = String(jug.id_jugador);
      if (mapa[jid]) mapa[jid].nombre = jug.nombre_completo || "";
    }

    var enRiesgo = Object.keys(mapa).filter(function(k) {
      return mapa[k].amarillas === 1 || mapa[k].rojas > 0;
    }).map(function(k) { return mapa[k]; });

    return respuestaExito(enRiesgo, enRiesgo.length + " jugador(es) en riesgo.");
  } catch (e) {
    return respuestaError("Error: " + e.message);
  }
}
