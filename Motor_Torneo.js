// ============================================================
// Motor_Torneo.gs — Nuevo motor de lógica del torneo
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// REGLA DE ORO: NO modifica funciones existentes.
//   Solo AGREGA funciones nuevas que complementan el sistema.
//
// FUNCIONES NUEVAS:
//   generarFixtureAutomatico()   — Genera todo el fixture en orden
//   generarSemifinales()         — Alias explícito para Primaria
//   generarFinalY3erPuesto()     — Actualiza cruces tras semifinales
//   validarGenero()              — Valida regla mujeres por partido
//   generarCalendario()          — Distribuye partidos en días reales
//   generarSuperFinal()          — Final Grado 6 vs Grado 7 (Bachillerato)
//   generarFinalEspecial45()     — Final Grado 4 vs Grado 5 (Primaria)
//   getEstadoCompletoTorneo()    — Diagnóstico completo del torneo
//   validarEquipoCompleto()      — Valida requisitos antes del fixture
// ============================================================


// ============================================================
// CONFIGURACIÓN DEL TORNEO (complementa CONFIG de Utils.gs)
// ============================================================

var TORNEO = {

  // Países asignados por documento del profe
  PAISES: {
    // Primaria
    "301": { pais: "Francia",   bandera: "FR" },
    "302": { pais: "Haiti",     bandera: "HT" },
    "303": { pais: "Uruguay",   bandera: "UY" },
    "304": { pais: "Salvador",  bandera: "SV" },
    "401": { pais: "Espana",    bandera: "ES" },
    "402": { pais: "Paraguay",  bandera: "PY" },
    "403": { pais: "Canada",    bandera: "CA" },
    "404": { pais: "Colombia",  bandera: "CO" },
    "501": { pais: "Ecuador",   bandera: "EC" },
    "502": { pais: "Portugal",  bandera: "PT" },
    "503": { pais: "Alemania",  bandera: "DE" },
    "504": { pais: "Mexico",    bandera: "MX" },
    // Bachillerato
    "601": { pais: "Argentina", bandera: "AR" },
    "602": { pais: "Brasil",    bandera: "BR" },
    "603": { pais: "EEUU",      bandera: "US" },
    "702": { pais: "Rumania",   bandera: "RO" },
    "703": { pais: "Venezuela", bandera: "VE" },
    "704": { pais: "Peru",      bandera: "PE" }
  },

  // Duración de cada partido en minutos (para calcular horarios)
  DURACION_PARTIDO_MIN: 60,

  // Hora de inicio predeterminada si no se especifica
  HORA_INICIO_DEFAULT: "13:00",

  // Mínimo de mujeres inscritas por equipo en Futsal/Mini-Futsal
  MIN_MUJERES_INSCRIPCION: 2,

  // Mínimo de mujeres en cancha durante el partido
  MIN_MUJERES_CANCHA: 1,

  // Reglas de refuerzo
  REFUERZO: {
    "4": { max_refuerzos: 2, descripcion: "Grado 4 puede reforzarse con max 2 jugadores de Grado 3 o 5" },
    "5": { max_refuerzos: 2, descripcion: "Grado 5 puede reforzarse con max 2 jugadores de Grado 4" },
    "6": { max_refuerzos: 1, descripcion: "Grado 6 puede reforzarse con 1 jugador para Super Final" },
    "7": { max_refuerzos: 0, descripcion: "Grado 7 sin refuerzos" }
  },

  // Rotación del calendario por día (según documento)
  ROTACION_CALENDARIO: [
    { bachillerato: { grado: "7", deporte: "Futsal"        }, primaria: { grado: "5", deporte: "Mini Futsal"   } },
    { bachillerato: { grado: "7", deporte: "Voleibol"      }, primaria: { grado: "5", deporte: "Mini Voleibol" } },
    { bachillerato: { grado: "6", deporte: "Futsal"        }, primaria: { grado: "4", deporte: "Mini Futsal"   } },
    { bachillerato: { grado: "7", deporte: "Futsal"        }, primaria: { grado: "3", deporte: "Mini Futsal"   } },
    { bachillerato: { grado: "6", deporte: "Voleibol"      }, primaria: { grado: "4", deporte: "Mini Voleibol" } },
    { bachillerato: { grado: "6", deporte: "Futsal"        }, primaria: { grado: "3", deporte: "Mini Voleibol" } },
    { bachillerato: { grado: "7", deporte: "Voleibol"      }, primaria: { grado: "4", deporte: "Mini Futsal"   } },
    { bachillerato: { grado: "6", deporte: "Voleibol"      }, primaria: { grado: "5", deporte: "Mini Futsal"   } }
  ],

  // Premios del torneo
  PREMIOS: {
    "1er_puesto":         "Cine + crispetas + gaseosa + chocolatina (todo el salon) + Trofeo + Medallas",
    "2do_puesto":         "Hamburguesa + papas + jugo (todo el salon) + Medallas",
    "3er_puesto":         "Bono $100.000",
    "barra_1er":          "$250.000",
    "barra_2do":          "$150.000",
    "mejor_presentacion": "$100.000"
  }
};


// ============================================================
// VALIDACIÓN DE GÉNERO
// ============================================================

/**
 * Valida que un equipo cumpla las reglas de género para su deporte.
 * Para Futsal y Mini-Futsal: mínimo 2 mujeres inscritas.
 * Para Voleibol y Mini-Voleibol: mixto libre.
 *
 * @param {string} idEquipo - ID del equipo a validar
 * @return {Object} { ok, valido, mensaje, detalle }
 */
function validarGenero(idEquipo) {
  try {
    var eqRes = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    if (!eqRes) {
      return respuestaError("Equipo no encontrado: " + idEquipo, "EQUIPO_NO_ENCONTRADO");
    }

    var equipo  = eqRes.datos;
    var deporte = String(equipo.deporte || "");
    var esFutsal = deporte.indexOf("Futsal") !== -1;

    // Voleibol: sin restricción
    if (!esFutsal) {
      return respuestaExito({
        valido     : true,
        deporte    : deporte,
        regla      : "Mixto libre — sin restriccion de genero",
        mujeres    : null,
        requeridas : 0
      }, "Equipo valido — " + deporte + " no tiene restriccion de genero.");
    }

    // Futsal/Mini-Futsal: contar mujeres
    var jugadores = leerHoja("JUGADORES");
    var mujeres   = 0;
    for (var i = 0; i < jugadores.length; i++) {
      if (
        String(jugadores[i].id_equipo) === String(idEquipo) &&
        String(jugadores[i].genero).toLowerCase() === "femenino"
      ) {
        mujeres++;
      }
    }

    var valido   = mujeres >= TORNEO.MIN_MUJERES_INSCRIPCION;
    var mensaje  = valido
      ? "Equipo valido — " + mujeres + " jugadora(s) inscrita(s) (minimo " + TORNEO.MIN_MUJERES_INSCRIPCION + ")."
      : "INVALIDO — Solo " + mujeres + " jugadora(s). Se requieren minimo " + TORNEO.MIN_MUJERES_INSCRIPCION + " para " + deporte + ".";

    log("Motor_Torneo", "validarGenero [" + idEquipo + "]: " + mensaje, valido ? "INFO" : "WARN");

    return respuestaExito({
      valido     : valido,
      deporte    : deporte,
      regla      : "Min. " + TORNEO.MIN_MUJERES_INSCRIPCION + " mujeres inscritas + 1 en cancha",
      mujeres    : mujeres,
      requeridas : TORNEO.MIN_MUJERES_INSCRIPCION
    }, mensaje);

  } catch (e) {
    log("Motor_Torneo", "validarGenero error: " + e.message, "ERROR");
    return respuestaError("Error validando genero: " + e.message);
  }
}

