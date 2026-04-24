// ============================================================
// Data_Interclases.gs — Motor de datos principal
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// Funciones: equipos, partidos, tabla de posiciones, fixture,
// goleadores, estadisticas generales del torneo.
// Depende de: Utils.gs
// ============================================================


// ============================================================
// EQUIPOS — CRUD
// ============================================================

/**
 * Retorna todos los equipos inscritos.
 * @return {Object} respuestaExito con array de equipos
 */
function getEquipos() {
  try {
    var equipos = leerHoja("EQUIPOS");
    return respuestaExito(equipos, "Equipos cargados: " + equipos.length);
  } catch (e) {
    log("Data_Interclases", "getEquipos error: " + e.message, "ERROR");
    return respuestaError("Error cargando equipos: " + e.message, "EQUIPOS_ERROR");
  }
}

/**
 * Retorna los equipos filtrados por grado.
 * @param {string} grado - "3", "4", "5", "6", "7"
 * @return {Object} respuestaExito con array
 */
function getEquiposPorGrado(grado) {
  try {
    var todos   = leerHoja("EQUIPOS");
    var filtros = [];
    for (var i = 0; i < todos.length; i++) {
      if (String(todos[i].grado) === String(grado)) {
        filtros.push(todos[i]);
      }
    }
    return respuestaExito(filtros);
  } catch (e) {
    log("Data_Interclases", "getEquiposPorGrado error: " + e.message, "ERROR");
    return respuestaError("Error filtrando equipos: " + e.message);
  }
}

/**
 * Retorna un equipo especifico por su id_equipo.
 * @param {string} idEquipo
 * @return {Object} respuestaExito con el equipo o error
 */
function getEquipoPorId(idEquipo) {
  try {
    var resultado = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    if (!resultado) {
      return respuestaError("Equipo no encontrado: " + idEquipo, "EQUIPO_NO_ENCONTRADO");
    }
    return respuestaExito(resultado.datos);
  } catch (e) {
    log("Data_Interclases", "getEquipoPorId error: " + e.message, "ERROR");
    return respuestaError("Error buscando equipo: " + e.message);
  }
}

/**
 * Retorna el equipo de un grupo especifico.
 * @param {string} grupo - "301", "602", etc.
 * @return {Object} respuestaExito o error
 */
function getEquipoPorGrupo(grupo) {
  try {
    var resultado = buscarFila("EQUIPOS", "grupo", grupo);
    if (!resultado) {
      return respuestaError("Grupo no inscrito: " + grupo, "GRUPO_NO_INSCRITO");
    }
    return respuestaExito(resultado.datos);
  } catch (e) {
    log("Data_Interclases", "getEquipoPorGrupo error: " + e.message, "ERROR");
    return respuestaError("Error buscando equipo por grupo: " + e.message);
  }
}

/**
 * Actualiza el pais asignado de un equipo (post-asignacion IA).
 * @param {string} idEquipo
 * @param {string} pais - Nombre del pais
 * @param {string} banderaCode - Codigo ISO 2 letras (ej: "BR")
 * @return {Object} respuestaExito o error
 */
