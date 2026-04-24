// ============================================================
// Data_Repechaje.gs — Logica del Repechaje Inter-Grados
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// El repechaje es el evento final simbolico del torneo.
// Campeones de cada grado se refuerzan con jugadores de otros
// grupos del mismo grado y enfrentan al campeon del grado siguiente.
// Depende de: Utils.gs, Data_Interclases.gs
// ============================================================


// ============================================================
// ESTRUCTURA DEL REPECHAJE
// Partido R1: Campeon 3° + refuerzos  vs  Campeon 4° + refuerzos
// Partido R2: Campeon 4° reforzado    vs  Campeon 5° + refuerzos
// Partido R3: Campeon 5° reforzado    vs  Campeon 6° + refuerzos
// Partido R4: Campeon 6° reforzado    vs  Campeon 7° + refuerzos
// ============================================================


/**
 * Retorna los campeones actuales de cada grado.
 * Lee la tabla de posiciones y retorna el primero de cada grado
 * para el deporte con mas partidos jugados (como criterio principal).
 * @return {Object} respuestaExito con mapa { grado: datos_equipo }
 */
/**
 * Retorna el campeon de cada grado POR DEPORTE.
 * CORRECCIÓN AUDITORÍA: la versión anterior mezclaba Futsal y Voleibol
 * porque agrupaba solo por grado. Ahora agrupa por grado+deporte.
 *
 * Retorna un objeto con claves "GRADO_DEPORTE":
 *   { "6_Futsal": {...}, "6_Voleibol": {...}, "7_Futsal": {...}, ... }
 *
 * También mantiene compatibilidad con la clave simple "GRADO" tomando
 * el deporte principal del nivel (Futsal para Bachillerato, Mini Futsal
 * para Primaria) para no romper código existente.
 */