/**
 * Valida el genero de TODOS los equipos inscritos.
 * AUDITORIA v3 - OPTIMIZACION: Lee JUGADORES una sola vez (antes: N lecturas).
 * Antes: validarGenero() en loop = N lecturas de Sheets = O(N*2) llamadas API.
 * Ahora: 2 lecturas totales (EQUIPOS + JUGADORES) = O(1) en llamadas API.
 * @return {Object}
 */
function validarGeneroTodos() {
  try {
    var equipos   = leerHoja("EQUIPOS");
    var jugadores = leerHoja("JUGADORES");  // UNA SOLA lectura para todos

    // Pre-calcular conteo de mujeres por id_equipo en un solo recorrido
    var mujeresMap = {};
    for (var j = 0; j < jugadores.length; j++) {
      var jug    = jugadores[j];
      var genero = String(jug.genero || "").toLowerCase();
      if (genero === "femenino" || genero === "f" || genero === "mujer") {
        var idEq = String(jug.id_equipo);
        mujeresMap[idEq] = (mujeresMap[idEq] || 0) + 1;
      }
    }

    var validos   = [];
    var invalidos = [];

    for (var i = 0; i < equipos.length; i++) {
      var eq       = equipos[i];
      var esFutsal = String(eq.deporte || "").indexOf("Futsal") !== -1;

      // Voleibol: sin restriccion de genero — siempre valido
      if (!esFutsal) {
        validos.push({ id_equipo: eq.id_equipo, grupo: eq.grupo, deporte: eq.deporte });
        continue;
      }

      // Futsal: verificar minimo de mujeres desde el mapa pre-calculado
      var mujeres = mujeresMap[String(eq.id_equipo)] || 0;
      var valido  = mujeres >= TORNEO.MIN_MUJERES_INSCRIPCION;

      if (valido) {
        validos.push({ id_equipo: eq.id_equipo, grupo: eq.grupo, deporte: eq.deporte });
      } else {
        invalidos.push({
          id_equipo : eq.id_equipo,
          grupo     : eq.grupo,
          deporte   : eq.deporte,
          mujeres   : mujeres,
          problema  : "Solo " + mujeres + " jugadoras. Minimo: " + TORNEO.MIN_MUJERES_INSCRIPCION
        });
      }
    }

    return respuestaExito({
      total    : equipos.length,
      validos  : validos.length,
      invalidos: invalidos.length,
      equipos_invalidos: invalidos
    }, invalidos.length === 0
      ? "Todos los equipos cumplen la regla de genero."
      : invalidos.length + " equipo(s) NO cumplen la regla de genero.");

  } catch (e) {
    log("Motor_Torneo", "validarGeneroTodos error: " + e.message, "ERROR");
    return respuestaError("Error en validacion masiva: " + e.message);
  }
}


// ============================================================
// FIXTURE AUTOMÁTICO COMPLETO
// ============================================================

/**
 * Genera el fixture completo para TODOS los grados y deportes.
 * Llama a generarFixture() existente por cada combinación.
 * Respeta la regla: NO regenera si ya existe fixture.
 *
 * @param {string} fechaBase - "YYYY-MM-DD" fecha de inicio del torneo
 * @param {string} horaInicio - "HH:MM" hora de inicio (default 13:00)
 * @return {Object}
 */
function generarFixtureAutomatico(fechaBase, horaInicio, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    // Si no se pasa fechaBase, usar la fecha de hoy
    if (!fechaBase || String(fechaBase).trim() === "") {
      var hoy  = new Date();
      var yyyy = hoy.getFullYear();
      var mm   = String(hoy.getMonth() + 1); if (mm.length < 2) mm = "0" + mm;
      var dd   = String(hoy.getDate());       if (dd.length < 2) dd = "0" + dd;
      fechaBase = yyyy + "-" + mm + "-" + dd;
      log("Motor_Torneo", "generarFixtureAutomatico: fechaBase no provista, usando hoy: " + fechaBase, "INFO");
    }

    var hora = horaInicio || TORNEO.HORA_INICIO_DEFAULT;

    var combinaciones = [
      { grado: "3", deporte: "Mini Futsal"   },
      { grado: "3", deporte: "Mini Voleibol" },
      { grado: "4", deporte: "Mini Futsal"   },
      { grado: "4", deporte: "Mini Voleibol" },
      { grado: "5", deporte: "Mini Futsal"   },
      { grado: "5", deporte: "Mini Voleibol" },
      { grado: "6", deporte: "Futsal"        },
      { grado: "6", deporte: "Voleibol"      },
      { grado: "7", deporte: "Futsal"        },
      { grado: "7", deporte: "Voleibol"      }
    ];

    var generados = [];
    var omitidos  = [];
    var errores   = [];

    for (var i = 0; i < combinaciones.length; i++) {
      var c   = combinaciones[i];
      var res = generarFixture(c.grado, c.deporte, fechaBase, hora);

      if (res.ok) {
        generados.push("Grado " + c.grado + " - " + c.deporte + " (" + res.datos.partidos_creados + " partidos)");
        log("Motor_Torneo", "Fixture OK: Grado " + c.grado + " " + c.deporte, "INFO");
      } else if (res.codigo === "FIXTURE_EXISTENTE" || res.codigo === "EQUIPOS_INSUFICIENTES") {
        omitidos.push("Grado " + c.grado + " - " + c.deporte + ": " + res.mensaje);
      } else {
        errores.push("Grado " + c.grado + " - " + c.deporte + ": " + res.mensaje);
      }
    }

    return respuestaExito({
      generados : generados,
      omitidos  : omitidos,
      errores   : errores,
      total_generados: generados.length
    },
      "Fixture automatico: " + generados.length + " combinaciones generadas" +
      (omitidos.length  > 0 ? ", " + omitidos.length  + " omitidas" : "") +
      (errores.length   > 0 ? ", " + errores.length   + " con error" : "") + "."
    );

  } catch (e) {
    log("Motor_Torneo", "generarFixtureAutomatico error: " + e.message, "ERROR");
    return respuestaError("Error generando fixture automatico: " + e.message);
  }
}

/**
 * Genera las semifinales de un grado de Primaria.
 * Alias explícito sobre generarFixture() con validación previa de género.
 *
 * @param {string} grado   - "3", "4" o "5"
 * @param {string} deporte - "Mini Futsal" o "Mini Voleibol"
 * @param {string} fechaBase
 * @param {string} horaInicio
 * @return {Object}
 */
function generarSemifinales(grado, deporte, fechaBase, horaInicio) {
  try {
    // Validar que sea primaria
    if (["3","4","5"].indexOf(String(grado)) === -1) {
      return respuestaError("generarSemifinales solo aplica para Primaria (grados 3, 4, 5). Para bachillerato usa generarFixture().", "GRADO_NO_APLICA");
    }

    // Validar género de todos los equipos del grado antes de generar
    var equipos     = leerHoja("EQUIPOS");
    var esFutsal    = deporte.indexOf("Futsal") !== -1;
    var problemas   = [];

    if (esFutsal) {
      for (var i = 0; i < equipos.length; i++) {
        if (String(equipos[i].grado) === String(grado) && String(equipos[i].deporte) === deporte) {
          var valGen = validarGenero(equipos[i].id_equipo);
          if (valGen.ok && !valGen.datos.valido) {
            problemas.push(equipos[i].grupo + ": " + valGen.mensaje);
          }
        }
      }
    }

    if (problemas.length > 0) {
      return respuestaError(
        "No se puede generar fixture. Los siguientes equipos no cumplen la regla de genero:\n" + problemas.join("\n"),
        "GENERO_INVALIDO"
      );
    }

    return generarFixture(grado, deporte, fechaBase || "", horaInicio || TORNEO.HORA_INICIO_DEFAULT);

  } catch (e) {
    log("Motor_Torneo", "generarSemifinales error: " + e.message, "ERROR");
    return respuestaError("Error generando semifinales: " + e.message);
  }
}