function actualizarPaisEquipo(idEquipo, pais, banderaCode) {
  try {
    var resultado = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    if (!resultado) {
      return respuestaError("Equipo no encontrado", "EQUIPO_NO_ENCONTRADO");
    }

    var hoja    = getHoja("EQUIPOS");
    var datos   = hoja.getDataRange().getValues();
    var encabs  = datos[0];
    var colPais = encabs.indexOf("pais") + 1;
    var colBand = encabs.indexOf("bandera_codigo") + 1;

    if (colPais === 0 || colBand === 0) {
      return respuestaError("Columnas pais/bandera_codigo no encontradas en IC_Equipos");
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      hoja.getRange(resultado.fila, colPais).setValue(pais);
      hoja.getRange(resultado.fila, colBand).setValue(banderaCode);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Data_Interclases", "Pais actualizado: " + idEquipo + " -> " + pais, "INFO");
    return respuestaExito(null, "Pais asignado correctamente.");
  } catch (e) {
    log("Data_Interclases", "actualizarPaisEquipo error: " + e.message, "ERROR");
    return respuestaError("Error actualizando pais: " + e.message);
  }
}


// ============================================================
// JUGADORES — CRUD
// ============================================================

/**
 * Retorna todos los jugadores de un equipo.
 * @param {string} idEquipo
 * @return {Object} respuestaExito con array de jugadores
 */
function getJugadoresPorEquipo(idEquipo) {
  try {
    var todos    = leerHoja("JUGADORES");
    var resultado = [];
    for (var i = 0; i < todos.length; i++) {
      if (String(todos[i].id_equipo) === String(idEquipo)) {
        resultado.push(todos[i]);
      }
    }
    return respuestaExito(resultado);
  } catch (e) {
    log("Data_Interclases", "getJugadoresPorEquipo error: " + e.message, "ERROR");
    return respuestaError("Error cargando jugadores: " + e.message);
  }
}

/**
 * Retorna todos los jugadores de un grado especifico.
 * @param {string} grado
 * @return {Object}
 */
function getJugadoresPorGrado(grado) {
  try {
    var todos     = leerHoja("JUGADORES");
    var resultado = [];
    for (var i = 0; i < todos.length; i++) {
      if (getGradoGrupo(String(todos[i].grupo)) === String(grado)) {
        resultado.push(todos[i]);
      }
    }
    return respuestaExito(resultado);
  } catch (e) {
    log("Data_Interclases", "getJugadoresPorGrado error: " + e.message, "ERROR");
    return respuestaError("Error cargando jugadores por grado: " + e.message);
  }
}


// ============================================================
// PARTIDOS — CRUD Y GESTION DE ESTADOS
// ============================================================

/**
 * Retorna todos los partidos del torneo.
 * @return {Object}
 */
function getPartidos() {
  try {
    var partidos = leerHoja("PARTIDOS");
    return respuestaExito(partidos, "Partidos cargados: " + partidos.length);
  } catch (e) {
    log("Data_Interclases", "getPartidos error: " + e.message, "ERROR");
    return respuestaError("Error cargando partidos: " + e.message);
  }
}

/**
 * Retorna partidos filtrados por grado y deporte.
 * @param {string} grado - "3","4","5","6","7" (opcional, "" para todos)
 * @param {string} deporte - Nombre del deporte (opcional)
 * @return {Object}
 */
function getPartidosFiltrados(grado, deporte) {
  try {
    var todos     = leerHoja("PARTIDOS");
    var resultado = [];

    for (var i = 0; i < todos.length; i++) {
      var p       = todos[i];
      var okGrado  = !grado  || String(p.grado)   === String(grado);
      var okDeporte = !deporte || String(p.deporte) === String(deporte);
      if (okGrado && okDeporte) {
        resultado.push(p);
      }
    }

    return respuestaExito(resultado);
  } catch (e) {
    log("Data_Interclases", "getPartidosFiltrados error: " + e.message, "ERROR");
    return respuestaError("Error filtrando partidos: " + e.message);
  }
}

/**
 * Retorna los proximos partidos programados (hasta N).
 * @param {number} limite - Cantidad maxima a retornar (default 5)
 * @return {Object}
 */
function getProximosPartidos(limite) {
  try {
    var max      = limite || 5;
    var todos    = leerHoja("PARTIDOS");
    var proximos = [];

    for (var i = 0; i < todos.length; i++) {
      if (todos[i].estado === CONFIG.ESTADOS_PARTIDO.PROGRAMADO) {
        proximos.push(todos[i]);
      }
    }

    // Ordenar por fecha y hora ascendente
    proximos.sort(function(a, b) {
      var fa = String(a.fecha) + " " + String(a.hora);
      var fb = String(b.fecha) + " " + String(b.hora);
      if (fa < fb) return -1;
      if (fa > fb) return 1;
      return 0;
    });

    return respuestaExito(proximos.slice(0, max));
  } catch (e) {
    log("Data_Interclases", "getProximosPartidos error: " + e.message, "ERROR");
    return respuestaError("Error cargando proximos partidos: " + e.message);
  }
}

/**
 * Retorna los partidos recientes finalizados (hasta N).
 * @param {number} limite
 * @return {Object}
 */
function getPartidosFinalizados(limite) {
  try {
    var max        = limite || 5;
    var todos      = leerHoja("PARTIDOS");
    var finalizados = [];

    for (var i = 0; i < todos.length; i++) {
      var est = todos[i].estado;
      if (est === CONFIG.ESTADOS_PARTIDO.FINALIZADO ||
          est === CONFIG.ESTADOS_PARTIDO.WO) {
        finalizados.push(todos[i]);
      }
    }

    // Ordenar por fecha descendente (mas reciente primero)
    finalizados.sort(function(a, b) {
      var fa = String(a.fecha_actualizacion || a.fecha);
      var fb = String(b.fecha_actualizacion || b.fecha);
      if (fa > fb) return -1;
      if (fa < fb) return 1;
      return 0;
    });

    if (finalizados.length === 0) {
      return respuestaExito([], "No hay resultados");
    }

    return respuestaExito(finalizados.slice(0, max));
  } catch (e) {
    log("Data_Interclases", "getPartidosFinalizados error: " + e.message, "ERROR");
    return respuestaError("Error cargando partidos finalizados: " + e.message);
  }
}

/**
 * Retorna el partido actualmente en juego (si hay uno).
 * Regla: solo puede haber UN partido activo (una sola cancha).
 * @return {Object}
 */
function getPartidoEnJuego() {
  try {
    var todos = leerHoja("PARTIDOS");

    for (var i = 0; i < todos.length; i++) {
      if (
        todos[i].estado === CONFIG.ESTADOS_PARTIDO.EN_JUEGO ||
        todos[i].estado === CONFIG.ESTADOS_PARTIDO.MEDIO_TIEMPO
      ) {
        return respuestaExito(todos[i]);
      }
    }

    return respuestaExito(null, "No hay partido en curso.");
  } catch (e) {
    log("Data_Interclases", "getPartidoEnJuego error: " + e.message, "ERROR");
    return respuestaError("Error verificando partido en juego: " + e.message);
  }
}

/**
 * Retorna un partido por su id_partido.
 * @param {string} idPartido
 * @return {Object}
 */
function getPartidoPorId(idPartido) {
  try {
    var resultado = buscarFila("PARTIDOS", "id_partido", idPartido);
    if (!resultado) {
      return respuestaError("Partido no encontrado: " + idPartido, "PARTIDO_NO_ENCONTRADO");
    }
    return respuestaExito(resultado.datos);
  } catch (e) {
    log("Data_Interclases", "getPartidoPorId error: " + e.message, "ERROR");
    return respuestaError("Error buscando partido: " + e.message);
  }
}

/**
 * Agrega un nuevo partido al fixture.
 * Valida que no haya conflicto de cancha (un solo partido activo).
 * @param {Object} datos - Campos del partido a crear
 * @return {Object}
 */
function crearPartido(datos) {
  try {
    // Validaciones basicas
    if (!datos.grado || !datos.deporte || !datos.fase) {
      return respuestaError("Faltan campos requeridos: grado, deporte, fase", "DATOS_INCOMPLETOS");
    }
    if (!datos.id_equipo_local || !datos.id_equipo_visitante) {
      return respuestaError("Se requieren ambos equipos", "DATOS_INCOMPLETOS");
    }
    if (datos.id_equipo_local === datos.id_equipo_visitante) {
      return respuestaError("Un equipo no puede jugar contra si mismo", "EQUIPOS_IGUALES");
    }

    var idPartido = generarId("PA");
    var ahora     = fechaHoraActual();

    // Obtener datos del equipo local
    var eqLocal = buscarFila("EQUIPOS", "id_equipo", datos.id_equipo_local);
    if (!eqLocal) {
      return respuestaError("Equipo local no encontrado", "EQUIPO_NO_ENCONTRADO");
    }

    // Obtener datos del equipo visitante
    var eqVisit = buscarFila("EQUIPOS", "id_equipo", datos.id_equipo_visitante);
    if (!eqVisit) {
      return respuestaError("Equipo visitante no encontrado", "EQUIPO_NO_ENCONTRADO");
    }

    var fila = [
      idPartido,
      datos.fecha       || "",
      datos.hora        || "",
      datos.grado,
      getNivelGrupo(eqLocal.datos.grupo),
      datos.deporte,
      datos.fase,
      datos.id_equipo_local,
      eqLocal.datos.grupo,
      eqLocal.datos.pais,
      eqLocal.datos.bandera_codigo,
      datos.id_equipo_visitante,
      eqVisit.datos.grupo,
      eqVisit.datos.pais,
      eqVisit.datos.bandera_codigo,
      "",                                   // goles_local (sin resultado aun)
      "",                                   // goles_visitante
      CONFIG.ESTADOS_PARTIDO.PROGRAMADO,    // estado inicial
      "",                                   // motivo_aplazado
      "",                                   // nueva_fecha_aplazado
      datos.arbitro     || "",
      datos.observaciones || "",
      ahora,                                // fecha_registro
      ahora                                 // fecha_actualizacion
    ];

    agregarFila("PARTIDOS", fila);

    log("Data_Interclases", "Partido creado: " + idPartido, "INFO");
    return respuestaExito({ id_partido: idPartido }, "Partido creado correctamente.");
  } catch (e) {
    log("Data_Interclases", "crearPartido error: " + e.message, "ERROR");
    return respuestaError("Error creando partido: " + e.message);
  }
}

/**
 * Registra el resultado de un partido finalizado.
 * Actualiza la tabla de posiciones automaticamente.
 * Valida la regla de una sola cancha.
 * @param {string} idPartido
 * @param {number} golesLocal
 * @param {number} golesVisitante
 * @param {string} estado - Normalmente "Finalizado" o "W.O."
 * @param {string} observaciones - Opcional
 * @return {Object}
 */
function registrarResultado(idPartido, golesLocal, golesVisitante, estado, observaciones, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    // Validar estado
    var estadoFinal = estado || CONFIG.ESTADOS_PARTIDO.FINALIZADO;
    if (!estadoPartidoValido(estadoFinal)) {
      return respuestaError("Estado de partido invalido: " + estadoFinal, "ESTADO_INVALIDO");
    }

    // Buscar el partido
    var resultado = buscarFila("PARTIDOS", "id_partido", idPartido);
    if (!resultado) {
      return respuestaError("Partido no encontrado: " + idPartido, "PARTIDO_NO_ENCONTRADO");
    }

    var partido = resultado.datos;
    var filaNum = resultado.fila;

    // No permitir editar un partido ya finalizado sin permiso explicito
    if (
      partido.estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO &&
      estadoFinal    === CONFIG.ESTADOS_PARTIDO.FINALIZADO
    ) {
      // Permitir edicion (el docente puede corregir errores de digitacion)
      log("Data_Interclases", "Editando resultado ya registrado: " + idPartido, "WARN");
    }

    // Actualizar campos en la hoja
    var hoja   = getHoja("PARTIDOS");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];

    var colGolesL = encabs.indexOf("goles_local") + 1;
    var colGolesV = encabs.indexOf("goles_visitante") + 1;
    var colEstado = encabs.indexOf("estado") + 1;
    var colObs    = encabs.indexOf("observaciones") + 1;
    var colFechaU = encabs.indexOf("fecha_actualizacion") + 1;

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      hoja.getRange(filaNum, colGolesL).setValue(Number(golesLocal)    || 0);
      hoja.getRange(filaNum, colGolesV).setValue(Number(golesVisitante) || 0);
      hoja.getRange(filaNum, colEstado).setValue(estadoFinal);
      if (observaciones) {
        hoja.getRange(filaNum, colObs).setValue(observaciones);
      }
      hoja.getRange(filaNum, colFechaU).setValue(fechaHoraActual());
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    // Recalcular tabla de posiciones para este grado y deporte
    if (estadoFinal === CONFIG.ESTADOS_PARTIDO.FINALIZADO ||
        estadoFinal === CONFIG.ESTADOS_PARTIDO.WO) {
      recalcularTablaGrado(String(partido.grado), String(partido.deporte));

      // ── AUTO-TRIGGER CORRECCIÓN AUDITORÍA ──
      // Si el partido era de Fase 1 (semifinal de Primaria), verificar si
      // AMBAS semifinales están finalizadas para actualizar los cruces
      // Final y 3er Puesto automáticamente — sin intervención manual.
      var esFase1 = (
        String(partido.fase) === "Fase 1 - Partido A" ||
        String(partido.fase) === "Fase 1 - Partido B"
      );
      if (esFase1) {
        var todosLosPartidos = leerHoja("PARTIDOS");
        var faseA = null, faseB = null;
        for (var x = 0; x < todosLosPartidos.length; x++) {
          var px = todosLosPartidos[x];
          if (String(px.grado)   !== String(partido.grado))   continue;
          if (String(px.deporte) !== String(partido.deporte)) continue;
          if (px.fase === "Fase 1 - Partido A") faseA = px;
          if (px.fase === "Fase 1 - Partido B") faseB = px;
        }
        var ambosFinalizados = (
          faseA && faseB &&
          (faseA.estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO || faseA.estado === CONFIG.ESTADOS_PARTIDO.WO) &&
          (faseB.estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO || faseB.estado === CONFIG.ESTADOS_PARTIDO.WO)
        );
        if (ambosFinalizados) {
          try {
            actualizarCrucesFinal(String(partido.grado), String(partido.deporte), "__internal__");
            log("Data_Interclases",
                "Auto-cruces: Final y 3er Puesto actualizados para Grado " +
                partido.grado + " - " + partido.deporte, "INFO");
          } catch (eCruces) {
            log("Data_Interclases",
                "Auto-cruces warning: " + eCruces.message, "WARN");
          }
        }
      }
    }

    // Invalidar cache de la tabla afectada (AUDITORIA v3)
    try { invalidarCacheTabla(String(partido.grado), String(partido.deporte)); } catch (_) {}

    log("Data_Interclases",
        "Resultado registrado: " + idPartido + " | " +
        golesLocal + "-" + golesVisitante + " | " + estadoFinal, "INFO");

    return respuestaExito(
      { id_partido: idPartido, goles_local: golesLocal, goles_visitante: golesVisitante },
      "Resultado registrado correctamente."
    );
  } catch (e) {
    log("Data_Interclases", "registrarResultado error: " + e.message, "ERROR");
    return respuestaError("Error registrando resultado: " + e.message);
  }
}