function getCampeonesGrado() {
  try {
    var tabla    = leerHoja("TABLA_POSICIONES");
    var campeones = {};

    // Agrupar por grado+deporte (clave compuesta)
    var porCombo = {};
    for (var i = 0; i < tabla.length; i++) {
      var t   = tabla[i];
      var g   = String(t.grado);
      var dep = String(t.deporte || "");
      var key = g + "_" + dep;
      if (!porCombo[key]) porCombo[key] = [];
      porCombo[key].push(t);
    }

    for (var combo in porCombo) {
      var filas = porCombo[combo];
      // Ordenar: puntos desc → DG desc → GF desc
      filas.sort(function(a, b) {
        var pa = Number(a.puntos) || 0, pb = Number(b.puntos) || 0;
        if (pb !== pa) return pb - pa;
        var da = Number(a.dg) || 0, db = Number(b.dg) || 0;
        if (db !== da) return db - da;
        return (Number(b.gf) || 0) - (Number(a.gf) || 0);
      });

      if (filas.length === 0) continue;
      var lider  = filas[0];
      var partes = combo.split("_");
      var grado  = partes[0];
      var deporte= partes.slice(1).join("_"); // soporta "Mini Futsal"
      var eqData = buscarFila("EQUIPOS", "id_equipo", lider.id_equipo);

      var infoCampeon = {
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

      // Clave compuesta (nueva, precisa)
      campeones[combo] = infoCampeon;

      // Clave simple por grado (compatibilidad hacia atrás)
      // Solo se sobreescribe si es el deporte "principal" del nivel
      var deportePrincipal = (parseInt(grado) <= 5) ? "Mini Futsal" : "Futsal";
      if (deporte === deportePrincipal || !campeones[grado]) {
        campeones[grado] = infoCampeon;
      }
    }

    log("Data_Repechaje", "getCampeonesGrado: " + Object.keys(campeones).length + " entradas", "INFO");
    return respuestaExito(campeones, "Campeones cargados: " + Object.keys(campeones).length);
  } catch (e) {
    log("Data_Repechaje", "getCampeonesGrado error: " + e.message, "ERROR");
    return respuestaError("Error obteniendo campeones: " + e.message);
  }
}

/**
 * Retorna los jugadores disponibles para ser refuerzos de un equipo.
 * Un refuerzo es un jugador de otro grupo del MISMO grado
 * que no sea el equipo campeon.
 * @param {string} idEquipoCampeon - ID del equipo que pide refuerzos
 * @param {string} grado - Grado del equipo campeon
 * @return {Object} respuestaExito con lista de jugadores disponibles
 */
function getJugadoresRefuerzo(idEquipoCampeon, grado) {
  try {
    var jugadores = leerHoja("JUGADORES");
    var equipos   = leerHoja("EQUIPOS");

    // Obtener todos los grupos del mismo grado excepto el campeon
    var gruposGrado = CONFIG.GRUPOS[String(grado)] || [];
    var equiposOtros = [];

    for (var i = 0; i < equipos.length; i++) {
      var eq = equipos[i];
      if (
        String(eq.grado) === String(grado) &&
        String(eq.id_equipo) !== String(idEquipoCampeon)
      ) {
        equiposOtros.push(String(eq.id_equipo));
      }
    }

    // Filtrar jugadores de esos equipos
    var disponibles = [];
    for (var j = 0; j < jugadores.length; j++) {
      var jug = jugadores[j];
      for (var k = 0; k < equiposOtros.length; k++) {
        if (String(jug.id_equipo) === equiposOtros[k]) {
          // Agregar info del pais del equipo
          var eqJug = buscarFila("EQUIPOS", "id_equipo", jug.id_equipo);
          disponibles.push({
            id_jugador      : jug.id_jugador,
            nombre_completo : jug.nombre_completo,
            genero          : jug.genero,
            numero_camiseta : jug.numero_camiseta,
            posicion        : jug.posicion,
            id_equipo       : jug.id_equipo,
            grupo           : jug.grupo,
            pais            : eqJug ? eqJug.datos.pais : "",
            bandera         : eqJug ? eqJug.datos.bandera_codigo : ""
          });
          break;
        }
      }
    }

    return respuestaExito(disponibles, disponibles.length + " jugadores disponibles como refuerzo.");
  } catch (e) {
    log("Data_Repechaje", "getJugadoresRefuerzo error: " + e.message, "ERROR");
    return respuestaError("Error obteniendo jugadores refuerzo: " + e.message);
  }
}

/**
 * Crea un partido de repechaje con los equipos y refuerzos definidos.
 * @param {Object} datos - Campos del partido de repechaje
 * @return {Object}
 */
function crearPartidoRepechaje(datos) {
  try {
    if (!datos.numero_partido) {
      return respuestaError("numero_partido es requerido.", "CAMPO_REQUERIDO");
    }
    if (!datos.id_equipo_a || !datos.id_equipo_b) {
      return respuestaError("Se requieren ambos equipos.", "DATOS_INCOMPLETOS");
    }

    // Verificar que no exista ya este numero de partido
    var existente = buscarFila("REPECHAJE", "numero_partido", datos.numero_partido);
    if (existente) {
      return respuestaError(
        "El partido de repechaje N° " + datos.numero_partido + " ya existe.",
        "PARTIDO_DUPLICADO"
      );
    }

    var eqA = buscarFila("EQUIPOS", "id_equipo", datos.id_equipo_a);
    var eqB = buscarFila("EQUIPOS", "id_equipo", datos.id_equipo_b);

    if (!eqA || !eqB) {
      return respuestaError("Uno o ambos equipos no encontrados.", "EQUIPO_NO_ENCONTRADO");
    }

    var idRep = generarId("REP");
    var fila  = [
      idRep,
      datos.numero_partido,
      datos.id_equipo_a,
      eqA.datos.grupo,
      eqA.datos.pais,
      JSON.stringify(datos.refuerzos_a || []),  // array de id_jugador
      datos.id_equipo_b,
      eqB.datos.grupo,
      eqB.datos.pais,
      JSON.stringify(datos.refuerzos_b || []),  // array de id_jugador
      "",   // goles_a
      "",   // goles_b
      CONFIG.ESTADOS_PARTIDO.PROGRAMADO,
      "",   // observaciones_docente
      datos.fecha || ""
    ];

    agregarFila("REPECHAJE", fila);

    log("Data_Repechaje",
        "Partido repechaje creado: R" + datos.numero_partido +
        " | " + eqA.datos.grupo + " vs " + eqB.datos.grupo, "INFO");

    return respuestaExito(
      { id_repechaje: idRep, numero_partido: datos.numero_partido },
      "Partido de repechaje R" + datos.numero_partido + " creado."
    );
  } catch (e) {
    log("Data_Repechaje", "crearPartidoRepechaje error: " + e.message, "ERROR");
    return respuestaError("Error creando partido de repechaje: " + e.message);
  }
}

/**
 * Retorna todos los partidos de repechaje.
 * Incluye la nomina de refuerzos parseada.
 * @return {Object}
 */
function getPartidosRepechaje() {
  try {
    var partidos = leerHoja("REPECHAJE");
    var resultado = [];

    for (var i = 0; i < partidos.length; i++) {
      var p = partidos[i];
      var obj = {};

      // Copiar todos los campos
      for (var k in p) {
        obj[k] = p[k];
      }

      // Parsear refuerzos (guardados como JSON string)
      try {
        obj.refuerzos_a_lista = p.refuerzos_a
          ? JSON.parse(String(p.refuerzos_a))
          : [];
      } catch(e) {
        obj.refuerzos_a_lista = [];
      }
      try {
        obj.refuerzos_b_lista = p.refuerzos_b
          ? JSON.parse(String(p.refuerzos_b))
          : [];
      } catch(e) {
        obj.refuerzos_b_lista = [];
      }

      resultado.push(obj);
    }

    // Ordenar por numero_partido
    resultado.sort(function(a, b) {
      return (Number(a.numero_partido) || 0) - (Number(b.numero_partido) || 0);
    });

    return respuestaExito(resultado);
  } catch (e) {
    log("Data_Repechaje", "getPartidosRepechaje error: " + e.message, "ERROR");
    return respuestaError("Error obteniendo partidos repechaje: " + e.message);
  }
}

/**
 * Retorna un partido de repechaje por su numero.
 * @param {number} numero
 * @return {Object}
 */
function getPartidoRepechajePorNumero(numero) {
  try {
    var resultado = buscarFila("REPECHAJE", "numero_partido", numero);
    if (!resultado) {
      return respuestaError("Partido de repechaje R" + numero + " no encontrado.", "NO_ENCONTRADO");
    }
    return respuestaExito(resultado.datos);
  } catch (e) {
    log("Data_Repechaje", "getPartidoRepechajePorNumero error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}

/**
 * Actualiza la nomina de refuerzos de un partido de repechaje.
 * @param {string} idRepechaje - ID del registro
 * @param {string} equipo - "a" o "b"
 * @param {Array} refuerzos - Array de id_jugador
 * @return {Object}
 */
function actualizarRefuerzos(idRepechaje, equipo, refuerzos, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    var resultado = buscarFila("REPECHAJE", "id_repechaje", idRepechaje);
    if (!resultado) {
      return respuestaError("Registro de repechaje no encontrado.", "NO_ENCONTRADO");
    }

    var hoja   = getHoja("REPECHAJE");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];

    var colKey = equipo === "a" ? "refuerzos_a" : "refuerzos_b";
    var colIdx = encabs.indexOf(colKey) + 1;

    if (colIdx === 0) {
      return respuestaError("Columna " + colKey + " no encontrada.", "COLUMNA_NO_ENCONTRADA");
    }

    // Validar maximo 3 refuerzos
    if (refuerzos && refuerzos.length > 3) {
      return respuestaError(
        "Maximo 3 refuerzos por equipo. Recibidos: " + refuerzos.length,
        "REFUERZOS_EXCEDIDOS"
      );
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      hoja.getRange(resultado.fila, colIdx).setValue(JSON.stringify(refuerzos || []));
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Data_Repechaje",
        "Refuerzos actualizados: " + idRepechaje + " equipo " + equipo +
        " | " + (refuerzos ? refuerzos.length : 0) + " jugadores", "INFO");

    return respuestaExito(null, "Refuerzos actualizados correctamente.");
  } catch (e) {
    log("Data_Repechaje", "actualizarRefuerzos error: " + e.message, "ERROR");
    return respuestaError("Error actualizando refuerzos: " + e.message);
  }
}

/**
 * Registra el resultado de un partido de repechaje.
 * @param {string} idRepechaje
 * @param {number} golesA
 * @param {number} golesB
 * @param {string} observaciones
 * @return {Object}
 */
function registrarResultadoRepechaje(idRepechaje, golesA, golesB, observaciones, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    var resultado = buscarFila("REPECHAJE", "id_repechaje", idRepechaje);
    if (!resultado) {
      return respuestaError("Partido de repechaje no encontrado.", "NO_ENCONTRADO");
    }

    var hoja   = getHoja("REPECHAJE");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      hoja.getRange(resultado.fila, encabs.indexOf("goles_a")                + 1).setValue(Number(golesA) || 0);
      hoja.getRange(resultado.fila, encabs.indexOf("goles_b")                + 1).setValue(Number(golesB) || 0);
      hoja.getRange(resultado.fila, encabs.indexOf("estado")                 + 1).setValue(CONFIG.ESTADOS_PARTIDO.FINALIZADO);
      hoja.getRange(resultado.fila, encabs.indexOf("observaciones_docente")  + 1).setValue(observaciones || "");
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Data_Repechaje",
        "Resultado repechaje registrado: " + idRepechaje +
        " | " + golesA + "-" + golesB, "INFO");

    return respuestaExito(
      { id_repechaje: idRepechaje, goles_a: golesA, goles_b: golesB },
      "Resultado del repechaje registrado."
    );
  } catch (e) {
    log("Data_Repechaje", "registrarResultadoRepechaje error: " + e.message, "ERROR");
    return respuestaError("Error registrando resultado: " + e.message);
  }
}