/**
 * Actualiza los cruces de Final y 3er Puesto para un grado de Primaria,
 * una vez que los partidos de Fase 1 (semifinales) están finalizados.
 * Wrapper explícito sobre actualizarCrucesFinal().
 *
 * @param {string} grado
 * @param {string} deporte
 * @return {Object}
 */
function generarFinalY3erPuesto(grado, deporte) {
  try {
    if (["3","4","5"].indexOf(String(grado)) === -1) {
      return respuestaError("Solo aplica para Primaria (grados 3, 4, 5).", "GRADO_NO_APLICA");
    }
    return actualizarCrucesFinal(grado, deporte);
  } catch (e) {
    log("Motor_Torneo", "generarFinalY3erPuesto error: " + e.message, "ERROR");
    return respuestaError("Error generando final y 3er puesto: " + e.message);
  }
}


// ============================================================
// FINALES INTER-GRADOS
// ============================================================

/**
 * Genera la Final Especial Primaria: Campeón Grado 4 vs Campeón Grado 5.
 * Regla: Grado 4 puede reforzarse con máximo 2 jugadores.
 * El campeón Grado 3 no participa (solo tiene premiación interna).
 *
 * @param {string} fechaBase  - "YYYY-MM-DD"
 * @param {string} horaInicio - "HH:MM"
 * @param {string} deporte    - "Mini Futsal" o "Mini Voleibol"
 * @return {Object}
 */
function generarFinalEspecial45(fechaBase, horaInicio, deporte) {
  try {
    deporte = deporte || "Mini Futsal";
    var hora = horaInicio || TORNEO.HORA_INICIO_DEFAULT;

    // Obtener campeones de grado 4 y 5 para el deporte indicado
    var camp4 = _getCampeonGradoDeporte("4", deporte);
    var camp5 = _getCampeonGradoDeporte("5", deporte);

    if (!camp4) return respuestaError("No hay campeon de Grado 4 para " + deporte + ". Asegurate de que el torneo de 4° este finalizado.", "CAMPEON_NO_ENCONTRADO");
    if (!camp5) return respuestaError("No hay campeon de Grado 5 para " + deporte + ". Asegurate de que el torneo de 5° este finalizado.", "CAMPEON_NO_ENCONTRADO");

    // Verificar que no exista ya esta final
    var existentes = leerHoja("REPECHAJE");
    for (var i = 0; i < existentes.length; i++) {
      if (String(existentes[i].fase || "") === "Final Especial 4 vs 5 - " + deporte) {
        return respuestaError("Ya existe la Final Especial 4 vs 5 para " + deporte + ".", "FINAL_EXISTENTE");
      }
    }

    var res = crearPartidoRepechaje({
      numero_partido : 10,   // Número especial para diferenciarlo
      id_equipo_a    : camp4.id_equipo,
      id_equipo_b    : camp5.id_equipo,
      fase           : "Final Especial 4 vs 5 - " + deporte,
      refuerzos_a    : [],   // Grado 4 puede agregar hasta 2 refuerzos
      refuerzos_b    : [],
      fecha          : (fechaBase || "") + " " + hora,
      observaciones  : "Grado 4 puede reforzarse con max 2 jugadores. Grado 5 sin refuerzos."
    });

    if (res.ok) {
      log("Motor_Torneo", "Final Especial 4vs5 creada: " + camp4.grupo + " vs " + camp5.grupo + " [" + deporte + "]", "INFO");
      return respuestaExito({
        id_repechaje : res.datos.id_repechaje,
        equipo_a     : camp4,
        equipo_b     : camp5,
        deporte      : deporte,
        regla_refuerzo: "Grado 4 puede reforzarse con max 2 jugadores de otro grupo de su grado."
      }, "Final Especial Primaria generada: " + camp4.grupo + " (" + camp4.pais + ") vs " + camp5.grupo + " (" + camp5.pais + ").");
    }

    return res;

  } catch (e) {
    log("Motor_Torneo", "generarFinalEspecial45 error: " + e.message, "ERROR");
    return respuestaError("Error generando Final Especial 4vs5: " + e.message);
  }
}

/**
 * Genera la Super Final de Bachillerato: Campeón Grado 6 vs Campeón Grado 7.
 * Regla: Grado 6 puede reforzarse con 1 jugador.
 *
 * @param {string} fechaBase
 * @param {string} horaInicio
 * @param {string} deporte - "Futsal" o "Voleibol"
 * @return {Object}
 */
function generarSuperFinal(fechaBase, horaInicio, deporte) {
  try {
    deporte = deporte || "Futsal";
    var hora = horaInicio || TORNEO.HORA_INICIO_DEFAULT;

    var camp6 = _getCampeonGradoDeporte("6", deporte);
    var camp7 = _getCampeonGradoDeporte("7", deporte);

    if (!camp6) return respuestaError("No hay campeon de Grado 6 para " + deporte + ".", "CAMPEON_NO_ENCONTRADO");
    if (!camp7) return respuestaError("No hay campeon de Grado 7 para " + deporte + ".", "CAMPEON_NO_ENCONTRADO");

    // Verificar que no exista ya
    var existentes = leerHoja("REPECHAJE");
    for (var i = 0; i < existentes.length; i++) {
      if (String(existentes[i].fase || "") === "Super Final 6 vs 7 - " + deporte) {
        return respuestaError("Ya existe la Super Final 6vs7 para " + deporte + ".", "FINAL_EXISTENTE");
      }
    }

    var res = crearPartidoRepechaje({
      numero_partido : 20,   // Número especial
      id_equipo_a    : camp6.id_equipo,
      id_equipo_b    : camp7.id_equipo,
      fase           : "Super Final 6 vs 7 - " + deporte,
      refuerzos_a    : [],   // Grado 6 puede agregar 1 refuerzo
      refuerzos_b    : [],
      fecha          : (fechaBase || "") + " " + hora,
      observaciones  : "Super Final Bachillerato. Grado 6 puede reforzarse con 1 jugador."
    });

    if (res.ok) {
      log("Motor_Torneo", "Super Final generada: " + camp6.grupo + " vs " + camp7.grupo + " [" + deporte + "]", "INFO");
      return respuestaExito({
        id_repechaje  : res.datos.id_repechaje,
        equipo_a      : camp6,
        equipo_b      : camp7,
        deporte       : deporte,
        regla_refuerzo: "Grado 6 puede reforzarse con 1 jugador para la Super Final."
      }, "Super Final Bachillerato generada: " + camp6.grupo + " (" + camp6.pais + ") vs " + camp7.grupo + " (" + camp7.pais + ").");
    }

    return res;

  } catch (e) {
    log("Motor_Torneo", "generarSuperFinal error: " + e.message, "ERROR");
    return respuestaError("Error generando Super Final: " + e.message);
  }
}

/**
 * Obtiene el campeón de un grado específico para un deporte.
 * Busca en IC_Tabla_Posiciones el equipo con más puntos.
 * @param {string} grado
 * @param {string} deporte
 * @return {Object|null} datos del campeón o null
 */
function _getCampeonGradoDeporte(grado, deporte) {
  try {
    var tabla = leerHoja("TABLA_POSICIONES");
    var candidatos = [];

    for (var i = 0; i < tabla.length; i++) {
      if (
        String(tabla[i].grado)   === String(grado) &&
        String(tabla[i].deporte) === String(deporte)
      ) {
        candidatos.push(tabla[i]);
      }
    }

    if (candidatos.length === 0) return null;

    candidatos.sort(function(a, b) {
      if (Number(b.puntos) !== Number(a.puntos)) return Number(b.puntos) - Number(a.puntos);
      return Number(b.dg || 0) - Number(a.dg || 0);
    });

    var lider  = candidatos[0];
    var eqData = buscarFila("EQUIPOS", "id_equipo", lider.id_equipo);

    return {
      grado         : grado,
      deporte       : deporte,
      id_equipo     : lider.id_equipo,
      grupo         : lider.grupo,
      pais          : lider.pais,
      bandera       : lider.bandera,
      puntos        : lider.puntos,
      capitan       : eqData ? eqData.datos.capitan : "",
      nombre_equipo : eqData ? eqData.datos.nombre_equipo : ""
    };
  } catch (e) {
    return null;
  }
}