/**
 * Cambia el estado de un partido (sin modificar marcador).
 * Valida la regla de una sola cancha para EN_JUEGO.
 * @param {string} idPartido
 * @param {string} nuevoEstado - Valor de CONFIG.ESTADOS_PARTIDO
 * @param {string} motivo - Requerido si estado es APLAZADO
 * @param {string} nuevaFecha - Opcional para APLAZADO
 * @return {Object}
 */
function cambiarEstadoPartido(idPartido, nuevoEstado, motivo, nuevaFecha, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!estadoPartidoValido(nuevoEstado)) {
      return respuestaError("Estado invalido: " + nuevoEstado, "ESTADO_INVALIDO");
    }

    // Regla de cancha unica: solo un partido EN_JUEGO a la vez
    if (nuevoEstado === CONFIG.ESTADOS_PARTIDO.EN_JUEGO) {
      var enJuego = getPartidoEnJuego();
      if (enJuego.ok && enJuego.datos !== null) {
        var pEnJuego = enJuego.datos;
        if (String(pEnJuego.id_partido) !== String(idPartido)) {
          return respuestaError(
            "Ya hay un partido en juego: " + pEnJuego.id_partido +
            " (" + pEnJuego.pais_local + " vs " + pEnJuego.pais_visitante + ")." +
            " Finaliza ese partido antes de iniciar uno nuevo.",
            "CANCHA_OCUPADA"
          );
        }
      }
    }

    // Aplazado requiere motivo
    if (nuevoEstado === CONFIG.ESTADOS_PARTIDO.APLAZADO && !motivo) {
      return respuestaError(
        "Debes indicar el motivo del aplazamiento", "MOTIVO_REQUERIDO"
      );
    }

    var resultado = buscarFila("PARTIDOS", "id_partido", idPartido);
    if (!resultado) {
      return respuestaError("Partido no encontrado", "PARTIDO_NO_ENCONTRADO");
    }

    var hoja   = getHoja("PARTIDOS");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];

    var colEstado  = encabs.indexOf("estado") + 1;
    var colMotivo  = encabs.indexOf("motivo_aplazado") + 1;
    var colNuevFec = encabs.indexOf("nueva_fecha_aplazado") + 1;
    var colFechaU  = encabs.indexOf("fecha_actualizacion") + 1;

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      hoja.getRange(resultado.fila, colEstado).setValue(nuevoEstado);
      if (motivo) {
        hoja.getRange(resultado.fila, colMotivo).setValue(motivo);
      }
      if (nuevaFecha) {
        hoja.getRange(resultado.fila, colNuevFec).setValue(nuevaFecha);
      }
      hoja.getRange(resultado.fila, colFechaU).setValue(fechaHoraActual());
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Data_Interclases",
        "Estado cambiado: " + idPartido + " -> " + nuevoEstado, "INFO");

    return respuestaExito(null, "Estado actualizado: " + nuevoEstado);
  } catch (e) {
    log("Data_Interclases", "cambiarEstadoPartido error: " + e.message, "ERROR");
    return respuestaError("Error cambiando estado: " + e.message);
  }
}


// ============================================================
// FIXTURE — GENERACION AUTOMATICA
// ============================================================

/**
 * Genera el fixture completo para un grado y deporte.
 * Primaria (4 equipos): eliminacion directa
 *   - Partido A: Equipo1 vs Equipo2
 *   - Partido B: Equipo3 vs Equipo4
 *   - 3er puesto: Perdedor A vs Perdedor B
 *   - Final: Ganador A vs Ganador B
 * Bachillerato (3 equipos): todos contra todos
 *   - Partido 1: A vs B
 *   - Partido 2: A vs C
 *   - Partido 3: B vs C
 *
 * @param {string} grado - "3","4","5","6","7"
 * @param {string} deporte - Nombre del deporte
 * @param {string} fechaBase - "YYYY-MM-DD" fecha de inicio
 * @param {string} horaInicio - "HH:MM" hora del primer partido
 * @return {Object}
 */
function generarFixture(grado, deporte, fechaBase, horaInicio, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    var grupos = CONFIG.GRUPOS[String(grado)];
    if (!grupos) {
      return respuestaError("Grado invalido: " + grado, "GRADO_INVALIDO");
    }

    var nivel = (CONFIG.GRADOS.PRIMARIA.indexOf(String(grado)) !== -1)
                ? "Primaria" : "Bachillerato";

    // ── FIX Bug 1: buscar por id_equipo (grupo + deporte), NO solo por grupo ──
    // Antes: buscarFila("EQUIPOS","grupo",grupos[i]) → devolvía el PRIMER equipo
    //        del grupo sin importar el deporte → equipos del 2do deporte nunca encontrados
    // Ahora: generar el id_equipo correcto (ej "301_MF") y buscar por clave exacta
    var equiposGrado = [];
    var todosEquipos = leerHoja("EQUIPOS"); // 1 sola lectura para todos los grupos
    var mapaEquipos  = {};
    for (var m = 0; m < todosEquipos.length; m++) {
      mapaEquipos[String(todosEquipos[m].id_equipo)] = todosEquipos[m];
    }

    for (var i = 0; i < grupos.length; i++) {
      var idEsperado;
      try {
        idEsperado = generarIdEquipo(grupos[i], deporte);
      } catch (eId) {
        log("Data_Interclases", "generarFixture: deporte no reconocido '" + deporte + "'", "WARN");
        continue;
      }
      if (mapaEquipos[idEsperado]) {
        equiposGrado.push(mapaEquipos[idEsperado]);
      } else {
        log("Data_Interclases",
            "generarFixture: equipo no encontrado en IC_Equipos: " + idEsperado +
            " (grupo=" + grupos[i] + ", deporte=" + deporte + ")", "WARN");
      }
    }

    if (equiposGrado.length < 2) {
      return respuestaError(
        "No hay suficientes equipos inscritos para el grado " + grado +
        " (minimo 2, encontrados: " + equiposGrado.length + ")",
        "EQUIPOS_INSUFICIENTES"
      );
    }

    // Verificar que ya exista fixture para este grado/deporte
    var partidosExistentes = leerHoja("PARTIDOS");
    for (var k = 0; k < partidosExistentes.length; k++) {
      var pe = partidosExistentes[k];
      if (
        String(pe.grado)   === String(grado) &&
        String(pe.deporte) === String(deporte) &&
        pe.estado !== CONFIG.ESTADOS_PARTIDO.SUSPENDIDO
      ) {
        return respuestaError(
          "Ya existe fixture para Grado " + grado + " - " + deporte +
          ". Elimina los partidos existentes antes de regenerar.",
          "FIXTURE_EXISTENTE"
        );
      }
    }

    var partidos   = [];
    var minutosExtra = 0;
    var DURACION_MIN = 60; // Minutos entre partidos (incluye descanso)

    // ---- PRIMARIA: Eliminacion directa (4 equipos) ----
    if (nivel === "Primaria" && equiposGrado.length === 4) {
      var eq1 = equiposGrado[0];
      var eq2 = equiposGrado[1];
      var eq3 = equiposGrado[2];
      var eq4 = equiposGrado[3];

      // Partido A — Fase 1
      partidos.push({
        id_equipo_local     : eq1.id_equipo,
        id_equipo_visitante : eq2.id_equipo,
        grado               : grado,
        deporte             : deporte,
        fase                : "Fase 1 - Partido A",
        fecha               : fechaBase,
        hora                : calcularHora(horaInicio, minutosExtra),
        arbitro             : ""
      });
      minutosExtra = minutosExtra + DURACION_MIN;

      // Partido B — Fase 1
      partidos.push({
        id_equipo_local     : eq3.id_equipo,
        id_equipo_visitante : eq4.id_equipo,
        grado               : grado,
        deporte             : deporte,
        fase                : "Fase 1 - Partido B",
        fecha               : fechaBase,
        hora                : calcularHora(horaInicio, minutosExtra),
        arbitro             : ""
      });
      minutosExtra = minutosExtra + DURACION_MIN;

      // Partido 3er puesto (por definir equipos al finalizar Fase 1)
      partidos.push({
        id_equipo_local     : "POR_DEFINIR",
        id_equipo_visitante : "POR_DEFINIR",
        grado               : grado,
        deporte             : deporte,
        fase                : "Tercer Puesto",
        fecha               : fechaBase,
        hora                : calcularHora(horaInicio, minutosExtra),
        arbitro             : ""
      });
      minutosExtra = minutosExtra + DURACION_MIN;

      // Final
      partidos.push({
        id_equipo_local     : "POR_DEFINIR",
        id_equipo_visitante : "POR_DEFINIR",
        grado               : grado,
        deporte             : deporte,
        fase                : "Final",
        fecha               : fechaBase,
        hora                : calcularHora(horaInicio, minutosExtra),
        arbitro             : ""
      });

    // ---- BACHILLERATO: Todos contra todos (3 equipos) ----
    } else if (nivel === "Bachillerato" && equiposGrado.length === 3) {
      var eqA = equiposGrado[0];
      var eqB = equiposGrado[1];
      var eqC = equiposGrado[2];

      // Partido 1: A vs B
      partidos.push({
        id_equipo_local     : eqA.id_equipo,
        id_equipo_visitante : eqB.id_equipo,
        grado               : grado,
        deporte             : deporte,
        fase                : "Todos vs Todos - J1",
        fecha               : fechaBase,
        hora                : calcularHora(horaInicio, minutosExtra),
        arbitro             : ""
      });
      minutosExtra = minutosExtra + DURACION_MIN;

      // Partido 2: A vs C
      partidos.push({
        id_equipo_local     : eqA.id_equipo,
        id_equipo_visitante : eqC.id_equipo,
        grado               : grado,
        deporte             : deporte,
        fase                : "Todos vs Todos - J2",
        fecha               : fechaBase,
        hora                : calcularHora(horaInicio, minutosExtra),
        arbitro             : ""
      });
      minutosExtra = minutosExtra + DURACION_MIN;

      // Partido 3: B vs C
      partidos.push({
        id_equipo_local     : eqB.id_equipo,
        id_equipo_visitante : eqC.id_equipo,
        grado               : grado,
        deporte             : deporte,
        fase                : "Todos vs Todos - J3",
        fecha               : fechaBase,
        hora                : calcularHora(horaInicio, minutosExtra),
        arbitro             : ""
      });

    // ---- FIXTURE GENERICO para otros casos ----
    } else {
      // Round robin simple para N equipos
      var resultado = generarRoundRobin(equiposGrado, grado, deporte, fechaBase, horaInicio);
      return resultado;
    }

    // Crear todos los partidos en la hoja
    var idsCreados = [];
    for (var p = 0; p < partidos.length; p++) {
      var r = crearPartido(partidos[p]);
      if (r.ok) {
        idsCreados.push(r.datos.id_partido);
      } else {
        log("Data_Interclases", "Error creando partido del fixture: " + r.mensaje, "ERROR");
      }
    }

    log("Data_Interclases",
        "Fixture generado: Grado " + grado + " - " + deporte +
        " | " + idsCreados.length + " partidos", "INFO");

    return respuestaExito(
      { partidos_creados: idsCreados.length, ids: idsCreados },
      "Fixture generado: " + idsCreados.length + " partidos para Grado " + grado
    );
  } catch (e) {
    log("Data_Interclases", "generarFixture error: " + e.message, "ERROR");
    return respuestaError("Error generando fixture: " + e.message);
  }
}