/**
 * Agrega o actualiza la observacion del docente sobre un jugador
 * durante el repechaje (para pre-seleccion intercolegiados).
 * @param {string} idRepechaje
 * @param {string} observaciones - Texto de observaciones
 * @return {Object}
 */
function actualizarObservacionesRepechaje(idRepechaje, observaciones) {
  try {
    var resultado = buscarFila("REPECHAJE", "id_repechaje", idRepechaje);
    if (!resultado) {
      return respuestaError("Partido de repechaje no encontrado.", "NO_ENCONTRADO");
    }

    var hoja   = getHoja("REPECHAJE");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];
    var col    = encabs.indexOf("observaciones_docente") + 1;

    if (col === 0) {
      return respuestaError("Columna observaciones_docente no encontrada.");
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      hoja.getRange(resultado.fila, col).setValue(observaciones || "");
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    return respuestaExito(null, "Observaciones guardadas.");
  } catch (e) {
    log("Data_Repechaje", "actualizarObservacionesRepechaje error: " + e.message, "ERROR");
    return respuestaError("Error guardando observaciones: " + e.message);
  }
}

/**
 * Genera automaticamente la estructura de 4 partidos de repechaje
 * usando los campeones de cada grado.
 * Solo puede ejecutarse una vez (valida que no existan partidos previos).
 * @param {string} fechaBase - "YYYY-MM-DD"
 * @param {string} horaInicio - "HH:MM"
 * @return {Object}
 */