// ============================================================
// CALENDARIO AUTOMÁTICO
// ============================================================

/**
 * Genera el calendario distribuyendo los partidos en días reales.
 * Regla: 2 partidos por día — 1 bachillerato + 1 primaria.
 * Sigue la rotación definida en TORNEO.ROTACION_CALENDARIO.
 *
 * IMPORTANTE: Esta función ACTUALIZA las fechas de partidos ya creados
 * en IC_Partidos. Debe llamarse DESPUÉS de generarFixtureAutomatico().
 *
 * @param {string} fechaInicio - "YYYY-MM-DD" primer día del torneo
 * @param {string} horaPartido1 - "HH:MM" hora del primer partido del día
 * @param {string} horaPartido2 - "HH:MM" hora del segundo partido del día
 * @param {Array}  diasExcluidos - ["YYYY-MM-DD", ...] días sin partidos (festivos, etc.)
 * @return {Object}
 */
function generarCalendario(fechaInicio, horaPartido1, horaPartido2, diasExcluidos, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!fechaInicio) return respuestaError("Se requiere fechaInicio (YYYY-MM-DD)", "FECHA_REQUERIDA");

    var hora1 = horaPartido1 || "13:00";
    var hora2 = horaPartido2 || "14:30";
    var excluidos = diasExcluidos || [];

    // Obtener TODOS los partidos pendientes ordenados por grado/deporte/fase
    var todos = leerHoja("PARTIDOS");

    // Filtrar solo los programados o sin fecha
    var pendientes = todos.filter(function(p) {
      return p.estado === CONFIG.ESTADOS_PARTIDO.PROGRAMADO ||
             !p.estado || String(p.estado).trim() === "";
    });

    if (pendientes.length === 0) {
      return respuestaError("No hay partidos pendientes para programar.", "SIN_PARTIDOS");
    }

    // Agrupar partidos por (grado, deporte)
    var porCombo = {};
    for (var i = 0; i < pendientes.length; i++) {
      var p   = pendientes[i];
      var key = p.grado + "_" + p.deporte;
      if (!porCombo[key]) porCombo[key] = [];
      porCombo[key].push(p);
    }

    // Ordenar cada grupo por fase: Fase 1 primero, Tercer Puesto, Final
    var ordenFase = function(fase) {
      if (!fase) return 99;
      if (fase.indexOf("Fase 1")     !== -1) return 1;
      if (fase.indexOf("Todos vs")   !== -1) return 1;
      if (fase.indexOf("J1")         !== -1) return 1;
      if (fase.indexOf("J2")         !== -1) return 2;
      if (fase.indexOf("J3")         !== -1) return 3;
      if (fase.indexOf("Tercer")     !== -1) return 8;
      if (fase.indexOf("Final")      !== -1) return 9;
      return 5;
    };

    for (var key in porCombo) {
      porCombo[key].sort(function(a, b) {
        return ordenFase(a.fase) - ordenFase(b.fase);
      });
    }

    // Construir cola de pares (bach + primaria) por rotación
    var colaDias = [];
    var rotIndex = 0;
    var maxIteraciones = 200;
    var iter = 0;

    while (Object.keys(porCombo).length > 0 && iter < maxIteraciones) {
      iter++;
      var rot = TORNEO.ROTACION_CALENDARIO[rotIndex % TORNEO.ROTACION_CALENDARIO.length];
      rotIndex++;

      var keyBach = rot.bachillerato.grado + "_" + rot.bachillerato.deporte;
      var keyPrim = rot.primaria.grado     + "_" + rot.primaria.deporte;

      var pBach = porCombo[keyBach] && porCombo[keyBach].length > 0
                  ? porCombo[keyBach].shift() : null;
      var pPrim = porCombo[keyPrim] && porCombo[keyPrim].length > 0
                  ? porCombo[keyPrim].shift() : null;

      if (!pBach && !pPrim) {
        // Ninguna de estas combinaciones tiene partidos → limpiar y continuar
        if (porCombo[keyBach] !== undefined && porCombo[keyBach].length === 0) delete porCombo[keyBach];
        if (porCombo[keyPrim] !== undefined && porCombo[keyPrim].length === 0) delete porCombo[keyPrim];
        continue;
      }

      if (porCombo[keyBach] && porCombo[keyBach].length === 0) delete porCombo[keyBach];
      if (porCombo[keyPrim] && porCombo[keyPrim].length === 0) delete porCombo[keyPrim];

      colaDias.push({ partido1: pBach, partido2: pPrim });
    }

    // Distribuir en fechas reales (saltando excluidos y fines de semana si se quiere)
    var fecha       = new Date(fechaInicio + "T12:00:00");
    var actualizados = 0;
    var hoja        = getHoja("PARTIDOS");
    var datos       = hoja.getDataRange().getValues();
    var encabs      = datos[0];
    var colFecha    = encabs.indexOf("fecha") + 1;
    var colHora     = encabs.indexOf("hora")  + 1;

    if (colFecha === 0) return respuestaError("Columna 'fecha' no encontrada en IC_Partidos.", "COLUMNA_NO_ENCONTRADA");

    var lock = LockService.getScriptLock();
    lock.waitLock(15000);

    try {
      for (var d = 0; d < colaDias.length; d++) {
        // Avanzar si es día excluido
        var fechaStr = _formatearFechaISO(fecha);
        while (excluidos.indexOf(fechaStr) !== -1) {
          fecha.setDate(fecha.getDate() + 1);
          fechaStr = _formatearFechaISO(fecha);
        }

        var par = colaDias[d];

        // Actualizar partido 1 (bachillerato)
        if (par.partido1) {
          var fila1 = _encontrarFilaPartido(datos, encabs, par.partido1.id_partido);
          if (fila1 > 0) {
            if (colFecha > 0) hoja.getRange(fila1, colFecha).setValue(fechaStr);
            if (colHora  > 0) hoja.getRange(fila1, colHora).setValue(hora1);
            actualizados++;
          }
        }

        // Actualizar partido 2 (primaria)
        if (par.partido2) {
          var fila2 = _encontrarFilaPartido(datos, encabs, par.partido2.id_partido);
          if (fila2 > 0) {
            if (colFecha > 0) hoja.getRange(fila2, colFecha).setValue(fechaStr);
            if (colHora  > 0) hoja.getRange(fila2, colHora).setValue(hora2);
            actualizados++;
          }
        }

        // Avanzar al siguiente día
        fecha.setDate(fecha.getDate() + 1);
      }

      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Motor_Torneo",
        "Calendario generado: " + actualizados + " partidos programados desde " + fechaInicio, "INFO");

    return respuestaExito({
      partidos_programados : actualizados,
      dias_utilizados      : colaDias.length,
      fecha_inicio         : fechaInicio,
      fecha_estimada_fin   : _formatearFechaISO(fecha)
    }, "Calendario generado: " + actualizados + " partidos distribuidos en " + colaDias.length + " dias.");

  } catch (e) {
    log("Motor_Torneo", "generarCalendario error: " + e.message, "ERROR");
    return respuestaError("Error generando calendario: " + e.message);
  }
}

function _formatearFechaISO(d) {
  var mm = d.getMonth() + 1;
  var dd = d.getDate();
  return d.getFullYear() + "-" + (mm < 10 ? "0" + mm : mm) + "-" + (dd < 10 ? "0" + dd : dd);
}