/**
 * Genera round robin para N equipos (caso generico).
 * Cada equipo juega contra todos los demas.
 * @param {Array} equipos
 * @param {string} grado
 * @param {string} deporte
 * @param {string} fechaBase
 * @param {string} horaInicio
 * @return {Object}
 */
function generarRoundRobin(equipos, grado, deporte, fechaBase, horaInicio) {
  var partidos     = [];
  var minutosExtra = 0;
  var DURACION_MIN = 60;

  for (var i = 0; i < equipos.length; i++) {
    for (var j = i + 1; j < equipos.length; j++) {
      partidos.push({
        id_equipo_local     : equipos[i].id_equipo,
        id_equipo_visitante : equipos[j].id_equipo,
        grado               : grado,
        deporte             : deporte,
        fase                : "Todos vs Todos - J" + (partidos.length + 1),
        fecha               : fechaBase,
        hora                : calcularHora(horaInicio, minutosExtra),
        arbitro             : ""
      });
      minutosExtra = minutosExtra + DURACION_MIN;
    }
  }

  var idsCreados = [];
  for (var p = 0; p < partidos.length; p++) {
    var r = crearPartido(partidos[p]);
    if (r.ok) {
      idsCreados.push(r.datos.id_partido);
    }
  }

  return respuestaExito(
    { partidos_creados: idsCreados.length, ids: idsCreados },
    "Round robin generado: " + idsCreados.length + " partidos"
  );
}

/**
 * Asigna los equipos a los partidos de 3er puesto y Final
 * una vez que los partidos de Fase 1 estan finalizados (primaria).
 * @param {string} grado
 * @param {string} deporte
 * @return {Object}
 */
function actualizarCrucesFinal(grado, deporte, pin) {
  try {
    // Allow internal calls (no pin) from auto-trigger
    if (pin !== undefined && pin !== null && pin !== "__internal__") {
      var auth = verificarPIN(pin || "");
      if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    }
    var todos    = leerHoja("PARTIDOS");
    var partidoA = null;
    var partidoB = null;
    var tercero  = null;
    var final_p  = null;

    for (var i = 0; i < todos.length; i++) {
      var p = todos[i];
      if (
        String(p.grado)   !== String(grado) ||
        String(p.deporte) !== String(deporte)
      ) continue;

      if (p.fase === "Fase 1 - Partido A") partidoA = p;
      if (p.fase === "Fase 1 - Partido B") partidoB = p;
      if (p.fase === "Tercer Puesto")       tercero  = p;
      if (p.fase === "Final")               final_p  = p;
    }

    if (!partidoA || !partidoB) {
      return respuestaError("No se encontraron los partidos de Fase 1", "FASE1_INCOMPLETA");
    }

    if (
      partidoA.estado !== CONFIG.ESTADOS_PARTIDO.FINALIZADO ||
      partidoB.estado !== CONFIG.ESTADOS_PARTIDO.FINALIZADO
    ) {
      return respuestaError(
        "Los partidos de Fase 1 deben estar finalizados para actualizar cruces",
        "FASE1_NO_FINALIZADA"
      );
    }

    // Determinar ganadores y perdedores de Fase 1
    var ganadorA  = Number(partidoA.goles_local) > Number(partidoA.goles_visitante)
                    ? partidoA.id_equipo_local : partidoA.id_equipo_visitante;
    var perdedorA = Number(partidoA.goles_local) > Number(partidoA.goles_visitante)
                    ? partidoA.id_equipo_visitante : partidoA.id_equipo_local;

    var ganadorB  = Number(partidoB.goles_local) > Number(partidoB.goles_visitante)
                    ? partidoB.id_equipo_local : partidoB.id_equipo_visitante;
    var perdedorB = Number(partidoB.goles_local) > Number(partidoB.goles_visitante)
                    ? partidoB.id_equipo_visitante : partidoB.id_equipo_local;

    // En caso de empate (no deberia ocurrir en eliminacion directa,
    // pero por seguridad se asigna el local como "ganador")
    if (Number(partidoA.goles_local) === Number(partidoA.goles_visitante)) {
      ganadorA  = partidoA.id_equipo_local;
      perdedorA = partidoA.id_equipo_visitante;
    }
    if (Number(partidoB.goles_local) === Number(partidoB.goles_visitante)) {
      ganadorB  = partidoB.id_equipo_local;
      perdedorB = partidoB.id_equipo_visitante;
    }

    // Actualizar 3er puesto
    if (tercero) {
      _actualizarEquiposPartido(tercero.id_partido, perdedorA, perdedorB);
    }

    // Actualizar Final
    if (final_p) {
      _actualizarEquiposPartido(final_p.id_partido, ganadorA, ganadorB);
    }

    log("Data_Interclases",
        "Cruces actualizados: Grado " + grado + " - " + deporte, "INFO");

    return respuestaExito(null, "Cruces de Final y 3er Puesto actualizados correctamente.");
  } catch (e) {
    log("Data_Interclases", "actualizarCrucesFinal error: " + e.message, "ERROR");
    return respuestaError("Error actualizando cruces: " + e.message);
  }
}

/**
 * Actualiza los equipos de un partido existente.
 * Funcion interna — no llamar directamente desde frontend.
 * @param {string} idPartido
 * @param {string} idLocal
 * @param {string} idVisitante
 */