/**
 * Genera la estructura correcta de finales inter-grados según el documento.
 * CORRECCIÓN AUDITORÍA: la versión anterior generaba 4 cruces incorrectos
 * (3v4, 4v5, 5v6, 6v7). La versión correcta genera SOLO:
 *   - Final Especial Primaria: Camp. 4° vs Camp. 5° (por cada deporte)
 *   - Super Final Bachillerato: Camp. 6° vs Camp. 7° (por cada deporte)
 *
 * Reglas de refuerzo:
 *   - Grado 4: puede reforzarse con máx 2 jugadores de otro grupo del mismo grado
 *   - Grado 6: puede reforzarse con 1 jugador para la Super Final
 *
 * @param {string} fechaBase   - "YYYY-MM-DD"
 * @param {string} horaInicio  - "HH:MM"
 * @return {Object}
 */
function generarEstructuraRepechaje(fechaBase, horaInicio, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    // Verificar que no existan partidos de repechaje
    var existentes = leerHoja("REPECHAJE");
    if (existentes.length > 0) {
      return respuestaError(
        "Ya existen " + existentes.length + " partido(s) de finales. " +
        "Eliminalos manualmente de IC_Repechaje antes de regenerar.",
        "REPECHAJE_EXISTENTE"
      );
    }

    // Obtener campeones por grado+deporte
    var resCamp = getCampeonesGrado();
    if (!resCamp.ok) {
      return respuestaError("No se pudieron obtener los campeones: " + resCamp.mensaje);
    }

    var campeones = resCamp.datos;
    var hora      = horaInicio || "13:00";
    var DURACION  = 60;
    var idsCreados = [];
    var errores    = [];

    // ── FINALES A GENERAR ──
    // Solo estas 4 combinaciones según el documento oficial:
    var finales = [
      {
        num       : 1,
        gradoA    : "4",
        gradoB    : "5",
        deporte   : "Mini Futsal",
        label     : "Final Especial Primaria — Mini Futsal (4° vs 5°)",
        refuerzoA : "Grado 4 puede reforzarse con max 2 jugadores",
        refuerzoB : "Grado 5 sin refuerzos"
      },
      {
        num       : 2,
        gradoA    : "4",
        gradoB    : "5",
        deporte   : "Mini Voleibol",
        label     : "Final Especial Primaria — Mini Voleibol (4° vs 5°)",
        refuerzoA : "Grado 4 puede reforzarse con max 2 jugadores",
        refuerzoB : "Grado 5 sin refuerzos"
      },
      {
        num       : 3,
        gradoA    : "6",
        gradoB    : "7",
        deporte   : "Futsal",
        label     : "Super Final Bachillerato — Futsal (6° vs 7°)",
        refuerzoA : "Grado 6 puede reforzarse con 1 jugador",
        refuerzoB : "Grado 7 sin refuerzos"
      },
      {
        num       : 4,
        gradoA    : "6",
        gradoB    : "7",
        deporte   : "Voleibol",
        label     : "Super Final Bachillerato — Voleibol (6° vs 7°)",
        refuerzoA : "Grado 6 puede reforzarse con 1 jugador",
        refuerzoB : "Grado 7 sin refuerzos"
      }
    ];

    // Verificar que existan campeones para todos los grados/deportes
    var faltantes = [];
    for (var f = 0; f < finales.length; f++) {
      var fin  = finales[f];
      var keyA = fin.gradoA + "_" + fin.deporte;
      var keyB = fin.gradoB + "_" + fin.deporte;
      if (!campeones[keyA]) faltantes.push("Campeon Grado " + fin.gradoA + " - " + fin.deporte);
      if (!campeones[keyB]) faltantes.push("Campeon Grado " + fin.gradoB + " - " + fin.deporte);
    }

    if (faltantes.length > 0) {
      return respuestaError(
        "Faltan campeones para: " + faltantes.join(", ") +
        ". Asegurate de que todos los torneos esten finalizados antes de generar las finales.",
        "CAMPEONES_FALTANTES"
      );
    }

    // Crear los 4 partidos de finales
    for (var i = 0; i < finales.length; i++) {
      var fin   = finales[i];
      var keyA  = fin.gradoA + "_" + fin.deporte;
      var keyB  = fin.gradoB + "_" + fin.deporte;
      var campA = campeones[keyA];
      var campB = campeones[keyB];
      var horaPartido = calcularHora(hora, i * DURACION);

      var res = crearPartidoRepechaje({
        numero_partido : fin.num,
        id_equipo_a    : campA.id_equipo,
        id_equipo_b    : campB.id_equipo,
        fase           : fin.label,
        refuerzos_a    : [],
        refuerzos_b    : [],
        fecha          : (fechaBase || "") + " " + horaPartido,
        observaciones  : fin.refuerzoA + ". " + fin.refuerzoB
      });

      if (res.ok) {
        idsCreados.push(res.datos.id_repechaje);
        log("Data_Repechaje", "Final generada: " + fin.label +
            " | " + campA.grupo + " (" + campA.pais + ")" +
            " vs " + campB.grupo + " (" + campB.pais + ")", "INFO");
      } else {
        errores.push(fin.label + ": " + res.mensaje);
        log("Data_Repechaje", "Error generando " + fin.label + ": " + res.mensaje, "ERROR");
      }
    }

    if (idsCreados.length === 0) {
      return respuestaError(
        "No se pudo generar ninguna final. Errores: " + errores.join(" | "),
        "GENERACION_FALLIDA"
      );
    }

    return respuestaExito(
      {
        partidos_creados : idsCreados.length,
        ids              : idsCreados,
        errores          : errores,
        detalle          : [
          "Final Especial Primaria Mini Futsal:   " + (campeones["4_Mini Futsal"] || {}).grupo  + " vs " + (campeones["5_Mini Futsal"] || {}).grupo,
          "Final Especial Primaria Mini Voleibol: " + (campeones["4_Mini Voleibol"] || {}).grupo + " vs " + (campeones["5_Mini Voleibol"] || {}).grupo,
          "Super Final Bachillerato Futsal:        " + (campeones["6_Futsal"] || {}).grupo        + " vs " + (campeones["7_Futsal"] || {}).grupo,
          "Super Final Bachillerato Voleibol:      " + (campeones["6_Voleibol"] || {}).grupo      + " vs " + (campeones["7_Voleibol"] || {}).grupo
        ]
      },
      idsCreados.length + " finales inter-grados generadas correctamente." +
      (errores.length > 0 ? " " + errores.length + " errores." : "")
    );

  } catch (e) {
    log("Data_Repechaje", "generarEstructuraRepechaje error: " + e.message, "ERROR");
    return respuestaError("Error generando finales: " + e.message);
  }
}