function _encontrarFilaPartido(datos, encabs, idPartido) {
  var colId = encabs.indexOf("id_partido");
  if (colId === -1) return 0;
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][colId]) === String(idPartido)) return i + 1;
  }
  return 0;
}


// ============================================================
// SINCRONIZACIÓN DE PAÍSES
// ============================================================

/**
 * Asigna automáticamente los países definidos en TORNEO.PAISES
 * a los equipos ya inscritos en IC_Equipos.
 * Solo actualiza equipos que aún no tienen país asignado.
 * @return {Object}
 */
/**
 * Asigna automaticamente los paises definidos en TORNEO.PAISES a los equipos inscritos.
 * AUDITORIA v3 - OPTIMIZACION BATCH:
 * Antes: N×buscarFila() + N×2×setValue() = 51 llamadas API para 17 equipos.
 * Ahora: 1 lectura + 1 escritura batch = 2 llamadas API total.
 * Solo actualiza equipos que aun no tienen pais asignado.
 * @param {string} pin
 * @return {Object}
 */
function sincronizarPaisesEquipos(pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    var hoja  = getHoja("EQUIPOS");
    var datos = hoja.getDataRange().getValues();  // UNA sola lectura

    if (!datos || datos.length < 2) {
      return respuestaError("Hoja de equipos vacia.", "HOJA_VACIA");
    }

    var encabsRaw = datos[0];
    var encabs    = encabsRaw.map(function(h) {
      return String(h || "").trim().toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i")
        .replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");
    });

    var colGrupo = encabs.indexOf("grupo");
    var colPais  = encabs.indexOf("pais");
    var colBand  = encabs.indexOf("bandera_codigo");

    if (colGrupo === -1 || colPais === -1 || colBand === -1) {
      return respuestaError("Columnas grupo/pais/bandera_codigo no encontradas.", "COLUMNA_FALTANTE");
    }

    // Clonar datos para mutarlos en memoria (sin tocar Sheets todavia)
    var datosActualizados = datos.map(function(fila) { return fila.slice(); });
    var actualizados = 0, omitidos = 0, noEncontrados = 0;

    for (var i = 1; i < datos.length; i++) {
      var fila      = datos[i];
      var grupo     = String(fila[colGrupo] || "").trim();
      var paisActual = String(fila[colPais]  || "").trim();

      if (!grupo) continue;

      // Si ya tiene pais, omitir
      if (paisActual !== "") {
        omitidos++;
        continue;
      }

      var info = TORNEO.PAISES[grupo];
      if (!info) {
        noEncontrados++;
        log("Motor_Torneo", "Grupo sin pais en TORNEO.PAISES: " + grupo, "WARN");
        continue;
      }

      // Mutar el array en memoria
      datosActualizados[i][colPais] = info.pais;
      datosActualizados[i][colBand] = info.bandera;
      actualizados++;
      log("Motor_Torneo", "Pais asignado en memoria: " + grupo + " -> " + info.pais, "INFO");
    }

    // UNA sola escritura batch si hay cambios
    if (actualizados > 0) {
      var lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try {
        hoja.getRange(1, 1, datosActualizados.length, encabsRaw.length)
            .setValues(datosActualizados);
        SpreadsheetApp.flush();
      } finally {
        lock.releaseLock();
      }
    }

    return respuestaExito(
      { actualizados: actualizados, omitidos: omitidos, no_encontrados: noEncontrados },
      actualizados + " equipos actualizados (batch), " +
      omitidos + " ya tenian pais, " + noEncontrados + " sin mapeo."
    );
  } catch (e) {
    log("Motor_Torneo", "sincronizarPaisesEquipos error: " + e.message, "ERROR");
    return respuestaError("Error sincronizando paises: " + e.message);
  }
}


// ============================================================
// VALIDACIÓN COMPLETA DE EQUIPO
// ============================================================

/**
 * Verifica que un equipo cumple TODOS los requisitos para competir:
 *  1. Tiene país asignado
 *  2. Tiene capitán registrado
 *  3. Tiene mínimo 5 jugadores
 *  4. Cumple regla de género (si aplica)
 *
 * @param {string} idEquipo
 * @return {Object} { ok, listo, checks: [...] }
 */
function validarEquipoCompleto(idEquipo) {
  try {
    var eqRes = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    if (!eqRes) return respuestaError("Equipo no encontrado: " + idEquipo, "EQUIPO_NO_ENCONTRADO");

    var eq       = eqRes.datos;
    var jugadores = leerHoja("JUGADORES").filter(function(j) {
      return String(j.id_equipo) === String(idEquipo);
    });
    var mujeres  = jugadores.filter(function(j) {
      return String(j.genero).toLowerCase() === "femenino";
    });

    var esFutsal = String(eq.deporte || "").indexOf("Futsal") !== -1;

    var checks = [
      {
        check   : "pais_asignado",
        label   : "Pais asignado",
        ok      : !!(eq.pais && String(eq.pais).trim() !== ""),
        detalle : eq.pais || "Sin asignar"
      },
      {
        check   : "capitan",
        label   : "Capitan registrado",
        ok      : !!(eq.capitan && String(eq.capitan).trim() !== ""),
        detalle : eq.capitan || "Sin capitan"
      },
      {
        check   : "min_jugadores",
        label   : "Minimo 5 jugadores",
        ok      : jugadores.length >= 5,
        detalle : jugadores.length + " jugadores registrados"
      },
      {
        check   : "genero",
        label   : esFutsal ? "Min. 2 jugadoras (Futsal)" : "Genero (Voleibol: libre)",
        ok      : esFutsal ? mujeres.length >= TORNEO.MIN_MUJERES_INSCRIPCION : true,
        detalle : esFutsal
                  ? mujeres.length + " / " + TORNEO.MIN_MUJERES_INSCRIPCION + " requeridas"
                  : "Sin restriccion"
      }
    ];

    var listo = checks.every(function(c) { return c.ok; });

    return respuestaExito({
      id_equipo : idEquipo,
      grupo     : eq.grupo,
      deporte   : eq.deporte,
      listo     : listo,
      checks    : checks
    }, listo ? "Equipo listo para competir." : "Equipo con requisitos pendientes.");

  } catch (e) {
    log("Motor_Torneo", "validarEquipoCompleto error: " + e.message, "ERROR");
    return respuestaError("Error validando equipo: " + e.message);
  }
}


// ============================================================
// DIAGNÓSTICO COMPLETO DEL TORNEO
// ============================================================

/**
 * Retorna el estado completo del torneo:
 * equipos inscritos, validaciones, partidos pendientes,
 * fase actual de cada grado/deporte, campeones parciales.
 *
 * Útil para el panel admin y para depuración.
 * @return {Object}
 */
/**
 * Retorna el estado completo del torneo.
 * OPTIMIZACIÓN AUDITORÍA: versión anterior llamaba _getCampeonGradoDeporte()
 * 10 veces, cada una leyendo TABLA_POSICIONES completa → ~23 lecturas de Sheets.
 * Esta versión lee cada hoja UNA SOLA VEZ y reutiliza los datos.
 * Lecturas totales: 4 (EQUIPOS, JUGADORES, PARTIDOS, TABLA_POSICIONES).
 * @return {Object}
 */