function _actualizarEquiposPartido(idPartido, idLocal, idVisitante) {
  var result = buscarFila("PARTIDOS", "id_partido", idPartido);
  if (!result) return;

  var eqL = buscarFila("EQUIPOS", "id_equipo", idLocal);
  var eqV = buscarFila("EQUIPOS", "id_equipo", idVisitante);
  if (!eqL || !eqV) return;

  var hoja   = getHoja("PARTIDOS");
  var datos  = hoja.getDataRange().getValues();
  var encabs = datos[0];

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    hoja.getRange(result.fila, encabs.indexOf("id_equipo_local")      + 1).setValue(idLocal);
    hoja.getRange(result.fila, encabs.indexOf("grupo_local")           + 1).setValue(eqL.datos.grupo);
    hoja.getRange(result.fila, encabs.indexOf("pais_local")            + 1).setValue(eqL.datos.pais);
    hoja.getRange(result.fila, encabs.indexOf("bandera_local")         + 1).setValue(eqL.datos.bandera_codigo);
    hoja.getRange(result.fila, encabs.indexOf("id_equipo_visitante")   + 1).setValue(idVisitante);
    hoja.getRange(result.fila, encabs.indexOf("grupo_visitante")       + 1).setValue(eqV.datos.grupo);
    hoja.getRange(result.fila, encabs.indexOf("pais_visitante")        + 1).setValue(eqV.datos.pais);
    hoja.getRange(result.fila, encabs.indexOf("bandera_visitante")     + 1).setValue(eqV.datos.bandera_codigo);
    hoja.getRange(result.fila, encabs.indexOf("fecha_actualizacion")   + 1).setValue(fechaHoraActual());
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

/**
 * Calcula una hora sumando minutos a una hora base.
 * @param {string} horaBase - "HH:MM"
 * @param {number} minutosExtra
 * @return {string} "HH:MM"
 */
// calcularHora ya está definida en Utils.js — no se duplica aquí.
// Referencia: Utils.js función calcularHora(horaBase, minutosExtra)


// ============================================================
// TABLA DE POSICIONES
// ============================================================

/**
 * Recalcula la tabla de posiciones para un grado y deporte.
 * Lee todos los partidos finalizados y reconstruye las estadisticas.
 * Escribe los resultados en IC_Tabla_Posiciones.
 * @param {string} grado
 * @param {string} deporte
 */
function recalcularTablaGrado(grado, deporte) {
  try {
    var partidos = leerHoja("PARTIDOS");
    var equipos  = leerHoja("EQUIPOS");

    // Filtrar equipos del grado
    var equiposGrado = [];
    for (var i = 0; i < equipos.length; i++) {
      if (String(equipos[i].grado) === String(grado)) {
        equiposGrado.push(equipos[i]);
      }
    }

    // Inicializar stats por equipo
    var stats = {};
    for (var j = 0; j < equiposGrado.length; j++) {
      var eq = equiposGrado[j];
      stats[eq.id_equipo] = {
        id_equipo : eq.id_equipo,
        grupo     : eq.grupo,
        pais      : eq.pais,
        bandera   : eq.bandera_codigo,
        pj: 0, pg: 0, pe: 0, pp: 0,
        gf: 0, gc: 0, dg: 0, puntos: 0
      };
    }

    // Procesar partidos finalizados
    for (var k = 0; k < partidos.length; k++) {
      var p = partidos[k];
      if (
        String(p.grado)   !== String(grado)    ||
        String(p.deporte) !== String(deporte)   ||
        (p.estado !== CONFIG.ESTADOS_PARTIDO.FINALIZADO &&
         p.estado !== CONFIG.ESTADOS_PARTIDO.WO)
      ) continue;

      // Solo procesar partidos que NO son de eliminacion directa/final
      // en primaria (esos no van a la tabla, son playoff)
      var esTabla = (
        p.fase === "Todos vs Todos - J1" ||
        p.fase === "Todos vs Todos - J2" ||
        p.fase === "Todos vs Todos - J3" ||
        p.fase === "Fase 1 - Partido A"  ||
        p.fase === "Fase 1 - Partido B"
      );

      if (!esTabla) continue;

      var idL = String(p.id_equipo_local);
      var idV = String(p.id_equipo_visitante);
      var gL  = Number(p.goles_local)     || 0;
      var gV  = Number(p.goles_visitante) || 0;

      if (!stats[idL] || !stats[idV]) continue;

      // W.O. — el equipo que no se presento pierde 0-3
      if (p.estado === CONFIG.ESTADOS_PARTIDO.WO) {
        // Se asume que visitante no se presento (el docente decide quien es WO
        // en observaciones; aqui procesamos local como ganador por defecto)
        _sumarStats(stats[idL], 3, 0, true,  false, false);
        _sumarStats(stats[idV], 0, 3, false, false, true);
        stats[idL].pg++;   // ← FIX: W.O. local gana
        stats[idV].pp++;   // ← FIX: W.O. visitante pierde
        continue;
      }

      // Partido normal
      if (gL > gV) {
        _sumarStats(stats[idL], gL, gV, false, false, false);
        _sumarStats(stats[idV], gV, gL, false, false, true);
        stats[idL].pg++;
        stats[idV].pp++;
      } else if (gL < gV) {
        _sumarStats(stats[idL], gL, gV, false, false, true);
        _sumarStats(stats[idV], gV, gL, false, false, false);
        stats[idL].pp++;
        stats[idV].pg++;
      } else {
        // Empate
        _sumarStats(stats[idL], gL, gV, false, true, false);
        _sumarStats(stats[idV], gV, gL, false, true, false);
        stats[idL].pe++;
        stats[idV].pe++;
      }
    }

    // Recalcular diferencia de goles y puntos finales
    for (var id in stats) {
      var s = stats[id];
      s.dg     = s.gf - s.gc;
      s.puntos = s.pg * CONFIG.PUNTOS.VICTORIA + s.pe * CONFIG.PUNTOS.EMPATE;
    }

    // Ordenar
    var listaStats = [];
    for (var key in stats) {
      listaStats.push(stats[key]);
    }
    listaStats = ordenarTabla(listaStats.map(function(s) {
      return {
        nombre  : s.pais,
        puntos  : s.puntos,
        dg      : s.dg,
        gf      : s.gf,
        _orig   : s
      };
    })).map(function(x) { return x._orig; });

    // Escribir en IC_Tabla_Posiciones
    _escribirTablaGrado(grado, deporte, listaStats);

    log("Data_Interclases",
        "Tabla recalculada: Grado " + grado + " - " + deporte, "INFO");
  } catch (e) {
    log("Data_Interclases", "recalcularTablaGrado error: " + e.message, "ERROR");
  }
}

/**
 * Acumula estadisticas de un partido para un equipo.
 * Funcion interna.
 */
function _sumarStats(stat, gfPartido, gcPartido, esWoGanador, esEmpate, esPerdedor) {
  stat.pj = stat.pj + 1;
  stat.gf = stat.gf + gfPartido;
  stat.gc = stat.gc + gcPartido;
}

/**
 * Escribe la tabla de posiciones en la hoja IC_Tabla_Posiciones.
 * Primero borra las filas de ese grado/deporte, luego escribe las nuevas.
 * @param {string} grado
 * @param {string} deporte
 * @param {Array} listaStats
 */
function _escribirTablaGrado(grado, deporte, listaStats) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var hoja    = getHoja("TABLA_POSICIONES");
    var datos   = hoja.getDataRange().getValues();
    var encabs  = datos[0];

    // Eliminar filas existentes de este grado/deporte (de abajo hacia arriba)
    for (var i = datos.length - 1; i >= 1; i--) {
      if (
        String(datos[i][encabs.indexOf("grado")])   === String(grado) &&
        String(datos[i][encabs.indexOf("deporte")]) === String(deporte)
      ) {
        hoja.deleteRow(i + 1);
      }
    }

    // Insertar nuevas filas
    var ahora = fechaHoraActual();
    for (var j = 0; j < listaStats.length; j++) {
      var s = listaStats[j];
      hoja.appendRow([
        generarId("TB"),
        grado,
        deporte,
        s.id_equipo,
        s.grupo,
        s.pais,
        s.bandera,
        s.pj,
        s.pg,
        s.pe,
        s.pp,
        s.gf,
        s.gc,
        s.dg,
        s.puntos,
        j + 1,    // posicion
        ahora
      ]);
    }

    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// TABLA DE POSICIONES CON CACHESERVICE (AUDITORIA v3)
// ============================================================

var CACHE_TTL_SEGUNDOS = 120; // 2 minutos — ajustable

/**
 * Retorna la tabla de posiciones para un grado y deporte.
 * v3: usa CacheService para evitar lecturas repetidas de Sheets.
 * TTL: 120 segundos. Se invalida automaticamente al registrar resultados.
 * @param {string} grado
 * @param {string} deporte
 * @return {Object}
 */
function getTablaGrado(grado, deporte) {
  return getTablaGradoCached(grado, deporte);
}

/**
 * Implementacion con CacheService.
 * Primera llamada: lee Sheets y llena cache (~2s).
 * Llamadas siguientes (dentro de TTL): retorna desde cache (<100ms).
 * @param {string} grado
 * @param {string} deporte
 * @return {Object}
 */
function getTablaGradoCached(grado, deporte) {
  try {
    var cacheKey = "TABLA_" + String(grado) + "_" + String(deporte).replace(/\s/g, "_");
    var cache    = CacheService.getScriptCache();
    var cached   = null;

    try { cached = cache.get(cacheKey); } catch (_) {}

    if (cached) {
      try {
        var datos = JSON.parse(cached);
        return respuestaExito(datos, "Tabla desde cache (Grado " + grado + " " + deporte + ").");
      } catch (_) {}
    }

    // Cache miss: leer desde Sheets
    var tabla    = leerHoja("TABLA_POSICIONES");
    var filtrada = [];

    for (var i = 0; i < tabla.length; i++) {
      var t = tabla[i];
      var okGrado   = !grado   || String(t.grado)   === String(grado);
      var okDeporte = !deporte || String(t.deporte)  === String(deporte);
      if (okGrado && okDeporte) filtrada.push(t);
    }

    filtrada.sort(function(a, b) {
      return (Number(a.posicion) || 99) - (Number(b.posicion) || 99);
    });

    // Guardar en cache
    try { cache.put(cacheKey, JSON.stringify(filtrada), CACHE_TTL_SEGUNDOS); } catch (_) {}

    return respuestaExito(filtrada, "Tabla desde Sheets (Grado " + grado + " " + deporte + ").");
  } catch (e) {
    log("Data_Interclases", "getTablaGradoCached error: " + e.message, "ERROR");
    return respuestaError("Error cargando tabla: " + e.message);
  }
}

/**
 * Invalida el cache de la tabla de un grado/deporte especifico.
 * Llamar siempre que se registre un resultado de partido.
 * @param {string} grado
 * @param {string} deporte
 */
function invalidarCacheTabla(grado, deporte) {
  try {
    var cacheKey = "TABLA_" + String(grado) + "_" + String(deporte).replace(/\s/g, "_");
    CacheService.getScriptCache().remove(cacheKey);
    log("Data_Interclases", "Cache invalidado: " + cacheKey, "INFO");
  } catch (e) {
    log("Data_Interclases", "invalidarCacheTabla error: " + e.message, "WARN");
  }
}

/**
 * Invalida TODOS los caches de tablas del torneo.
 * Llamar tras recalcularTodasLasTablas() o como reset total.
 */
function invalidarTodosCachesTablas() {
  try {
    var combos = [
      ["3","Mini_Futsal"], ["3","Mini_Voleibol"],
      ["4","Mini_Futsal"], ["4","Mini_Voleibol"],
      ["5","Mini_Futsal"], ["5","Mini_Voleibol"],
      ["6","Futsal"],      ["6","Voleibol"],
      ["7","Futsal"],      ["7","Voleibol"]
    ];
    var keys = combos.map(function(c) { return "TABLA_" + c[0] + "_" + c[1]; });
    CacheService.getScriptCache().removeAll(keys);
    log("Data_Interclases", "Todos los caches de tablas invalidados (" + keys.length + ").", "INFO");
  } catch (e) {
    log("Data_Interclases", "invalidarTodosCachesTablas error: " + e.message, "WARN");
  }
}

// ============================================================
// CONTROL DE VISIBILIDAD DEL FIXTURE (AUDITORIA v3)
// ============================================================

/**
 * Retorna SOLO los partidos visibles al publico.
 * Excluye: estado "Oculto" (borradores no publicados).
 * Si el flag "FIXTURE_PUBLICADO" es "no", solo muestra Finalizados/En juego.
 *
 * Esta funcion REEMPLAZA a getPartidos() en todos los modulos HTML publicos.
 *
 * @param {string} grado   - Filtro opcional de grado
 * @param {string} deporte - Filtro opcional de deporte
 * @return {Object} respuestaExito con array de partidos visibles
 */
function getPartidosPublicos(grado, deporte) {
  try {
    // Verificar si el fixture ha sido publicado por el admin
    var props            = PropertiesService.getScriptProperties();
    var fixturePublicado = (props.getProperty("FIXTURE_PUBLICADO") || "no").toLowerCase();

    var todos     = leerHoja("PARTIDOS");
    var resultado = [];

    for (var i = 0; i < todos.length; i++) {
      var p = todos[i];

      // Nunca mostrar borradores ocultos
      if (p.estado === CONFIG.ESTADOS_PARTIDO.OCULTO)    continue;

      // Si el fixture NO esta publicado, permitir los estados requeridos (Finalizado, Programado, Suspendido)
      if (fixturePublicado !== "si") {
        var estadoVisible = (
          p.estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO   ||
          p.estado === CONFIG.ESTADOS_PARTIDO.EN_JUEGO     ||
          p.estado === CONFIG.ESTADOS_PARTIDO.MEDIO_TIEMPO ||
          p.estado === CONFIG.ESTADOS_PARTIDO.WO           ||
          p.estado === CONFIG.ESTADOS_PARTIDO.PROGRAMADO   ||
          p.estado === CONFIG.ESTADOS_PARTIDO.SUSPENDIDO
        );
        if (!estadoVisible) continue;
      }

      // Filtros opcionales
      var okGrado   = !grado   || String(p.grado)   === String(grado);
      var okDeporte = !deporte || String(p.deporte) === String(deporte);
      if (!okGrado || !okDeporte) continue;

      resultado.push(p);
    }

    return respuestaExito(resultado, resultado.length + " partidos publicos.");
  } catch (e) {
    log("Data_Interclases", "getPartidosPublicos error: " + e.message, "ERROR");
    return respuestaError("Error cargando partidos publicos: " + e.message);
  }
}

/**
 * Retorna los proximos partidos publicos programados (hasta N).
 * v3: usa getPartidosPublicos() en lugar de leer todos sin filtro.
 * @param {number} limite
 * @return {Object}
 */
function getProximosPartidosPublicos(limite) {
  try {
    var max      = limite || 5;
    var todos    = leerHoja("PARTIDOS");
    var props    = PropertiesService.getScriptProperties();
    var publicado = (props.getProperty("FIXTURE_PUBLICADO") || "no").toLowerCase();
    var proximos = [];

    for (var i = 0; i < todos.length; i++) {
      var p = todos[i];
      if (p.estado === CONFIG.ESTADOS_PARTIDO.OCULTO)    continue;
      if (publicado !== "si" && p.estado !== CONFIG.ESTADOS_PARTIDO.EN_JUEGO &&
          p.estado !== CONFIG.ESTADOS_PARTIDO.MEDIO_TIEMPO &&
          p.estado !== CONFIG.ESTADOS_PARTIDO.PROGRAMADO &&
          p.estado !== CONFIG.ESTADOS_PARTIDO.SUSPENDIDO) continue;
      if (p.estado !== CONFIG.ESTADOS_PARTIDO.PROGRAMADO) continue;
      proximos.push(p);
    }

    proximos.sort(function(a, b) {
      var fa = String(a.fecha) + " " + String(a.hora);
      var fb = String(b.fecha) + " " + String(b.hora);
      return fa < fb ? -1 : fa > fb ? 1 : 0;
    });

    return respuestaExito(proximos.slice(0, max));
  } catch (e) {
    log("Data_Interclases", "getProximosPartidosPublicos error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}

/**
 * Publica el fixture — lo hace visible al publico.
 * Requiere PIN admin. Cambia el flag FIXTURE_PUBLICADO a "si".
 * @param {string} pin
 * @return {Object}
 */
function publicarFixture(pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    PropertiesService.getScriptProperties().setProperty("FIXTURE_PUBLICADO", "si");
    log("Data_Interclases", "Fixture publicado por admin.", "INFO");
    return respuestaExito(null, "Fixture publicado. Los partidos son ahora visibles al publico.");
  } catch (e) {
    log("Data_Interclases", "publicarFixture error: " + e.message, "ERROR");
    return respuestaError("Error publicando fixture: " + e.message);
  }
}

/**
 * Oculta el fixture — vuelve a modo borrador.
 * Los estudiantes solo ven partidos finalizados/en juego.
 * @param {string} pin
 * @return {Object}
 */
function ocultarFixture(pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    PropertiesService.getScriptProperties().setProperty("FIXTURE_PUBLICADO", "no");
    log("Data_Interclases", "Fixture ocultado por admin.", "INFO");
    return respuestaExito(null, "Fixture ocultado. Solo finalizados son visibles al publico.");
  } catch (e) {
    log("Data_Interclases", "ocultarFixture error: " + e.message, "ERROR");
    return respuestaError("Error ocultando fixture: " + e.message);
  }
}

/**
 * Retorna el estado actual de visibilidad del fixture.
 * @return {Object}
 */
function getEstadoVisibilidadFixture() {
  try {
    var props    = PropertiesService.getScriptProperties();
    var estado   = props.getProperty("FIXTURE_PUBLICADO") || "no";
    return respuestaExito({
      publicado: estado === "si",
      estado   : estado === "si" ? "Publico" : "Borrador"
    }, "Fixture " + (estado === "si" ? "publicado" : "en borrador") + ".");
  } catch (e) {
    return respuestaError("Error: " + e.message);
  }
}

/**
 * Retorna la tabla general acumulada (suma de puntos de todos los deportes).
 * El grupo con mas puntos es el campeon "Mundial GABO 2026".
 * @return {Object}
 */
function getTablaGeneral() {
  try {
    var tabla    = leerHoja("TABLA_POSICIONES");
    var acumulado = {};

    for (var i = 0; i < tabla.length; i++) {
      var t = tabla[i];
      var key = String(t.grupo);

      if (!acumulado[key]) {
        acumulado[key] = {
          grupo   : t.grupo,
          pais    : t.pais,
          bandera : t.bandera,
          puntos  : 0,
          gf      : 0,
          gc      : 0,
          pj      : 0
        };
      }

      acumulado[key].puntos = acumulado[key].puntos + (Number(t.puntos) || 0);
      acumulado[key].gf     = acumulado[key].gf     + (Number(t.gf)     || 0);
      acumulado[key].gc     = acumulado[key].gc     + (Number(t.gc)     || 0);
      acumulado[key].pj     = acumulado[key].pj     + (Number(t.pj)     || 0);
    }

    var lista = [];
    for (var grp in acumulado) {
      lista.push(acumulado[grp]);
    }

    // Ordenar por puntos descendente
    lista.sort(function(a, b) {
      if (b.puntos !== a.puntos) return b.puntos - a.puntos;
      return (b.gf - b.gc) - (a.gf - a.gc);
    });

    return respuestaExito(lista);
  } catch (e) {
    log("Data_Interclases", "getTablaGeneral error: " + e.message, "ERROR");
    return respuestaError("Error calculando tabla general: " + e.message);
  }
}


// ============================================================
// GOLEADORES
// ============================================================

/**
 * Registra goles de un jugador en un partido.
 * @param {string} idPartido
 * @param {string} idJugador
 * @param {string} idEquipo
 * @param {number} goles
 * @return {Object}
 */
function registrarGoles(idPartido, idJugador, idEquipo, goles, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!idPartido || !idJugador || !idEquipo) {
      return respuestaError("Faltan campos: idPartido, idJugador, idEquipo", "DATOS_INCOMPLETOS");
    }
    if (!goles || Number(goles) <= 0) {
      return respuestaError("Goles debe ser mayor a 0", "GOLES_INVALIDOS");
    }

    // Obtener datos del partido y jugador
    var partido = buscarFila("PARTIDOS",   "id_partido", idPartido);
    var jugador = buscarFila("JUGADORES",  "id_jugador", idJugador);

    if (!partido) {
      return respuestaError("Partido no encontrado", "PARTIDO_NO_ENCONTRADO");
    }

    var nombreJugador = jugador ? jugador.datos.nombre_completo : "Jugador desconocido";
    var deporte       = partido ? String(partido.datos.deporte) : "";
    var fechaPartido  = partido ? String(partido.datos.fecha)   : "";
    var grupo         = jugador ? String(jugador.datos.grupo)   : "";

    var fila = [
      generarId("GL"),
      idPartido,
      idJugador,
      idEquipo,
      grupo,
      nombreJugador,
      Number(goles),
      deporte,
      fechaPartido
    ];

    agregarFila("GOLEADORES", fila);

    log("Data_Interclases",
        "Goles registrados: " + nombreJugador + " = " + goles + " en partido " + idPartido,
        "INFO");

    return respuestaExito(null, goles + " gol(es) registrado(s) para " + nombreJugador);
  } catch (e) {
    log("Data_Interclases", "registrarGoles error: " + e.message, "ERROR");
    return respuestaError("Error registrando goles: " + e.message);
  }
}