/**
 * Retorna el resumen completo del repechaje para la vista admin.
 * Incluye datos de equipos, jugadores titulares y refuerzos.
 * @return {Object}
 */
function getResumenRepechaje() {
  try {
    var partidos  = getPartidosRepechaje();
    if (!partidos.ok) return partidos;

    var campeones = getCampeonesGrado();
    var jugadores = leerHoja("JUGADORES");
    var equipos   = leerHoja("EQUIPOS");

    var resumen = [];

    for (var i = 0; i < partidos.datos.length; i++) {
      var p = partidos.datos[i];

      // Obtener jugadores titulares del equipo A
      var titularesA = jugadores.filter(function(j) {
        return String(j.id_equipo) === String(p.id_equipo_a);
      });

      // Obtener jugadores titulares del equipo B
      var titularesB = jugadores.filter(function(j) {
        return String(j.id_equipo) === String(p.id_equipo_b);
      });

      // Resolver datos de refuerzos A
      var refuerzosADetalle = [];
      var listaRefA = p.refuerzos_a_lista || [];
      for (var ra = 0; ra < listaRefA.length; ra++) {
        for (var jj = 0; jj < jugadores.length; jj++) {
          if (String(jugadores[jj].id_jugador) === String(listaRefA[ra])) {
            refuerzosADetalle.push(jugadores[jj]);
            break;
          }
        }
      }

      // Resolver datos de refuerzos B
      var refuerzosBDetalle = [];
      var listaRefB = p.refuerzos_b_lista || [];
      for (var rb = 0; rb < listaRefB.length; rb++) {
        for (var jk = 0; jk < jugadores.length; jk++) {
          if (String(jugadores[jk].id_jugador) === String(listaRefB[rb])) {
            refuerzosBDetalle.push(jugadores[jk]);
            break;
          }
        }
      }

      resumen.push({
        id_repechaje        : p.id_repechaje,
        numero_partido      : p.numero_partido,
        estado              : p.estado,
        fecha               : p.fecha,
        goles_a             : p.goles_a,
        goles_b             : p.goles_b,
        observaciones       : p.observaciones_docente,
        equipo_a: {
          id_equipo   : p.id_equipo_a,
          grupo       : p.grupo_a,
          pais        : p.pais_a,
          titulares   : titularesA,
          refuerzos   : refuerzosADetalle
        },
        equipo_b: {
          id_equipo   : p.id_equipo_b,
          grupo       : p.grupo_b,
          pais        : p.pais_b,
          titulares   : titularesB,
          refuerzos   : refuerzosBDetalle
        }
      });
    }

    return respuestaExito(resumen);
  } catch (e) {
    log("Data_Repechaje", "getResumenRepechaje error: " + e.message, "ERROR");
    return respuestaError("Error generando resumen: " + e.message);
  }
}