function getEstadoCompletoTorneo() {
  try {
    // ── UNA SOLA LECTURA DE CADA HOJA ──
    var equipos   = leerHoja("EQUIPOS");
    var jugadores = leerHoja("JUGADORES");
    var partidos  = leerHoja("PARTIDOS");
    var tabla     = leerHoja("TABLA_POSICIONES");   // antes se leía 10 veces

    // ── CONTEOS GENERALES ──
    var totalEquipos    = equipos.length;
    var totalJugadores  = jugadores.length;
    var totalPartidos   = partidos.length;
    var partidosJugados = 0;
    var partidosPend    = 0;

    for (var i = 0; i < partidos.length; i++) {
      if (partidos[i].estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO ||
          partidos[i].estado === CONFIG.ESTADOS_PARTIDO.WO) {
        partidosJugados++;
      } else if (partidos[i].estado === CONFIG.ESTADOS_PARTIDO.PROGRAMADO) {
        partidosPend++;
      }
    }

    // ── PRE-CALCULAR CAMPEONES desde la tabla ya cargada (sin releer Sheets) ──
    // Agrupa tabla por "grado_deporte", toma el líder de cada grupo
    var campeonesMap = {};   // { "6_Futsal": { grupo, pais, puntos, ... } }
    var porCombo = {};
    for (var t = 0; t < tabla.length; t++) {
      var row  = tabla[t];
      var ckey = String(row.grado) + "_" + String(row.deporte);
      if (!porCombo[ckey]) porCombo[ckey] = [];
      porCombo[ckey].push(row);
    }
    for (var ckey in porCombo) {
      var filas = porCombo[ckey];
      filas.sort(function(a, b) {
        var pa = Number(a.puntos)||0, pb = Number(b.puntos)||0;
        if (pb !== pa) return pb - pa;
        return (Number(b.dg)||0) - (Number(a.dg)||0);
      });
      if (filas.length > 0) {
        var lider = filas[0];
        // Buscar nombre del equipo en el array ya cargado (sin buscarFila)
        var eqInfo = null;
        for (var e = 0; e < equipos.length; e++) {
          if (String(equipos[e].id_equipo) === String(lider.id_equipo)) {
            eqInfo = equipos[e]; break;
          }
        }
        campeonesMap[ckey] = {
          grupo  : lider.grupo,
          pais   : lider.pais   || (eqInfo ? eqInfo.pais : ""),
          puntos : lider.puntos,
          capitan: eqInfo ? eqInfo.capitan : ""
        };
      }
    }

    // ── VALIDACIÓN DE GÉNERO (reutiliza jugadores ya cargados) ──
    var equiposInvalidos = 0;
    for (var ei = 0; ei < equipos.length; ei++) {
      var eq       = equipos[ei];
      var esFutsal = String(eq.deporte || "").indexOf("Futsal") !== -1;
      if (!esFutsal) continue;
      var mujeres  = 0;
      for (var ji = 0; ji < jugadores.length; ji++) {
        if (String(jugadores[ji].id_equipo) === String(eq.id_equipo)) {
          var gen = String(jugadores[ji].genero || "").toLowerCase();
          if (gen === "femenino" || gen === "f" || gen === "mujer") mujeres++;
        }
      }
      if (mujeres < 2) equiposInvalidos++;
    }

    // ── ESTADO POR GRADO/DEPORTE ──
    var combos = [
      { grado: "3", deporte: "Mini Futsal"   },
      { grado: "3", deporte: "Mini Voleibol" },
      { grado: "4", deporte: "Mini Futsal"   },
      { grado: "4", deporte: "Mini Voleibol" },
      { grado: "5", deporte: "Mini Futsal"   },
      { grado: "5", deporte: "Mini Voleibol" },
      { grado: "6", deporte: "Futsal"        },
      { grado: "6", deporte: "Voleibol"      },
      { grado: "7", deporte: "Futsal"        },
      { grado: "7", deporte: "Voleibol"      }
    ];

    var estadoGrados = [];
    for (var c = 0; c < combos.length; c++) {
      var g  = combos[c].grado;
      var d  = combos[c].deporte;

      var ppTotal = 0, ppJug = 0, eqCount = 0;
      for (var pi = 0; pi < partidos.length; pi++) {
        var p = partidos[pi];
        if (String(p.grado) !== g || String(p.deporte) !== d) continue;
        ppTotal++;
        if (p.estado === CONFIG.ESTADOS_PARTIDO.FINALIZADO ||
            p.estado === CONFIG.ESTADOS_PARTIDO.WO) ppJug++;
      }
      for (var eqi = 0; eqi < equipos.length; eqi++) {
        if (String(equipos[eqi].grado) === g && String(equipos[eqi].deporte) === d) eqCount++;
      }

      var fase = "Sin fixture";
      if (ppTotal > 0 && ppJug === 0)              fase = "Fixture generado";
      else if (ppJug > 0 && ppJug < ppTotal)       fase = "En curso (" + ppJug + "/" + ppTotal + ")";
      else if (ppTotal > 0 && ppJug === ppTotal)   fase = "Finalizado";

      var campKey  = g + "_" + d;
      var campInfo = campeonesMap[campKey];

      estadoGrados.push({
        grado            : g,
        deporte          : d,
        equipos_inscritos: eqCount,
        total_partidos   : ppTotal,
        partidos_jugados : ppJug,
        fase_actual      : fase,
        campeon          : campInfo ? campInfo.pais + " (Grupo " + campInfo.grupo + ")" : null
      });
    }

    return respuestaExito({
      resumen: {
        total_equipos    : totalEquipos,
        total_jugadores  : totalJugadores,
        total_partidos   : totalPartidos,
        partidos_jugados : partidosJugados,
        partidos_pend    : partidosPend,
        pct_avance       : totalPartidos > 0 ? Math.round(partidosJugados / totalPartidos * 100) : 0
      },
      validacion_genero: {
        equipos_invalidos: equiposInvalidos,
        ok               : equiposInvalidos === 0
      },
      estado_grados : estadoGrados
    }, "Diagnostico completo generado.");

  } catch (e) {
    log("Motor_Torneo", "getEstadoCompletoTorneo error: " + e.message, "ERROR");
    return respuestaError("Error generando diagnostico: " + e.message);
  }
}


// ============================================================
// UTILIDADES EXPUESTAS AL FRONTEND
// ============================================================

/**
 * Retorna los premios del torneo para mostrarlos en la UI.
 * @return {Object}
 */
function getPremiosTorneo() {
  try {
    return respuestaExito(TORNEO.PREMIOS, "Premios cargados.");
  } catch (e) {
    return respuestaError("Error cargando premios: " + e.message);
  }
}

/**
 * Retorna el mapa oficial de países asignados por grupo (desde TORNEO.PAISES).
 * Complementa getMapaPaisesAsignados() de Data_Inscripcion con los datos
 * oficiales del documento del torneo.
 * @return {Object}
 */
function getPaisesOficiales() {
  try {
    return respuestaExito(TORNEO.PAISES, "Paises oficiales cargados.");
  } catch (e) {
    return respuestaError("Error cargando paises oficiales: " + e.message);
  }
}


// ============================================================
// TERCER PUESTO — REGLAS ESPECIALES POR GRADO Y DEPORTE
// ============================================================
//
// Reglas definidas por el docente:
//
//   Futsal Bachillerato (6° y 7°) — inter-grados (6° vs 7°):
//     3er puesto = equipo con menor puntos_neg en Juego Limpio
//     (excluidos el Campeón y Subcampeón de cada grado)
//     SIN partido — determinación automática.
//
//   Futsal Primaria (4° vs 5°) — inter-grados:
//     Mismo criterio que anterior: Juego Limpio.
//     SIN partido.
//
//   Futsal Grado 3° — independiente:
//     3er puesto = PARTIDO entre los perdedores de semifinal.
//     Se genera con generarFinalY3erPuesto() existente.
//
//   Voleibol (todos los grados):
//     3er puesto = equipo con mayor SUMA DE PUNTOS REALIZADOS
//     en todo el torneo (excluyendo finalistas del grado).
//     SIN partido.
//
// ============================================================

/**
 * Resuelve el 3er puesto para Futsal por Juego Limpio.
 * Aplica a: Futsal 6°, Futsal 7°, Mini Futsal 4°, Mini Futsal 5°.
 * Excluye los dos finalistas del grado (campeón + subcampeón).
 *
 * @param {string} grado   - "4","5","6","7"
 * @param {string} deporte - "Mini Futsal" o "Futsal"
 * @return {Object} { ok, datos: { tercero, criterio, equipos_ranking } }
 */