/**
 * Retorna la tabla de goleadores ordenada por goles descendente.
 * @param {string} deporte - Filtro opcional
 * @param {number} limite - Maximo de resultados (default 10)
 * @return {Object}
 */
function getGoleadores(deporte, limite) {
  try {
    var max     = limite || 10;
    var todos   = leerHoja("GOLEADORES");

    // Agrupar por jugador
    var agrupado = {};

    for (var i = 0; i < todos.length; i++) {
      var g = todos[i];
      if (deporte && String(g.deporte) !== String(deporte)) continue;

      var key = String(g.id_jugador) + "_" + String(g.id_equipo);

      if (!agrupado[key]) {
        agrupado[key] = {
          id_jugador     : g.id_jugador,
          id_equipo      : g.id_equipo,
          grupo          : g.grupo,
          nombre_jugador : g.nombre_jugador,
          goles          : 0,
          deporte        : g.deporte
        };
      }

      agrupado[key].goles = agrupado[key].goles + (Number(g.goles) || 0);
    }

    var lista = [];
    for (var k in agrupado) {
      lista.push(agrupado[k]);
    }

    // Ordenar por goles descendente
    lista.sort(function(a, b) {
      return b.goles - a.goles;
    });

    // Agregar bandera del equipo
    var equipos = leerHoja("EQUIPOS");
    for (var j = 0; j < lista.length; j++) {
      for (var e = 0; e < equipos.length; e++) {
        if (String(equipos[e].id_equipo) === String(lista[j].id_equipo)) {
          lista[j].pais    = equipos[e].pais;
          lista[j].bandera = equipos[e].bandera_codigo;
          break;
        }
      }
    }

    return respuestaExito(lista.slice(0, max));
  } catch (e) {
    log("Data_Interclases", "getGoleadores error: " + e.message, "ERROR");
    return respuestaError("Error cargando goleadores: " + e.message);
  }
}


// ============================================================
// ESTADISTICAS GENERALES DEL TORNEO
// ============================================================

/**
 * Retorna un resumen estadistico del torneo completo.
 * Usado en la landing page y en el evento de clausura.
 * @return {Object}
 */
function getEstadisticasTorneo() {
  try {
    var partidos  = leerHoja("PARTIDOS");
    var equipos   = leerHoja("EQUIPOS");
    var jugadores = leerHoja("JUGADORES");
    var goleadores = leerHoja("GOLEADORES");

    var totalPartidos    = partidos.length;
    var partidosJugados  = 0;
    var partidosPendientes = 0;
    var totalGoles       = 0;

    for (var i = 0; i < partidos.length; i++) {
      var p = partidos[i];
      if (p.estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO ||
          p.estado === CONFIG.ESTADOS_PARTIDO.WO) {
        partidosJugados++;
        totalGoles = totalGoles + (Number(p.goles_local) || 0) +
                                  (Number(p.goles_visitante) || 0);
      } else if (
        p.estado === CONFIG.ESTADOS_PARTIDO.PROGRAMADO ||
        p.estado === CONFIG.ESTADOS_PARTIDO.APLAZADO
      ) {
        partidosPendientes++;
      }
    }

    var porcentaje = totalPartidos > 0
                     ? Math.round((partidosJugados / totalPartidos) * 100)
                     : 0;

    return respuestaExito({
      total_partidos      : totalPartidos,
      partidos_jugados    : partidosJugados,
      partidos_pendientes : partidosPendientes,
      total_goles         : totalGoles,
      total_equipos       : equipos.length,
      total_jugadores     : jugadores.length,
      porcentaje_avance   : porcentaje,
      promedio_goles      : partidosJugados > 0
                            ? Math.round((totalGoles / partidosJugados) * 10) / 10
                            : 0
    });
  } catch (e) {
    log("Data_Interclases", "getEstadisticasTorneo error: " + e.message, "ERROR");
    return respuestaError("Error calculando estadisticas: " + e.message);
  }
}

/**
 * Recalcula TODAS las tablas de posicion del torneo.
 * Util para reconstruir desde cero si hay inconsistencias.
 * @return {Object}
 */
function recalcularTodasLasTablas() {
  try {
    var grados   = ["3","4","5","6","7"];
    var deportes = {
      "3": ["Mini Futsal","Mini Voleibol"],
      "4": ["Mini Futsal","Mini Voleibol"],
      "5": ["Mini Futsal","Mini Voleibol"],
      "6": ["Futsal","Voleibol"],
      "7": ["Futsal","Voleibol"]
    };

    var procesados = 0;
    for (var i = 0; i < grados.length; i++) {
      var g = grados[i];
      var deps = deportes[g];
      for (var j = 0; j < deps.length; j++) {
        recalcularTablaGrado(g, deps[j]);
        procesados++;
      }
    }

    // Invalidar TODOS los caches tras recalcular (AUDITORIA v3)
    try { invalidarTodosCachesTablas(); } catch (_) {}

    log("Data_Interclases", "Todas las tablas recalculadas: " + procesados, "INFO");
    return respuestaExito(
      { tablas_procesadas: procesados },
      "Todas las tablas recalculadas correctamente."
    );
  } catch (e) {
    log("Data_Interclases", "recalcularTodasLasTablas error: " + e.message, "ERROR");
    return respuestaError("Error recalculando tablas: " + e.message);
  }
}

// ============================================================
// SINCRONIZACIÓN POST-PLANILLAS
// ============================================================
// Llamar esta función después de ingresar las primeras planillas
// en bloque (importación masiva de resultados).
// Recalcula tablas + auto-genera cruces de finales para grados
// donde ambas semifinales ya están finalizadas.
// ============================================================

/**
 * Recalcula tablas Y activa auto-cruces en una sola operación.
 * Equivale a recalcularTodasLasTablas() + verificar cruces pendientes.
 * @param {string} pin - PIN admin
 * @return {Object}
 */
function sincronizarPostPlanillas(pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    // 1. Recalcular todas las tablas
    recalcularTodasLasTablas();

    // 2. Para cada combinación de Primaria, verificar si ambas semifinales
    //    están finalizadas y actualizar cruces Final/3er Puesto
    var grados   = ["3","4","5"];
    var deportes = ["Mini Futsal","Mini Voleibol"];
    var partidos = leerHoja("PARTIDOS");
    var crucesActualizados = [];
    var crucesError        = [];

    for (var gi = 0; gi < grados.length; gi++) {
      for (var di = 0; di < deportes.length; di++) {
        var g   = grados[gi];
        var dep = deportes[di];
        var faseA = null, faseB = null;

        for (var pi = 0; pi < partidos.length; pi++) {
          var px = partidos[pi];
          if (String(px.grado) !== g || String(px.deporte) !== dep) continue;
          if (px.fase === "Fase 1 - Partido A") faseA = px;
          if (px.fase === "Fase 1 - Partido B") faseB = px;
        }

        var ambos = (
          faseA && faseB &&
          (faseA.estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO || faseA.estado === CONFIG.ESTADOS_PARTIDO.WO) &&
          (faseB.estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO || faseB.estado === CONFIG.ESTADOS_PARTIDO.WO)
        );

        if (ambos) {
          try {
            actualizarCrucesFinal(g, dep, "__internal__");
            crucesActualizados.push("Grado " + g + " - " + dep);
            log("Data_Interclases",
                "sincronizarPostPlanillas: cruces actualizados Grado " + g + " " + dep, "INFO");
          } catch (eCr) {
            crucesError.push("Grado " + g + " - " + dep + ": " + eCr.message);
          }
        }
      }
    }

    log("Data_Interclases",
        "sincronizarPostPlanillas: tablas recalculadas + " +
        crucesActualizados.length + " cruces actualizados.", "INFO");

    return respuestaExito({
      tablas_recalculadas  : 10,
      cruces_actualizados  : crucesActualizados,
      cruces_error         : crucesError
    },
      "Sincronización completa: 10 tablas recalculadas. " +
      crucesActualizados.length + " cruce(s) de finales actualizados." +
      (crucesError.length > 0 ? " " + crucesError.length + " error(es)." : "")
    );

  } catch (e) {
    log("Data_Interclases", "sincronizarPostPlanillas error: " + e.message, "ERROR");
    return respuestaError("Error en sincronización: " + e.message);
  }
}