function calcularTercerPuestoFutsalJuegoLimpio(grado, deporte) {
  try {
    // Obtener tabla de posiciones del grado
    var tabla = leerHoja("TABLA_POSICIONES");
    var tablaGrado = [];
    for (var i = 0; i < tabla.length; i++) {
      if (String(tabla[i].grado) === String(grado) &&
          String(tabla[i].deporte) === String(deporte)) {
        tablaGrado.push(tabla[i]);
      }
    }
    if (tablaGrado.length < 3) {
      return respuestaError(
        "No hay suficientes equipos en la tabla para determinar 3er puesto " +
        "(Grado " + grado + " - " + deporte + "). " +
        "Se necesitan al menos 3 equipos con partidos jugados.",
        "DATOS_INSUFICIENTES"
      );
    }

    // Ordenar por puntos desc → DG desc para identificar top 2
    tablaGrado.sort(function(a, b) {
      var pa = Number(a.puntos)||0, pb = Number(b.puntos)||0;
      if (pb !== pa) return pb - pa;
      return (Number(b.dg)||0) - (Number(a.dg)||0);
    });

    var finalistas = [tablaGrado[0].id_equipo, tablaGrado[1].id_equipo];

    // Obtener tabla de Juego Limpio para el deporte
    var fairPlay = getTablaFairPlay(deporte);
    if (!fairPlay.ok) {
      return respuestaError("No se pudo obtener tabla de Juego Limpio.", "FAIR_PLAY_ERROR");
    }

    // Filtrar equipos del grado que NO son finalistas
    var equipos = leerHoja("EQUIPOS");
    var idsGrado = [];
    for (var k = 0; k < equipos.length; k++) {
      if (String(equipos[k].grado) === String(grado) &&
          String(equipos[k].deporte) === String(deporte) &&
          finalistas.indexOf(String(equipos[k].id_equipo)) === -1) {
        idsGrado.push(String(equipos[k].id_equipo));
      }
    }

    if (idsGrado.length === 0) {
      return respuestaError(
        "No hay equipos candidatos al 3er puesto (todos son finalistas).",
        "SIN_CANDIDATOS"
      );
    }

    // Cruzar con Fair Play — menos puntos negativos = mejor juego limpio
    var candidatos = fairPlay.datos.filter(function(fp) {
      return idsGrado.indexOf(String(fp.id_equipo)) !== -1;
    });

    // Agregar equipos del grado que no tengan sanciones (puntos_neg=0)
    idsGrado.forEach(function(id) {
      var ya = candidatos.some(function(c) { return String(c.id_equipo) === id; });
      if (!ya) {
        var eq = null;
        for (var z = 0; z < equipos.length; z++) {
          if (String(equipos[z].id_equipo) === id) { eq = equipos[z]; break; }
        }
        if (eq) candidatos.push({
          id_equipo : id,
          grupo     : eq.grupo,
          pais      : eq.pais,
          nombre    : eq.nombre_equipo,
          amarillas : 0, rojas: 0, rojas_dir: 0, puntos_neg: 0
        });
      }
    });

    if (candidatos.length === 0) {
      return respuestaError("No se encontraron candidatos con datos de Juego Limpio.", "SIN_CANDIDATOS");
    }

    // Ordenar: menos puntos negativos primero; empate → más puntos en tabla
    candidatos.sort(function(a, b) {
      if (a.puntos_neg !== b.puntos_neg) return a.puntos_neg - b.puntos_neg;
      // Desempate: buscar en tabla de posiciones
      var ptsA = 0, ptsB = 0;
      for (var t = 0; t < tablaGrado.length; t++) {
        if (String(tablaGrado[t].id_equipo) === String(a.id_equipo)) ptsA = Number(tablaGrado[t].puntos)||0;
        if (String(tablaGrado[t].id_equipo) === String(b.id_equipo)) ptsB = Number(tablaGrado[t].puntos)||0;
      }
      return ptsB - ptsA;
    });

    var tercero = candidatos[0];
    log("Motor_Torneo",
        "3er Puesto Futsal Juego Limpio — Grado " + grado + " " + deporte +
        " | Tercero: " + (tercero.pais||tercero.grupo) +
        " | Puntos neg: " + tercero.puntos_neg, "INFO");

    return respuestaExito({
      tercero          : tercero,
      criterio         : "Juego Limpio — menor cantidad de puntos negativos por tarjetas",
      grado            : grado,
      deporte          : deporte,
      finalistas       : finalistas,
      equipos_ranking  : candidatos
    }, "3er Puesto (Juego Limpio): " + (tercero.pais || tercero.grupo) +
       " | Puntos neg: " + tercero.puntos_neg);

  } catch (e) {
    log("Motor_Torneo", "calcularTercerPuestoFutsalJuegoLimpio error: " + e.message, "ERROR");
    return respuestaError("Error calculando 3er puesto Juego Limpio: " + e.message);
  }
}


/**
 * Resuelve el 3er puesto para Voleibol (todos los grados).
 * Criterio: mayor suma de puntos REALIZADOS en todo el torneo,
 * excluyendo los dos finalistas del grado.
 *
 * Para Voleibol los "goles" (puntos) se toman de goles_local / goles_visitante
 * en IC_Partidos, que representan sets (Primaria) o sets (Bachillerato).
 * Se usan los GF (goles a favor) de la tabla de posiciones como proxy.
 *
 * @param {string} grado   - "3","4","5","6","7"
 * @param {string} deporte - "Mini Voleibol" o "Voleibol"
 * @return {Object}
 */
function calcularTercerPuestoVoleibol(grado, deporte) {
  try {
    var tabla = leerHoja("TABLA_POSICIONES");
    var tablaGrado = [];
    for (var i = 0; i < tabla.length; i++) {
      if (String(tabla[i].grado) === String(grado) &&
          String(tabla[i].deporte) === String(deporte)) {
        tablaGrado.push(tabla[i]);
      }
    }
    if (tablaGrado.length < 3) {
      return respuestaError(
        "No hay suficientes equipos en tabla para 3er puesto Voleibol " +
        "(Grado " + grado + ").",
        "DATOS_INSUFICIENTES"
      );
    }

    // Identificar finalistas (top 2 por puntos)
    tablaGrado.sort(function(a, b) {
      var pa = Number(a.puntos)||0, pb = Number(b.puntos)||0;
      if (pb !== pa) return pb - pa;
      return (Number(b.dg)||0) - (Number(a.dg)||0);
    });
    var finalistas = [tablaGrado[0].id_equipo, tablaGrado[1].id_equipo];

    // Candidatos: equipos del grado que NO son finalistas
    var candidatos = tablaGrado.filter(function(t) {
      return finalistas.indexOf(String(t.id_equipo)) === -1;
    });

    if (candidatos.length === 0) {
      return respuestaError("Sin candidatos para 3er puesto Voleibol.", "SIN_CANDIDATOS");
    }

    // Ordenar candidatos: mayor GF (puntos realizados) primero
    candidatos.sort(function(a, b) {
      var gfA = Number(a.gf)||0, gfB = Number(b.gf)||0;
      if (gfB !== gfA) return gfB - gfA;
      // Desempate: mayor diferencia de goles
      return (Number(b.dg)||0) - (Number(a.dg)||0);
    });

    var tercero = candidatos[0];
    log("Motor_Torneo",
        "3er Puesto Voleibol — Grado " + grado + " " + deporte +
        " | Tercero: " + (tercero.pais||tercero.grupo) +
        " | GF (puntos realizados): " + (tercero.gf||0), "INFO");

    return respuestaExito({
      tercero         : tercero,
      criterio        : "Mayor cantidad de puntos realizados (GF) en el torneo completo",
      grado           : grado,
      deporte         : deporte,
      finalistas      : finalistas,
      equipos_ranking : candidatos
    }, "3er Puesto Voleibol (puntos realizados): " + (tercero.pais || tercero.grupo) +
       " | Puntos realizados: " + (tercero.gf || 0));

  } catch (e) {
    log("Motor_Torneo", "calcularTercerPuestoVoleibol error: " + e.message, "ERROR");
    return respuestaError("Error calculando 3er puesto Voleibol: " + e.message);
  }
}