// ============================================================
// DIAGNÓSTICO RÁPIDO — callable desde cualquier módulo HTML
// Retorna el estado real de IC_Equipos e IC_Jugadores sin PIN
// para mostrar en consola / panel de admin
// ============================================================

/**
 * Retorna un resumen de IC_Equipos e IC_Jugadores.
 * Sin PIN — solo lectura, no modifica nada.
 * Útil para diagnosticar "No hay equipos" desde el frontend.
 */
function diagnosticoRapido() {
  try {
    var ss    = getSpreadsheet();
    var hojas = {};

    ["IC_Equipos","IC_Jugadores"].forEach(function(nombre){
      var h = ss.getSheetByName(nombre);
      if (!h) {
        hojas[nombre] = { existe: false, filas: 0, encabezados: [] };
        return;
      }
      var lr   = h.getLastRow();
      var lc   = h.getLastColumn();
      var encs = lr > 0 ? h.getRange(1,1,1,lc).getValues()[0] : [];
      hojas[nombre] = {
        existe      : true,
        filas       : lr - 1,       // sin contar encabezado
        encabezados : encs,
        primera_fila: lr > 1 ? h.getRange(2,1,1,lc).getValues()[0] : []
      };
    });

    // Cruze básico
    var equiposOk = 0, jugadoresOk = 0, idsMismatch = [];
    if (hojas["IC_Equipos"].existe && hojas["IC_Jugadores"].existe) {
      var eqs  = leerHoja("EQUIPOS");
      var jugs = leerHoja("JUGADORES");
      var mapaJug = {};
      jugs.forEach(function(j){ var id=String(j.id_equipo||"").trim(); if(id){ mapaJug[id]=(mapaJug[id]||0)+1; } });
      eqs.forEach(function(e){
        var id = String(e.id_equipo||"").trim();
        if (mapaJug[id] && mapaJug[id] > 0) equiposOk++;
        else idsMismatch.push(id + " (0 jugadores)");
      });
      jugadoresOk = jugs.length;
    }

    return respuestaExito({
      hojas           : hojas,
      equipos_con_jug : equiposOk,
      jugadores_total : jugadoresOk,
      equipos_sin_jug : idsMismatch,
      spreadsheet_name: CONFIG.SPREADSHEET_NAME
    }, "Diagnóstico completado.");

  } catch (e) {
    log("Data_Interclases", "diagnosticoRapido error: " + e.message, "ERROR");
    return respuestaError("Error en diagnóstico: " + e.message);
  }
}


// ============================================================
// DELEGACIONES — para el Desfile de Apertura
// Retorna cada grupo con sus 2 equipos (VB+FS) y capitanes
// ============================================================

/**
 * Retorna todas las delegaciones para el Desfile de Apertura.
 * Cada delegación = 1 grupo con sus 2 equipos y capitanes.
 * Orden: 3°→7° por grado, dentro de cada grado por grupo asc.
 *
 * @return {Object} { ok, datos: [ { grupo, grado, nivel, pais, bandera,
 *   nombre_equipo_fs, capitan_fs, jugadores_fs,
 *   nombre_equipo_vb, capitan_vb, jugadores_vb } ] }
 */
function getDelegacionesCompletas() {
  try {
    var equipos   = leerHoja("EQUIPOS");
    var jugadores = leerHoja("JUGADORES");

    // Índice: id_equipo → [jugadores]
    var jugXEq = {};
    jugadores.forEach(function(j) {
      var id = String(j.id_equipo || "").trim();
      if (!id) return;
      if (!jugXEq[id]) jugXEq[id] = [];
      jugXEq[id].push({
        nombre   : String(j.nombre_completo || j.nombre || ""),
        posicion : String(j.posicion || "Jugador"),
        genero   : String(j.genero   || ""),
        camiseta : String(j.numero_camiseta || "")
      });
    });

    // Índice: grupo → { fs: equipo, vb: equipo }
    var grupoMap = {};
    equipos.forEach(function(eq) {
      var g  = String(eq.grupo || "").trim();
      var dep = String(eq.deporte || "").toLowerCase();
      if (!g) return;
      if (!grupoMap[g]) grupoMap[g] = { grupo: g, grado: String(eq.grado||g.charAt(0)), nivel: eq.nivel || "", pais: eq.pais || "", bandera: eq.bandera_codigo || eq.bandera || "" };
      var es = grupoMap[g];
      // Rellenar pais si no tiene
      if (!es.pais && eq.pais) es.pais = eq.pais;
      if (!es.bandera && (eq.bandera_codigo||eq.bandera)) es.bandera = eq.bandera_codigo||eq.bandera;

      var id   = String(eq.id_equipo || "").trim();
      var jugs = jugXEq[id] || [];
      if (dep.indexOf("futsal") !== -1) {
        es.fs = { id_equipo: id, nombre_equipo: eq.nombre_equipo||"", capitan: eq.capitan||"", jugadores: jugs, deporte: eq.deporte };
      } else if (dep.indexOf("voleibol") !== -1) {
        es.vb = { id_equipo: id, nombre_equipo: eq.nombre_equipo||"", capitan: eq.capitan||"", jugadores: jugs, deporte: eq.deporte };
      }
    });

    // Orden: grado 3→7, grupo asc
    var lista = Object.values(grupoMap).sort(function(a, b) {
      var ga = parseInt(a.grado)||0, gb = parseInt(b.grado)||0;
      if (ga !== gb) return ga - gb;
      return String(a.grupo).localeCompare(String(b.grupo));
    });

    // Calcular nivel si no está
    lista.forEach(function(d) {
      if (!d.nivel) d.nivel = parseInt(d.grado) <= 5 ? "Primaria" : "Bachillerato";
    });

    log("Data_Interclases", "getDelegacionesCompletas: " + lista.length + " delegaciones.", "INFO");
    return respuestaExito(lista, lista.length + " delegaciones cargadas.");
  } catch (e) {
    log("Data_Interclases", "getDelegacionesCompletas error: " + e.message, "ERROR");
    return respuestaError("Error cargando delegaciones: " + e.message);
  }
}


/**
 * Genera una frase épica para una delegación usando Gemini.
 * Se llama desde el frontend durante el desfile.
 * @param {string} grupo
 * @param {string} pais
 * @param {string} grado
 * @return {Object} { ok, datos: { frase } }
 */
function generarFraseDelegacionIA(grupo, pais, grado) {
  try {
    var prompt =
      "Eres el locutor oficial del Mundial GABO 2026 en I.E. GABO, Cartago, Colombia.\n" +
      "Genera UNA frase épica de bienvenida (máximo 20 palabras) para la delegación:\n" +
      "País: " + pais + " | Grado: " + grado + "° | Grupo: " + grupo + "\n" +
      "Tono: épico, escolar colombiano, festivo. Sin comillas. Solo la frase.";
    var frase = llamarGemini(prompt, 80);
    return respuestaExito({ frase: frase.trim() });
  } catch (e) {
    // Fallback: frases estáticas si Gemini no está disponible
    var frases = [
      "¡Con honor y garra, esta delegación llega a conquistar el mundo!",
      "¡El talento no tiene límites — bienvenida esta gran delegación!",
      "¡Fuerza, corazón y pasión — esta es su momento de brillar!",
      "¡Unidos por los colores, imparables en la cancha!",
      "¡La garra estudiantil hace su entrada triunfal!"
    ];
    var frase = frases[Math.floor(Math.random() * frases.length)];
    return respuestaExito({ frase: frase });
  }
}


/**
 * Genera un comentario IA para animar el sorteo de fixture.
 * @param {string} grado
 * @param {string} deporte
 * @param {string} partido_desc  - ej. "Francia vs Uruguay"
 * @return {Object} { ok, datos: { comentario } }
 */
function generarComentarioSorteoIA(grado, deporte, partido_desc) {
  try {
    var prompt =
      "Locutor del Mundial GABO 2026. Genera UN comentario emocionante (máximo 15 palabras) " +
      "para este enfrentamiento del sorteo:\n" +
      partido_desc + " — Grado " + grado + "° " + deporte + "\n" +
      "Tono: épico, deportivo. Sin comillas. Solo el comentario.";
    var c = llamarGemini(prompt, 60);
    return respuestaExito({ comentario: c.trim() });
  } catch (e) {
    var comentarios = [
      "¡Duelo épico que promete emocionar a toda la institución!",
      "¡Dos potencias chocan — solo uno saldrá victorioso!",
      "¡El estadio retumba con este encuentro de titanes!",
      "¡Enfrentamiento histórico en las canchas del GABO!",
      "¡La batalla comienza — que gane el mejor!"
    ];
    return respuestaExito({ comentario: comentarios[Math.floor(Math.random() * comentarios.length)] });
  }
}