/**
 * Función unificada que despacha al criterio correcto según grado y deporte.
 *
 * Tabla de reglas:
 *   Futsal   Grado 3  → partido (generarFinalY3erPuesto, ya existe)
 *   Futsal   Grado 4  → Juego Limpio (calcularTercerPuestoFutsalJuegoLimpio)
 *   Futsal   Grado 5  → Juego Limpio
 *   Futsal   Grado 6  → Juego Limpio (inter-grados 6vs7)
 *   Futsal   Grado 7  → Juego Limpio (inter-grados 6vs7)
 *   Voleibol todos    → Mayor puntos realizados (calcularTercerPuestoVoleibol)
 *
 * @param {string} grado
 * @param {string} deporte
 * @return {Object}
 */
function resolverTercerPuesto(grado, deporte) {
  var g = String(grado);
  var esVoley  = deporte.indexOf("Voleibol") !== -1;
  var esFutsal = deporte.indexOf("Futsal")   !== -1;

  if (esVoley) {
    // Voleibol TODAS las categorías: mayor puntos realizados (GF)
    return calcularTercerPuestoVoleibol(g, deporte);
  }

  if (esFutsal) {
    // Futsal TODAS las categorías: Juego Limpio (menor puntos negativos)
    // Grado 3 también usa Juego Limpio como criterio de desempate
    // (aunque sí juega partido — nota informativa incluida)
    if (g === "3") {
      var r3 = calcularTercerPuestoFutsalJuegoLimpio(g, deporte);
      if (r3.ok && r3.datos) {
        r3.datos.nota = "Grado 3 disputa PARTIDO de 3er puesto. Este criterio aplica en caso de empate.";
        r3.datos.juega_partido = true;
      }
      return r3;
    }
    return calcularTercerPuestoFutsalJuegoLimpio(g, deporte);
  }

  return respuestaError("Deporte no reconocido: " + deporte, "DEPORTE_INVALIDO");
}


/**
 * Dispatcher por categoría combinada.
 * La nueva estructura de premios tiene 3 categorías:
 *   Categoría 1: Grado 3°              (independiente)
 *   Categoría 2: Grados 4° y 5°        (Final Especial Primaria)
 *   Categoría 3: Grados 6° y 7°        (Gran Final Bachillerato)
 *
 * Para categorías combinadas (4-5 y 6-7), busca el equipo con
 * mejor criterio entre los NO finalistas de AMBOS grados.
 *
 * @param {string} categoria - "3", "45" o "67"
 * @param {string} deporte   - nombre del deporte
 * @return {Object}
 */
function resolverTercerPuestoCategoria(categoria, deporte) {
  try {
    var esVoley  = deporte.indexOf("Voleibol") !== -1;
    var esFutsal = deporte.indexOf("Futsal")   !== -1;

    if (!esVoley && !esFutsal) {
      return respuestaError("Deporte no reconocido: " + deporte, "DEPORTE_INVALIDO");
    }

    if (categoria === "3") {
      // Grado 3 individual
      return resolverTercerPuesto("3", deporte);
    }

    // Para categorías 4-5 y 6-7: obtener candidatos de AMBOS grados
    var grados = categoria === "45" ? ["4", "5"] : ["6", "7"];
    var tabla  = leerHoja("TABLA_POSICIONES");
    var equipos = leerHoja("EQUIPOS");

    // Identificar finalistas de ambos grados (top 2 de cada grado)
    var finalistasIds = [];
    grados.forEach(function(g) {
      var filas = tabla.filter(function(t) {
        return String(t.grado) === g && String(t.deporte) === deporte;
      });
      filas.sort(function(a, b) {
        var pa = Number(a.puntos)||0, pb = Number(b.puntos)||0;
        if (pb !== pa) return pb - pa;
        return (Number(b.dg)||0) - (Number(a.dg)||0);
      });
      if (filas[0]) finalistasIds.push(String(filas[0].id_equipo));
      if (filas[1]) finalistasIds.push(String(filas[1].id_equipo));
    });

    if (esVoley) {
      // Candidatos: todos los equipos de ambos grados que NO son finalistas
      var candidatos = tabla.filter(function(t) {
        return grados.indexOf(String(t.grado)) !== -1 &&
               String(t.deporte) === deporte &&
               finalistasIds.indexOf(String(t.id_equipo)) === -1;
      });
      candidatos.sort(function(a, b) {
        var gfA = Number(a.gf)||0, gfB = Number(b.gf)||0;
        if (gfB !== gfA) return gfB - gfA;
        return (Number(b.dg)||0) - (Number(a.dg)||0);
      });
      if (candidatos.length === 0) {
        return respuestaError("Sin candidatos para 3er puesto Voleibol cat. " + categoria, "SIN_CANDIDATOS");
      }
      return respuestaExito({
        tercero  : candidatos[0],
        criterio : "Mayor puntos realizados (GF) en el torneo — Voleibol",
        categoria: categoria,
        deporte  : deporte,
        finalistas: finalistasIds,
        ranking  : candidatos
      }, "3er Puesto Voleibol cat." + categoria + ": " + (candidatos[0].pais || candidatos[0].grupo));
    }

    // Futsal: Juego Limpio entre candidatos de ambos grados
    var fairPlay = getTablaFairPlay(deporte);
    if (!fairPlay.ok) return respuestaError("No se pudo obtener tabla Fair Play.", "FAIR_PLAY_ERROR");

    var idsGrados = [];
    equipos.forEach(function(e) {
      if (grados.indexOf(String(e.grado)) !== -1 &&
          String(e.deporte) === deporte &&
          finalistasIds.indexOf(String(e.id_equipo)) === -1) {
        idsGrados.push(String(e.id_equipo));
      }
    });

    var candidatosFP = fairPlay.datos.filter(function(fp) {
      return idsGrados.indexOf(String(fp.id_equipo)) !== -1;
    });

    // Agregar equipos sin sanciones
    idsGrados.forEach(function(id) {
      var ya = candidatosFP.some(function(c) { return String(c.id_equipo) === id; });
      if (!ya) {
        var eq = null;
        for (var z = 0; z < equipos.length; z++) {
          if (String(equipos[z].id_equipo) === id) { eq = equipos[z]; break; }
        }
        if (eq) candidatosFP.push({ id_equipo: id, grupo: eq.grupo, pais: eq.pais, puntos_neg: 0 });
      }
    });

    candidatosFP.sort(function(a, b) { return (a.puntos_neg||0) - (b.puntos_neg||0); });

    if (candidatosFP.length === 0) {
      return respuestaError("Sin candidatos para 3er puesto Futsal cat. " + categoria, "SIN_CANDIDATOS");
    }

    return respuestaExito({
      tercero  : candidatosFP[0],
      criterio : "Juego Limpio — menor puntos negativos por tarjetas — Futsal",
      categoria: categoria,
      deporte  : deporte,
      finalistas: finalistasIds,
      ranking  : candidatosFP
    }, "3er Puesto Futsal cat." + categoria + " (JL): " + (candidatosFP[0].pais || candidatosFP[0].grupo));

  } catch (e) {
    log("Motor_Torneo", "resolverTercerPuestoCategoria error: " + e.message, "ERROR");
    return respuestaError("Error calculando 3er puesto: " + e.message);
  }
}


