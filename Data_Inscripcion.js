// ============================================================
// Data_Inscripcion.gs v2 — Inscripcion de equipos y jugadores
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// CAMBIOS v2:
// - inscribirEquipo() ahora REQUIERE el campo 'deporte'
// - id_equipo se construye con generarIdEquipo(grupo, deporte)
//   Ejemplo: "301_MF" para Mini Futsal, "301_MV" para Mini Voley
// - La validacion de duplicado es grupo + deporte (no solo grupo)
// - Un grupo puede inscribirse DOS veces (una por deporte)
// - getResumenInscripciones() muestra ambos equipos de cada grupo
// - getCatalogoPaises() ahora es por id_equipo (no grupo)
// Depende de: Utils.gs v2
// ============================================================


// ============================================================
// INSCRIPCION DE EQUIPOS
// ============================================================

/**
 * Inscribe un equipo en el torneo.
 * Un grupo puede tener HASTA 2 equipos (uno por deporte).
 * El campo 'deporte' es OBLIGATORIO en v2.
 * @param {Object} datos - Incluye: grupo, deporte, capitan, pais_opcionA...
 * @return {Object}
 */
function inscribirEquipo(datos) {
  try {
    var auth = verificarPIN(datos.pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    // ── Validaciones de campos requeridos ──
    if (!datos.grupo) {
      return respuestaError("El campo 'grupo' es requerido.", "CAMPO_REQUERIDO");
    }
    if (!datos.deporte) {
      return respuestaError(
        "El campo 'deporte' es requerido. Un grupo tiene un equipo por deporte.",
        "CAMPO_REQUERIDO"
      );
    }
    if (!datos.capitan || String(datos.capitan).trim() === "") {
      return respuestaError("El campo 'capitan' es requerido.", "CAMPO_REQUERIDO");
    }
    if (!datos.pais_opcionA || String(datos.pais_opcionA).trim() === "") {
      return respuestaError("Debes indicar al menos la opcion A de pais.", "CAMPO_REQUERIDO");
    }

    var grupo   = String(datos.grupo);
    var deporte = String(datos.deporte);

    // ── Validar grupo ──
    if (!grupoValido(grupo)) {
      return respuestaError(
        "El grupo '" + grupo + "' no es valido. Grupos: 301-304, 401-404, 501-504, 601-603, 702-704.",
        "GRUPO_INVALIDO"
      );
    }

    // ── Validar deporte para el nivel del grupo ──
    if (!deporteValidoParaGrupo(deporte, grupo)) {
      var deportesPermitidos = getDeportesGrupo(grupo).join(", ");
      return respuestaError(
        "El deporte '" + deporte + "' no es valido para el grupo " + grupo + ". " +
        "Deportes permitidos: " + deportesPermitidos + ".",
        "DEPORTE_INVALIDO"
      );
    }

    // ── Construir id_equipo unico: grupo + "_" + codigoDeporte ──
    var idEquipo;
    try {
      idEquipo = generarIdEquipo(grupo, deporte);
    } catch (eId) {
      return respuestaError("Error construyendo ID de equipo: " + eId.message, "ID_ERROR");
    }

    // ── Validar que esta combinacion grupo+deporte no este inscrita ──
    var existente = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    if (existente) {
      return respuestaError(
        "El grupo " + grupo + " ya tiene un equipo de " + deporte + " inscrito " +
        "('" + existente.datos.nombre_equipo + "'). " +
        "Cada grupo puede inscribirse una sola vez por deporte.",
        "EQUIPO_DUPLICADO"
      );
    }

    // ── Validar opciones de pais distintas ──
    var opcionA = String(datos.pais_opcionA).trim();
    var opcionB = String(datos.pais_opcionB || "").trim();
    var opcionC = String(datos.pais_opcionC || "").trim();

    if (opcionB && opcionB === opcionA) {
      return respuestaError("La opcion B no puede ser igual a la opcion A.", "OPCIONES_DUPLICADAS");
    }
    if (opcionC && (opcionC === opcionA || opcionC === opcionB)) {
      return respuestaError("La opcion C no puede repetir A o B.", "OPCIONES_DUPLICADAS");
    }

    // ── Determinar grado y nivel ──
    var grado = getGradoGrupo(grupo);
    var nivel = getNivelGrupo(grupo);
    var ahora = fechaHoraActual();

    // ── Escribir en IC_Equipos ──
    // Columnas v2: id_equipo, grupo, grado, nivel, deporte, nombre_equipo,
    //              pais, bandera_codigo, color_camiseta, capitan,
    //              fecha_inscripcion, pais_opcionA, pais_opcionB, pais_opcionC, estado
    var fila = [
      idEquipo,
      grupo,
      grado,
      nivel,
      deporte,
      String(datos.nombre_equipo || "Delegacion " + grupo + " " + deporte).trim(),
      "",          // pais (asignado despues por IA)
      "",          // bandera_codigo
      String(datos.color_camiseta || "").trim(),
      String(datos.capitan).trim(),
      ahora,
      opcionA,
      opcionB,
      opcionC,
      "inscrito"
    ];

    agregarFila("EQUIPOS", fila);

    log("Data_Inscripcion",
        "Equipo inscrito: " + idEquipo + " | " + grupo + " - " + deporte, "INFO");

    return respuestaExito(
      { id_equipo: idEquipo, grupo: grupo, deporte: deporte, grado: grado, nivel: nivel },
      "Equipo del grupo " + grupo + " (" + deporte + ") inscrito correctamente. " +
      "El pais se asignara en la ceremonia de apertura."
    );
  } catch (e) {
    log("Data_Inscripcion", "inscribirEquipo error: " + e.message, "ERROR");
    return respuestaError("Error inscribiendo equipo: " + e.message);
  }
}

/**
 * Actualiza datos editables de un equipo ya inscrito.
 * No permite cambiar grupo ni deporte (definen el id_equipo).
 * @param {string} idEquipo
 * @param {Object} cambios
 * @return {Object}
 */
function actualizarEquipo(idEquipo, cambios, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    var resultado = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    if (!resultado) {
      return respuestaError("Equipo no encontrado: " + idEquipo, "EQUIPO_NO_ENCONTRADO");
    }

    var hoja   = getHoja("EQUIPOS");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];

    var camposPermitidos = [
      "nombre_equipo","color_camiseta","capitan",
      "pais_opcionA","pais_opcionB","pais_opcionC"
    ];

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      for (var i = 0; i < camposPermitidos.length; i++) {
        var campo = camposPermitidos[i];
        if (cambios[campo] !== undefined && cambios[campo] !== null) {
          var colIndex = encabs.indexOf(campo) + 1;
          if (colIndex > 0) {
            hoja.getRange(resultado.fila, colIndex).setValue(String(cambios[campo]).trim());
          }
        }
      }
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Data_Inscripcion", "Equipo actualizado: " + idEquipo, "INFO");
    return respuestaExito(null, "Equipo actualizado correctamente.");
  } catch (e) {
    log("Data_Inscripcion", "actualizarEquipo error: " + e.message, "ERROR");
    return respuestaError("Error actualizando equipo: " + e.message);
  }
}


// ============================================================
// INSCRIPCION DE JUGADORES
// ============================================================

/**
 * Registra un jugador en un equipo.
 * En v2 los jugadores pertenecen a id_equipo (grupo + deporte),
 * no al grupo generico. Un jugador puede estar en el equipo de
 * Futsal Y en el de Voleibol del mismo grupo (son equipos distintos).
 * @param {Object} datos
 * @return {Object}
 */
function inscribirJugador(datos) {
  try {
    var auth = verificarPIN(datos.pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!datos.id_equipo) return respuestaError("id_equipo es requerido.", "CAMPO_REQUERIDO");
    if (!datos.nombre_completo || String(datos.nombre_completo).trim() === "") {
      return respuestaError("El nombre del jugador es requerido.", "CAMPO_REQUERIDO");
    }
    if (!datos.genero) return respuestaError("El genero es requerido.", "CAMPO_REQUERIDO");

    // Verificar que el equipo exista
    var equipo = buscarFila("EQUIPOS", "id_equipo", datos.id_equipo);
    if (!equipo) {
      return respuestaError("El equipo '" + datos.id_equipo + "' no existe.", "EQUIPO_NO_ENCONTRADO");
    }

    var grupo   = String(equipo.datos.grupo);
    var deporte = String(equipo.datos.deporte);
    var nombreNuevo = String(datos.nombre_completo).trim().toLowerCase();

    // Verificar nombre duplicado en el MISMO equipo (mismo grupo + deporte)
    var todosJugadores = leerHoja("JUGADORES");
    for (var i = 0; i < todosJugadores.length; i++) {
      var j = todosJugadores[i];
      if (
        String(j.id_equipo) === String(datos.id_equipo) &&
        String(j.nombre_completo).trim().toLowerCase() === nombreNuevo
      ) {
        return respuestaError(
          "'" + datos.nombre_completo + "' ya esta registrado en " + grupo + " - " + deporte + ".",
          "JUGADOR_DUPLICADO"
        );
      }
    }

    // Verificar numero de camiseta unico dentro del mismo equipo
    if (datos.numero_camiseta) {
      for (var k = 0; k < todosJugadores.length; k++) {
        if (
          String(todosJugadores[k].id_equipo) === String(datos.id_equipo) &&
          String(todosJugadores[k].numero_camiseta) === String(datos.numero_camiseta)
        ) {
          return respuestaError(
            "El numero " + datos.numero_camiseta + " ya esta asignado en este equipo.",
            "CAMISETA_DUPLICADA"
          );
        }
      }
    }

    // Registrar jugador
    // Columnas v2: id_jugador, id_equipo, grupo, deporte, nombre_completo,
    //             genero, numero_camiseta, posicion, autoriza_imagen, fecha_registro
    var idJugador = generarId("PJ");
    var fila = [
      idJugador,
      String(datos.id_equipo),
      grupo,
      deporte,
      String(datos.nombre_completo).trim(),
      String(datos.genero).trim(),
      String(datos.numero_camiseta || "").trim(),
      String(datos.posicion || "Jugador").trim(),
      datos.autoriza_imagen !== undefined ? (datos.autoriza_imagen ? "Si" : "No") : "Si",
      fechaHoraActual()
    ];

    agregarFila("JUGADORES", fila);

    log("Data_Inscripcion",
        "Jugador inscrito: " + datos.nombre_completo + " | " + grupo + " - " + deporte, "INFO");

    return respuestaExito(
      { id_jugador: idJugador, grupo: grupo, deporte: deporte },
      "Jugador '" + datos.nombre_completo + "' registrado en " + grupo + " - " + deporte + "."
    );
  } catch (e) {
    log("Data_Inscripcion", "inscribirJugador error: " + e.message, "ERROR");
    return respuestaError("Error inscribiendo jugador: " + e.message);
  }
}

function inscribirJugadoresMasivo(idEquipo, jugadores) {
  try {
    if (!jugadores || jugadores.length === 0) {
      return respuestaError("No se enviaron jugadores.", "SIN_JUGADORES");
    }
    var exitosos = 0;
    var errores  = [];
    for (var i = 0; i < jugadores.length; i++) {
      var j    = jugadores[i];
      j.id_equipo = idEquipo;
      var res  = inscribirJugador(j);
      if (res.ok) exitosos++;
      else errores.push({ jugador: j.nombre_completo || ("Jugador " + (i+1)), error: res.mensaje });
    }
    return respuestaExito(
      { exitosos: exitosos, errores: errores },
      exitosos + " jugador(es) registrado(s)." + (errores.length > 0 ? " " + errores.length + " con error." : "")
    );
  } catch (e) {
    log("Data_Inscripcion", "inscribirJugadoresMasivo error: " + e.message, "ERROR");
    return respuestaError("Error en inscripcion masiva: " + e.message);
  }
}

function eliminarJugador(idJugador, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    var hoja   = getHoja("JUGADORES");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];
    var colId  = encabs.indexOf("id_jugador");
    if (colId === -1) return respuestaError("Columna id_jugador no encontrada.");

    for (var i = datos.length - 1; i >= 1; i--) {
      if (String(datos[i][colId]) === String(idJugador)) {
        var lock = LockService.getScriptLock();
        lock.waitLock(10000);
        try { hoja.deleteRow(i + 1); SpreadsheetApp.flush(); }
        finally { lock.releaseLock(); }
        return respuestaExito(null, "Jugador eliminado.");
      }
    }
    return respuestaError("Jugador no encontrado: " + idJugador, "NO_ENCONTRADO");
  } catch (e) {
    log("Data_Inscripcion", "eliminarJugador error: " + e.message, "ERROR");
    return respuestaError("Error eliminando jugador: " + e.message);
  }
}


// ============================================================
// VERIFICACION DE INSCRIPCION
// ============================================================

/**
 * Verifica el estado de inscripcion de un grupo para UN deporte.
 * Ahora requiere tambien el deporte porque hay 2 equipos por grupo.
 * @param {string} grupo
 * @param {string} deporte - Opcional; si no se pasa retorna todos los equipos del grupo
 * @return {Object}
 */
function verificarInscripcion(grupo, deporte) {
  try {
    // Si se pasa deporte, buscar el equipo especifico
    if (deporte) {
      var idEquipo;
      try { idEquipo = generarIdEquipo(grupo, deporte); }
      catch (e) { return respuestaExito({ inscrito: false, grupo: grupo, deporte: deporte }); }

      var equipoRes = buscarFila("EQUIPOS", "id_equipo", idEquipo);
      if (!equipoRes) {
        return respuestaExito({ inscrito: false, grupo: grupo, deporte: deporte, id_equipo: idEquipo });
      }

      return _buildInfoEquipo(equipoRes.datos);
    }

    // Sin deporte: retornar todos los equipos del grupo
    var equipos = leerHoja("EQUIPOS");
    var resultados = [];
    for (var i = 0; i < equipos.length; i++) {
      if (String(equipos[i].grupo) === String(grupo)) {
        var info = _buildInfoEquipo(equipos[i]);
        if (info.ok) resultados.push(info.datos);
      }
    }

    return respuestaExito(resultados, "Equipos del grupo " + grupo + ": " + resultados.length);
  } catch (e) {
    log("Data_Inscripcion", "verificarInscripcion error: " + e.message, "ERROR");
    return respuestaError("Error verificando inscripcion: " + e.message);
  }
}

/**
 * Construye el objeto de informacion de un equipo inscrito.
 * Funcion interna.
 */
function _buildInfoEquipo(equipo) {
  var jugadores   = leerHoja("JUGADORES");
  var miJugadores = [];
  var tieneMujer  = false;

  for (var i = 0; i < jugadores.length; i++) {
    if (String(jugadores[i].id_equipo) === String(equipo.id_equipo)) {
      miJugadores.push(jugadores[i]);
      var genero = String(jugadores[i].genero).toLowerCase();
      if (genero === "femenino" || genero === "f" || genero === "mujer") tieneMujer = true;
    }
  }

  var paisAsignado = equipo.pais && String(equipo.pais).trim() !== "";

  return respuestaExito({
    inscrito        : true,
    id_equipo       : equipo.id_equipo,
    grupo           : equipo.grupo,
    grado           : equipo.grado,
    nivel           : equipo.nivel,
    deporte         : equipo.deporte,
    nombre_equipo   : equipo.nombre_equipo,
    capitan         : equipo.capitan,
    pais            : equipo.pais,
    bandera         : equipo.bandera_codigo,
    pais_opcionA    : equipo.pais_opcionA,
    pais_opcionB    : equipo.pais_opcionB,
    pais_opcionC    : equipo.pais_opcionC,
    jugadores       : miJugadores.length,
    lista_jugadores : miJugadores,
    tiene_mujer     : tieneMujer,
    pais_asignado   : paisAsignado,
    completo        : miJugadores.length >= 5 && tieneMujer
  });
}

/**
 * Resumen de inscripciones de TODOS los grupos y deportes.
 * Muestra los 2 equipos de cada grupo (uno por deporte).
 * @return {Object}
 */
function getResumenInscripciones() {
  try {
    var todos  = [];
    var grados = ["3","4","5","6","7"];

    for (var g = 0; g < grados.length; g++) {
      var grado    = grados[g];
      var grupos   = CONFIG.GRUPOS[grado];
      var deportes = getNivelGrupo(grupos[0]) === "Primaria"
                     ? CONFIG.DEPORTES.PRIMARIA
                     : CONFIG.DEPORTES.BACHILLERATO;

      for (var i = 0; i < grupos.length; i++) {
        for (var d = 0; d < deportes.length; d++) {
          var res = verificarInscripcion(grupos[i], deportes[d]);
          if (res.ok) {
            // Si no esta inscrito, igualmente incluirlo como pendiente
            if (res.datos && res.datos.inscrito) {
              todos.push(res.datos);
            } else {
              todos.push({
                inscrito      : false,
                grupo         : grupos[i],
                grado         : grado,
                deporte       : deportes[d],
                nivel         : getNivelGrupo(grupos[i]),
                id_equipo     : generarIdEquipo(grupos[i], deportes[d]),
                jugadores     : 0,
                tiene_mujer   : false,
                pais_asignado : false,
                completo      : false
              });
            }
          }
        }
      }
    }

    var inscritos    = 0;
    var sinInscribir = 0;
    var conPais      = 0;
    var sinMujer     = 0;

    for (var k = 0; k < todos.length; k++) {
      if (todos[k].inscrito) {
        inscritos++;
        if (todos[k].pais_asignado) conPais++;
        if (!todos[k].tiene_mujer)  sinMujer++;
      } else {
        sinInscribir++;
      }
    }

    return respuestaExito({
      equipos       : todos,
      total_equipos : todos.length,
      inscritos     : inscritos,
      sin_inscribir : sinInscribir,
      con_pais      : conPais,
      sin_pais      : inscritos - conPais,
      sin_mujer     : sinMujer
    });
  } catch (e) {
    log("Data_Inscripcion", "getResumenInscripciones error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}


// ============================================================
// ASIGNACION DE PAISES CON IA
// ============================================================

function ejecutarAsignacionPaises(pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    var equipos = leerHoja("EQUIPOS");
    if (equipos.length === 0) {
      return respuestaError("No hay equipos inscritos.", "SIN_EQUIPOS");
    }

    var yaAsignados = 0;
    for (var c = 0; c < equipos.length; c++) {
      if (equipos[c].pais && String(equipos[c].pais).trim() !== "") yaAsignados++;
    }
    if (yaAsignados > 0) {
      return respuestaError(
        yaAsignados + " equipo(s) ya tienen pais asignado. " +
        "Usa reasignarPaisManual() para cambios individuales.",
        "PAISES_YA_ASIGNADOS"
      );
    }

    // Construir solicitudes: un pais por grupo (no por equipo de deporte)
    // Porque un grupo representa el mismo pais en ambos deportes
    var solicitudes = [];
    var gruposProcesados = {};

    for (var i = 0; i < equipos.length; i++) {
      var eq = equipos[i];
      // Evitar duplicar solicitudes para el mismo grupo
      if (gruposProcesados[eq.grupo]) continue;
      gruposProcesados[eq.grupo] = true;

      solicitudes.push({
        grupo   : String(eq.grupo),
        deporte : String(eq.deporte),
        opcionA : String(eq.pais_opcionA || "").trim(),
        opcionB : String(eq.pais_opcionB || "").trim(),
        opcionC : String(eq.pais_opcionC || "").trim()
      });
    }

    log("Data_Inscripcion", "Llamando Gemini para " + solicitudes.length + " grupos.", "INFO");

    var asignaciones = asignarPaisesConIA(solicitudes);

    // Guardar el pais asignado en TODOS los equipos del mismo grupo
    var exitosos = 0;
    var errores  = [];

    for (var key in asignaciones) {
      var asig  = asignaciones[key];
      // key puede ser "301_MF" o "301" segun lo que retorne Gemini
      // Extraer el grupo base
      var grupoBase = key.indexOf("_") !== -1 ? key.split("_")[0] : key;

      // Actualizar todos los equipos de ese grupo
      for (var j = 0; j < equipos.length; j++) {
        if (String(equipos[j].grupo) === String(grupoBase)) {
          var res = _actualizarPaisEquipoLocal(equipos[j].id_equipo, asig.pais, asig.bandera || "");
          if (res.ok) exitosos++;
          else errores.push("Error en " + equipos[j].id_equipo + ": " + res.mensaje);
        }
      }
    }

    return respuestaExito(
      { asignaciones: asignaciones, exitosos: exitosos, errores: errores },
      "Asignacion completada: " + exitosos + " equipo(s) con pais."
    );
  } catch (e) {
    log("Data_Inscripcion", "ejecutarAsignacionPaises error: " + e.message, "ERROR");
    return respuestaError("Error en asignacion: " + e.message);
  }
}

function _actualizarPaisEquipoLocal(idEquipo, pais, banderaCode) {
  try {
    var resultado = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    if (!resultado) return respuestaError("Equipo no encontrado: " + idEquipo, "NO_ENCONTRADO");

    var hoja   = getHoja("EQUIPOS");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];
    var colP   = encabs.indexOf("pais") + 1;
    var colB   = encabs.indexOf("bandera_codigo") + 1;

    if (colP === 0 || colB === 0) return respuestaError("Columnas pais/bandera no encontradas.");

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      hoja.getRange(resultado.fila, colP).setValue(pais);
      hoja.getRange(resultado.fila, colB).setValue(banderaCode);
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    return respuestaExito(null, "Pais actualizado: " + pais);
  } catch (e) {
    log("Data_Inscripcion", "_actualizarPaisEquipoLocal error: " + e.message, "ERROR");
    return respuestaError("Error actualizando pais: " + e.message);
  }
}

function reasignarPaisManual(idEquipo, pais, banderaCode, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!idEquipo || !pais) return respuestaError("id_equipo y pais son requeridos.", "DATOS_INCOMPLETOS");

    var eqRes = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    if (!eqRes) return respuestaError("Equipo no encontrado: " + idEquipo, "NO_ENCONTRADO");

    // Verificar que el pais no este en otro grupo
    var equipos = leerHoja("EQUIPOS");
    var grupoActual = eqRes.datos.grupo;
    for (var i = 0; i < equipos.length; i++) {
      if (
        String(equipos[i].grupo).toLowerCase() !== String(grupoActual).toLowerCase() &&
        String(equipos[i].pais).toLowerCase() === String(pais).toLowerCase()
      ) {
        return respuestaError(
          "El pais '" + pais + "' ya esta asignado al grupo " + equipos[i].grupo + ".",
          "PAIS_DUPLICADO"
        );
      }
    }

    // Actualizar TODOS los equipos del mismo grupo con el mismo pais
    var actualizados = 0;
    for (var j = 0; j < equipos.length; j++) {
      if (String(equipos[j].grupo) === String(grupoActual)) {
        _actualizarPaisEquipoLocal(equipos[j].id_equipo, pais, banderaCode || "");
        actualizados++;
      }
    }

    log("Data_Inscripcion", "Pais reasignado manual: Grupo " + grupoActual + " -> " + pais, "INFO");
    return respuestaExito(
      { grupo: grupoActual, pais: pais, equipos_actualizados: actualizados },
      "Pais reasignado: Grupo " + grupoActual + " ahora representa a " + pais + " (" + actualizados + " equipos)."
    );
  } catch (e) {
    log("Data_Inscripcion", "reasignarPaisManual error: " + e.message, "ERROR");
    return respuestaError("Error reasignando pais: " + e.message);
  }
}

function getMapaPaisesAsignados() {
  try {
    var equipos = leerHoja("EQUIPOS");
    var mapa    = {};

    for (var i = 0; i < equipos.length; i++) {
      var eq = equipos[i];
      if (eq.pais && String(eq.pais).trim() !== "") {
        // Agrupar por grupo (no por id_equipo) para el evento de apertura
        // Un grupo revela UN pais (el mismo para ambos deportes)
        if (!mapa[String(eq.grupo)]) {
          mapa[String(eq.grupo)] = {
            pais           : eq.pais,
            bandera_codigo : eq.bandera_codigo,
            grupo          : eq.grupo,
            grado          : eq.grado,
            nivel          : eq.nivel,
            nombre_equipo  : eq.nombre_equipo,
            capitan        : eq.capitan,
            deportes       : []
          };
        }
        mapa[String(eq.grupo)].deportes.push(eq.deporte);
      }
    }

    return respuestaExito(mapa, "Mapa de paises: " + Object.keys(mapa).length + " grupos.");
  } catch (e) {
    log("Data_Inscripcion", "getMapaPaisesAsignados error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}


// ============================================================
// CATALOGO DE PAISES
// ============================================================

function getCatalogoPaises(grado) {
  var catalogo = {
    "Sudamerica": [
      { pais:"Brasil",bandera:"BR" },{ pais:"Argentina",bandera:"AR" },
      { pais:"Colombia",bandera:"CO" },{ pais:"Uruguay",bandera:"UY" },
      { pais:"Chile",bandera:"CL" },{ pais:"Peru",bandera:"PE" },
      { pais:"Ecuador",bandera:"EC" },{ pais:"Bolivia",bandera:"BO" },
      { pais:"Paraguay",bandera:"PY" },{ pais:"Venezuela",bandera:"VE" }
    ],
    "Caribe": [
      { pais:"Cuba",bandera:"CU" },{ pais:"Jamaica",bandera:"JM" },
      { pais:"Trinidad y Tobago",bandera:"TT" },{ pais:"Haiti",bandera:"HT" }
    ],
    "Norteamerica": [
      { pais:"Mexico",bandera:"MX" },{ pais:"Estados Unidos",bandera:"US" },
      { pais:"Canada",bandera:"CA" }
    ],
    "Centroamerica": [
      { pais:"Costa Rica",bandera:"CR" },{ pais:"Panama",bandera:"PA" },
      { pais:"Guatemala",bandera:"GT" },{ pais:"Honduras",bandera:"HN" },
      { pais:"El Salvador",bandera:"SV" },{ pais:"Nicaragua",bandera:"NI" }
    ],
    "Europa Occidental": [
      { pais:"Espana",bandera:"ES" },{ pais:"Francia",bandera:"FR" },
      { pais:"Alemania",bandera:"DE" },{ pais:"Italia",bandera:"IT" },
      { pais:"Portugal",bandera:"PT" },{ pais:"Paises Bajos",bandera:"NL" },
      { pais:"Belgica",bandera:"BE" },{ pais:"Suiza",bandera:"CH" },
      { pais:"Suecia",bandera:"SE" },{ pais:"Dinamarca",bandera:"DK" }
    ],
    "Europa del Este": [
      { pais:"Polonia",bandera:"PL" },{ pais:"Croacia",bandera:"HR" },
      { pais:"Serbia",bandera:"RS" },{ pais:"Ucrania",bandera:"UA" },
      { pais:"Hungria",bandera:"HU" },{ pais:"Rumania",bandera:"RO" },
      { pais:"Chequia",bandera:"CZ" },{ pais:"Eslovenia",bandera:"SI" }
    ],
    "Asia": [
      { pais:"Japon",bandera:"JP" },{ pais:"Corea del Sur",bandera:"KR" },
      { pais:"China",bandera:"CN" },{ pais:"Australia",bandera:"AU" },
      { pais:"Iran",bandera:"IR" },{ pais:"Arabia Saudita",bandera:"SA" },
      { pais:"Qatar",bandera:"QA" },{ pais:"India",bandera:"IN" }
    ],
    "Africa": [
      { pais:"Marruecos",bandera:"MA" },{ pais:"Senegal",bandera:"SN" },
      { pais:"Nigeria",bandera:"NG" },{ pais:"Ghana",bandera:"GH" },
      { pais:"Costa de Marfil",bandera:"CI" },{ pais:"Camerun",bandera:"CM" },
      { pais:"Egipto",bandera:"EG" },{ pais:"Sudafrica",bandera:"ZA" },
      { pais:"Argelia",bandera:"DZ" },{ pais:"Tunisia",bandera:"TN" }
    ],
    "Oceania": [
      { pais:"Nueva Zelanda",bandera:"NZ" }
    ],
    "Medio Oriente": [
      { pais:"Turquia",bandera:"TR" },{ pais:"Israel",bandera:"IL" },
      { pais:"Emiratos Arabes",bandera:"AE" }
    ]
  };

  var continentesPorGrado = {
    "3": ["Sudamerica","Caribe"],
    "4": ["Norteamerica","Centroamerica"],
    "5": ["Europa Occidental"],
    "6": ["Europa del Este","Asia"],
    "7": ["Africa","Oceania","Medio Oriente"]
  };

  if (grado && continentesPorGrado[String(grado)]) {
    var filtrado = {};
    var conts    = continentesPorGrado[String(grado)];
    for (var i = 0; i < conts.length; i++) {
      if (catalogo[conts[i]]) filtrado[conts[i]] = catalogo[conts[i]];
    }
    return respuestaExito(filtrado);
  }

  return respuestaExito(catalogo);
}

function getPaisesOcupados() {
  try {
    var equipos  = leerHoja("EQUIPOS");
    var ocupados = [];
    var grupos   = {};
    for (var i = 0; i < equipos.length; i++) {
      // Un pais ocupa un GRUPO entero, no solo un equipo
      if (equipos[i].pais && String(equipos[i].pais).trim() !== "") {
        if (!grupos[equipos[i].grupo]) {
          grupos[equipos[i].grupo] = true;
          ocupados.push(String(equipos[i].pais).trim());
        }
      }
    }
    return respuestaExito(ocupados);
  } catch (e) {
    return respuestaError("Error obteniendo paises ocupados: " + e.message);
  }
}


// ============================================================
// LECTURA PARA EL MODULO ADMIN — equipo + jugadores completos
// ============================================================

/**
 * Devuelve los datos completos de un equipo ya inscrito
 * junto con su lista de jugadores.
 * Si el equipo no existe, retorna ok:true con inscrito:false
 * para que el frontend sepa que debe crear uno nuevo.
 *
 * @param {string} grupo   - "301", "502", etc.
 * @param {string} deporte - Nombre completo del deporte
 * @param {string} pin     - PIN admin
 * @return {Object}
 */
function getEquipoConJugadores(grupo, deporte, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    if (!grupo || !deporte) {
      return respuestaError("grupo y deporte son requeridos.", "CAMPO_REQUERIDO");
    }

    var idEquipo;
    try {
      idEquipo = generarIdEquipo(String(grupo), String(deporte));
    } catch (eId) {
      return respuestaError("Deporte no reconocido: " + deporte, "DEPORTE_INVALIDO");
    }

    // Buscar equipo
    var equipoRes = buscarFila("EQUIPOS", "id_equipo", idEquipo);

    if (!equipoRes) {
      // Equipo no inscrito aun — retornar estructura vacia para que el admin lo cree
      return respuestaExito({
        inscrito    : false,
        id_equipo   : idEquipo,
        grupo       : String(grupo),
        deporte     : String(deporte),
        jugadores   : []
      }, "Equipo no inscrito aun.");
    }

    var eq = equipoRes.datos;

    // Leer jugadores de este equipo
    var todosJugadores = leerHoja("JUGADORES");
    var miJugadores = [];
    for (var i = 0; i < todosJugadores.length; i++) {
      if (String(todosJugadores[i].id_equipo) === String(idEquipo)) {
        var j = todosJugadores[i];
        miJugadores.push({
          id_jugador      : j.id_jugador      || "",
          nombre_completo : j.nombre_completo || "",
          genero          : j.genero          || "",
          numero_camiseta : j.numero_camiseta || "",
          posicion        : j.posicion        || "Jugador"
        });
      }
    }

    return respuestaExito({
      inscrito        : true,
      id_equipo       : eq.id_equipo,
      grupo           : eq.grupo,
      grado           : eq.grado,
      nivel           : eq.nivel,
      deporte         : eq.deporte,
      nombre_equipo   : eq.nombre_equipo   || "",
      capitan         : eq.capitan         || "",
      color_camiseta  : eq.color_camiseta  || "",
      pais            : eq.pais            || "",
      bandera_codigo  : eq.bandera_codigo  || "",
      pais_asignado   : eq.pais_asignado   || "",
      jugadores       : miJugadores
    });

  } catch (e) {
    log("Data_Inscripcion", "getEquipoConJugadores error: " + e.message, "ERROR");
    return respuestaError("Error cargando equipo: " + e.message);
  }
}


// ============================================================
// DATOS PASO 1 — Lectura directa y robusta de IC_Equipos
// ============================================================
// Función dedicada exclusivamente al Paso 1 (datos del equipo).
// A diferencia de getEquipoConJugadores, esta función:
//   1. No carga jugadores (más rápida: 1 hoja en vez de 2)
//   2. Normaliza los nombres de encabezados antes de leer
//      para tolerar variaciones de mayúsculas/minúsculas/tildes
//   3. Imprime en Log los encabezados reales del Sheet para
//      diagnóstico si algo llega vacío
//
// @param {string} grupo   - "301", "602", etc.
// @param {string} deporte - Nombre completo del deporte
// @param {string} pin     - PIN admin
// @return {Object} { inscrito, capitan, nombre_equipo, color_camiseta, pais, id_equipo }
// ============================================================
function getDatosEquipoPaso1(grupo, deporte) {
  // SIN verificación de PIN: esta función solo lee datos de IC_Equipos
  // para mostrarlos en el paso 1. No modifica nada.
  // Es equivalente a verificarInscripcion() que tampoco requiere PIN.
  try {
    if (!grupo || !deporte) {
      return respuestaError("grupo y deporte son requeridos.", "CAMPO_REQUERIDO");
    }

    var idEquipo;
    try {
      idEquipo = generarIdEquipo(String(grupo), String(deporte));
    } catch (eId) {
      return respuestaError("Deporte no reconocido: " + deporte, "DEPORTE_INVALIDO");
    }

    // Leer hoja directamente con normalización de encabezados
    var hoja  = getHoja("EQUIPOS");
    var datos = hoja.getDataRange().getValues();

    if (!datos || datos.length < 2) {
      return respuestaExito({ inscrito: false, id_equipo: idEquipo });
    }

    // Normalizar encabezados: minúsculas, sin tildes, sin espacios extras
    var encabezadosRaw = datos[0];
    var encabezados    = encabezadosRaw.map(function(h) {
      return String(h || "")
        .toLowerCase()
        .trim()
        .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i")
        .replace(/ó/g,"o").replace(/ú/g,"u").replace(/ñ/g,"n");
    });

    // Log de diagnóstico: muestra encabezados reales del Sheet
    log("Data_Inscripcion",
        "getDatosEquipoPaso1 — Encabezados reales IC_Equipos: [" +
        encabezadosRaw.join(" | ") + "]", "INFO");

    // Mapeo de campos buscando variantes comunes
    function colOf(/* ...nombres */) {
      var nombres = Array.prototype.slice.call(arguments);
      for (var ni = 0; ni < nombres.length; ni++) {
        var idx = encabezados.indexOf(nombres[ni]);
        if (idx !== -1) return idx;
      }
      return -1;
    }

    var COL = {
      id_equipo     : colOf("id_equipo", "idequipo", "id"),
      capitan       : colOf("capitan", "capitan/a", "nombre_capitan", "cap"),
      nombre_equipo : colOf("nombre_equipo", "nombre", "delegacion", "equipo"),
      color_camiseta: colOf("color_camiseta", "color", "camiseta"),
      pais          : colOf("pais", "país", "country"),
      bandera       : colOf("bandera_codigo", "bandera", "flag"),
      deporte       : colOf("deporte", "sport", "discipline")
    };

    // Log de mapeo para diagnóstico
    log("Data_Inscripcion",
        "getDatosEquipoPaso1 — Columnas mapeadas: " +
        "id_equipo=" + COL.id_equipo +
        " capitan=" + COL.capitan +
        " nombre_equipo=" + COL.nombre_equipo +
        " color_camiseta=" + COL.color_camiseta +
        " pais=" + COL.pais, "INFO");

    // Buscar la fila del equipo
    for (var i = 1; i < datos.length; i++) {
      var fila    = datos[i];
      var idFila  = COL.id_equipo >= 0 ? String(fila[COL.id_equipo] || "").trim() : "";

      if (idFila !== idEquipo) continue;

      var capitan       = COL.capitan       >= 0 ? String(fila[COL.capitan]        || "").trim() : "";
      var nombre_equipo = COL.nombre_equipo >= 0 ? String(fila[COL.nombre_equipo]  || "").trim() : "";
      var color_camiseta= COL.color_camiseta>= 0 ? String(fila[COL.color_camiseta] || "").trim() : "";
      var pais          = COL.pais          >= 0 ? String(fila[COL.pais]           || "").trim() : "";
      var bandera       = COL.bandera       >= 0 ? String(fila[COL.bandera]        || "").trim() : "";

      log("Data_Inscripcion",
          "getDatosEquipoPaso1 — Encontrado " + idEquipo +
          " | capitan='" + capitan +
          "' | nombre='" + nombre_equipo +
          "' | color='" + color_camiseta + "'", "INFO");

      return respuestaExito({
        inscrito        : true,
        id_equipo       : idEquipo,
        grupo           : String(grupo),
        deporte         : String(deporte),
        capitan         : capitan,
        nombre_equipo   : nombre_equipo,
        color_camiseta  : color_camiseta,
        pais            : pais,
        bandera_codigo  : bandera
      });
    }

    // No encontrado
    log("Data_Inscripcion",
        "getDatosEquipoPaso1 — No encontrado: " + idEquipo, "INFO");
    return respuestaExito({
      inscrito  : false,
      id_equipo : idEquipo,
      grupo     : String(grupo),
      deporte   : String(deporte)
    });

  } catch (e) {
    log("Data_Inscripcion", "getDatosEquipoPaso1 error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}



/**
 * Guarda la inscripcion completa de un equipo desde el modulo admin.
 * Comportamiento UPSERT:
 *   - Si el equipo NO existe → lo crea.
 *   - Si el equipo YA existe → sobreescribe datos del equipo
 *     y BORRA todos los jugadores anteriores para reemplazarlos.
 *
 * Diferencias con inscripcionCompleta():
 *   - No exige pais_opcionA (el pais ya esta pre-asignado).
 *   - No bloquea por EQUIPO_DUPLICADO.
 *   - Sobreescribe en lugar de rechazar duplicados.
 *
 * @param {Object} payload - { equipo: {...}, jugadores: [...], pin: "..." }
 * @return {Object}
 */
function guardarInscripcionAdmin(payload) {
  try {
    if (!payload || !payload.equipo) {
      return respuestaError("Payload invalido: se requiere 'equipo'.", "PAYLOAD_INVALIDO");
    }

    var pin              = payload.pin || payload.equipo.pin || "";
    var esPendiente_rbac = payload.equipo.pendiente_aprobacion === true;
    var rolOrigen        = String(payload.equipo.modificado_por_rol || "admin");
    var grupoCap         = String(payload.equipo.grupo_capitan      || "").trim();

    // ── RBAC: Admin o Capitán autorizado ──────────────────────────────
    var auth = verificarPIN(pin);
    if (!auth.esAdmin) {
      // Permitir solo si viene marcado como capitán y el grupo coincide
      if (!esPendiente_rbac || rolOrigen !== "capitan" || !grupoCap) {
        return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
      }
      // El grupo del payload debe pertenecer al capitán
      var grupoPay = String(payload.equipo.grupo || "").trim();
      if (grupoPay.indexOf(grupoCap) !== 0 && grupoPay !== grupoCap) {
        return respuestaError(
          "Acceso denegado: el capitán del grupo " + grupoCap +
          " no puede modificar el grupo " + grupoPay + ".",
          "GRUPO_NO_AUTORIZADO"
        );
      }
    }

    var grupo   = String(payload.equipo.grupo   || "").trim();
    var deporte = String(payload.equipo.deporte || "").trim();

    if (!grupo)   return respuestaError("Campo 'grupo' requerido.",   "CAMPO_REQUERIDO");
    if (!deporte) return respuestaError("Campo 'deporte' requerido.", "CAMPO_REQUERIDO");

    var capitan = String(payload.equipo.capitan || "").trim();
    if (!capitan) return respuestaError("Campo 'capitan' requerido.", "CAMPO_REQUERIDO");

    if (!grupoValido(grupo)) {
      return respuestaError("Grupo no valido: " + grupo, "GRUPO_INVALIDO");
    }
    if (!deporteValidoParaGrupo(deporte, grupo)) {
      return respuestaError("Deporte no valido para el grupo " + grupo + ": " + deporte, "DEPORTE_INVALIDO");
    }

    var idEquipo = generarIdEquipo(grupo, deporte);
    var ahora    = fechaHoraActual();
    var grado    = getGradoGrupo(grupo);
    var nivel    = getNivelGrupo(grupo);
    var nombre   = String(payload.equipo.nombre_equipo  || "Delegacion " + grupo).trim();
    var color    = String(payload.equipo.color_camiseta || "").trim();

    // ── FIX 1: Preservar pais y bandera si ya fueron asignados ──
    // Si el payload trae pais_asignado, usarlo. Si no, conservar el que
    // ya existe en el Sheet para no borrar asignaciones previas.
    var existente = buscarFila("EQUIPOS", "id_equipo", idEquipo);
    var paisActual    = existente ? String(existente.datos.pais           || "") : "";
    var banderaActual = existente ? String(existente.datos.bandera_codigo || "") : "";
    var paisAsi = String(payload.equipo.pais_asignado || "").trim() || paisActual;
    var bandAsi = String(payload.equipo.bandera_codigo || "").trim() || banderaActual;

    // id_equipo, grupo, grado, nivel, deporte, nombre_equipo,
    // pais, bandera_codigo, color_camiseta, capitan,
    // fecha_inscripcion, pais_opcionA, pais_opcionB, pais_opcionC, estado
    var filaEquipo = [
      idEquipo, grupo, grado, nivel, deporte,
      nombre,
      paisAsi, bandAsi,      // ← preservados correctamente
      color, capitan,
      ahora,
      "", "", "",
      esPendiente_rbac ? "pendiente_aprobacion" : "inscrito",  // ← estado RBAC
      esPendiente_rbac ? rolOrigen : "",                        // ← modificado_por_rol
      esPendiente_rbac ? grupoCap  : ""                         // ← grupo_capitan
    ];

    // ── Preparar filas de jugadores ANTES de abrir el lock ──
    var jugadores  = payload.jugadores || [];
    var filasJug   = [];
    var errores    = [];
    var tieneMujer = false;

    for (var i = 0; i < jugadores.length; i++) {
      var jug = jugadores[i];
      var nombreJug = String(jug.nombre_completo || "").trim();
      if (!nombreJug || nombreJug.toUpperCase().indexOf("TODO") !== -1) {
        errores.push({ num: i+1, error: "Nombre vacio o pendiente, omitido." });
        continue;
      }
      var genero = String(jug.genero || "Masculino").trim();
      if (genero.toLowerCase() === "femenino" || genero === "f") tieneMujer = true;

      // ── FIX 3: Preservar id_jugador si ya existía ──
      // El frontend debe enviar id_jugador cuando carga jugadores desde BD.
      // Si lo trae, lo reutilizamos para no romper referencias en Goleadores/Sanciones.
      var idJug = (jug.id_jugador && String(jug.id_jugador).trim())
                  ? String(jug.id_jugador).trim()
                  : generarId("PJ");

      filasJug.push([
        idJug, idEquipo, grupo, deporte,
        nombreJug, genero,
        String(jug.numero_camiseta || "").trim(),
        String(jug.posicion || "Jugador").trim(),
        "Si",
        ahora
      ]);
    }

    // ── FIX 2: Borrar anteriores + insertar nuevos en UN SOLO LOCK ──
    // Elimina la ventana de tiempo entre borrado e inserción donde
    // una segunda petición podría dejar el equipo sin jugadores.
    var exitosos = 0;
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var hojaEq  = getHoja("EQUIPOS");
      var hojaJug = getHoja("JUGADORES");

      // Equipo: sobreescribir o crear
      if (existente) {
        hojaEq.getRange(existente.fila, 1, 1, filaEquipo.length).setValues([filaEquipo]);
      } else {
        hojaEq.getRange(hojaEq.getLastRow() + 1, 1, 1, filaEquipo.length).setValues([filaEquipo]);
      }

      // Jugadores: borrar todos los anteriores de este equipo
      var datosJug = hojaJug.getDataRange().getValues();
      var encJug   = datosJug[0];
      var colIdEq  = encJug.indexOf("id_equipo");

      for (var r = datosJug.length - 1; r >= 1; r--) {
        if (String(datosJug[r][colIdEq]) === String(idEquipo)) {
          hojaJug.deleteRow(r + 1);
        }
      }

      // Jugadores: insertar todos de una vez en lote (1 API call, no N)
      if (filasJug.length > 0) {
        var numCols = filasJug[0].length;
        var primeraLibre = hojaJug.getLastRow() + 1;
        hojaJug.getRange(primeraLibre, 1, filasJug.length, numCols).setValues(filasJug);
        exitosos = filasJug.length;
      }

      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    // Validar regla de género
    var esFutsal    = deporte.indexOf("Futsal") !== -1;
    var alertaMujer = "";
    var mujeres = jugadores.filter(function(j){
      return String(j.genero || "").toLowerCase() === "femenino";
    }).length;
    if (esFutsal && mujeres < 2) {
      alertaMujer = "ATENCION: Solo " + mujeres + " jugadora(s). Futsal requiere minimo 2 inscritas.";
    }

    log("Data_Inscripcion",
      "guardarInscripcionAdmin: " + idEquipo +
      " | " + exitosos + " jugadores (lote)" +
      " | pais=" + (paisAsi || "—") +
      (existente ? " [actualizado]" : " [nuevo]"), "INFO");

    return respuestaExito({
      id_equipo       : idEquipo,
      grupo           : grupo,
      deporte         : deporte,
      accion          : existente ? "actualizado" : "creado",
      jugadores_ok    : exitosos,
      jugadores_error : errores.length,
      errores         : errores,
      alerta_mujer    : alertaMujer
    }, "Inscripcion " + (existente ? "actualizada" : "creada") + ". Equipo: " + idEquipo + " | Jugadores: " + exitosos + ".");

  } catch (e) {
    log("Data_Inscripcion", "guardarInscripcionAdmin error: " + e.message, "ERROR");
    return respuestaError("Error guardando inscripcion: " + e.message);
  }
}


// ============================================================
// INSCRIPCION COMPLETA (equipo + jugadores en un solo paso)
// ============================================================

function inscripcionCompleta(payload) {
  try {
    if (!payload || !payload.equipo) {
      return respuestaError("Payload invalido: se requiere 'equipo'.", "PAYLOAD_INVALIDO");
    }

    var resEquipo = inscribirEquipo(payload.equipo);
    if (!resEquipo.ok) return resEquipo;

    var idEquipo = resEquipo.datos.id_equipo;
    var resultJugadores = { datos: { exitosos: 0, errores: [] }, ok: true };

    if (payload.jugadores && payload.jugadores.length > 0) {
      resultJugadores = inscribirJugadoresMasivo(idEquipo, payload.jugadores);
    }

    // ── CORRECCIÓN AUDITORÍA: Validación de género BLOQUEANTE ──
    // Para Futsal y Mini-Futsal se requieren mínimo 2 jugadoras inscritas.
    // Si no se cumple, la inscripción es rechazada (no solo advertencia).
    var deporte     = String(payload.equipo.deporte || "");
    var esFutsal    = deporte.indexOf("Futsal") !== -1;
    var MIN_MUJERES = 2;

    if (esFutsal && payload.jugadores && payload.jugadores.length > 0) {
      var mujeres = 0;
      for (var i = 0; i < payload.jugadores.length; i++) {
        var gen = String(payload.jugadores[i].genero || "").toLowerCase();
        if (gen === "femenino" || gen === "f" || gen === "mujer") mujeres++;
      }
      if (mujeres < MIN_MUJERES) {
        // Revertir: eliminar el equipo recién creado para no dejar datos huerfanos
        try {
          var hoja   = getHoja("EQUIPOS");
          var datos  = hoja.getDataRange().getValues();
          var encabs = datos[0];
          var colId  = encabs.indexOf("id_equipo");
          for (var r = datos.length - 1; r >= 1; r--) {
            if (String(datos[r][colId]) === String(idEquipo)) {
              hoja.deleteRow(r + 1);
              break;
            }
          }
          SpreadsheetApp.flush();
        } catch (eRev) {
          log("Data_Inscripcion", "Revert equipo warning: " + eRev.message, "WARN");
        }

        return respuestaError(
          "Inscripcion rechazada para " + deporte + ": se registraron " + mujeres +
          " jugadora(s) pero se requieren MINIMO " + MIN_MUJERES + ". " +
          "Agrega al menos " + (MIN_MUJERES - mujeres) + " jugadora(s) mas para poder inscribirse.",
          "GENERO_INSUFICIENTE"
        );
      }
    }

    var verificacion = _buildInfoEquipo(
      buscarFila("EQUIPOS","id_equipo", idEquipo).datos
    );
    var alertaMujer = "";
    if (verificacion.ok && !verificacion.datos.tiene_mujer) {
      alertaMujer = " ATENCION: No hay jugadoras registradas. Se requiere min 1 mujer en cancha.";
    }

    var jugOk  = resultJugadores.datos ? resultJugadores.datos.exitosos : 0;
    var jugErr = resultJugadores.datos ? resultJugadores.datos.errores  : [];

    return respuestaExito(
      {
        id_equipo         : idEquipo,
        grupo             : payload.equipo.grupo,
        deporte           : payload.equipo.deporte,
        grado             : resEquipo.datos.grado,
        nivel             : resEquipo.datos.nivel,
        jugadores_ok      : jugOk,
        jugadores_errores : jugErr,
        tiene_mujer       : verificacion.ok && verificacion.datos.tiene_mujer,
        alerta_mujer      : alertaMujer
      },
      "Inscripcion completada. Equipo: " + payload.equipo.grupo + " - " + payload.equipo.deporte +
      " | Jugadores: " + jugOk + "." + alertaMujer
    );
  } catch (e) {
    log("Data_Inscripcion", "inscripcionCompleta error: " + e.message, "ERROR");
    return respuestaError("Error en inscripcion completa: " + e.message);
  }
}

// ============================================================
// CARGA INICIAL DE PLANILLAS → IC_Equipos + IC_Jugadores
// ============================================================
// AUTOSUFICIENTE: crea hojas si no existen, corrige encabezados,
// limpia datos incorrectos de ejecuciones anteriores y recarga todo.
// INSTRUCCIÓN: Ejecutar SOLO cargarInscripcionesDesdeData()
// ============================================================

var _ENCABEZADOS_EQUIPOS = [
  "id_equipo","grupo","grado","nivel","deporte",
  "nombre_equipo","pais","bandera_codigo","color_camiseta","capitan",
  "fecha_inscripcion","pais_opcionA","pais_opcionB","pais_opcionC","estado"
];

var _ENCABEZADOS_JUGADORES = [
  "id_jugador","id_equipo","grupo","deporte","nombre_completo","genero",
  "numero_camiseta","posicion","autoriza_imagen","fecha_registro"
];

var INSCRIPCIONES_MANUALES = [

  // GRADO 3 — PRIMARIA
  { grupo:"301", deporte:"Mini Voleibol", nombre_equipo:"", capitan:"", color_camiseta:"", pais_asignado:"Francia",
    jugadores:[] },

  { grupo:"301", deporte:"Mini Futsal", nombre_equipo:"", capitan:"Medison Montoya", color_camiseta:"", pais_asignado:"Francia",
    jugadores:[
      {nombre_completo:"Medison Montoya",       genero:"Masculino", numero_camiseta:"",  posicion:"Jugador"},
      {nombre_completo:"Ian Gamez Mayo",         genero:"Masculino", numero_camiseta:"",  posicion:"Jugador"},
      {nombre_completo:"Jacobs Morales Purlios", genero:"Masculino", numero_camiseta:"",  posicion:"Jugador"},
      {nombre_completo:"Luciana Duque",          genero:"Femenino",  numero_camiseta:"",  posicion:"Portero"},
      {nombre_completo:"Jeronimo Rivera",        genero:"Masculino", numero_camiseta:"",  posicion:"Jugador"},
      {nombre_completo:"Emily Hernandez",        genero:"Femenino",  numero_camiseta:"",  posicion:"Jugador"},
      {nombre_completo:"Thiago Hernandez",       genero:"Masculino", numero_camiseta:"",  posicion:"Portero"},
      {nombre_completo:"Emiliano Vega",          genero:"Masculino", numero_camiseta:"",  posicion:"Jugador"},
      {nombre_completo:"Cristopher Montoya",     genero:"Masculino", numero_camiseta:"",  posicion:"Jugador"},
      {nombre_completo:"Jeronimer Zapata",       genero:"Masculino", numero_camiseta:"",  posicion:"Jugador"},
      {nombre_completo:"Juan David Ocampo",      genero:"Masculino", numero_camiseta:"",  posicion:"Jugador"}
    ]},

  { grupo:"302", deporte:"Mini Voleibol", nombre_equipo:"", capitan:"", color_camiseta:"", pais_asignado:"Haiti",
    jugadores:[
      {nombre_completo:"Thiago Corro",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Jeronimo Morin",      genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Jose Isaac Machado",  genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Salome Gonzalez",     genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Alejandro Caraballo", genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Antonella Aguirre",   genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Isabela Lezcano",     genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Sofia Moreno",        genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Luciana Salazar",     genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"303", deporte:"Mini Voleibol", nombre_equipo:"", capitan:"", color_camiseta:"", pais_asignado:"Uruguay",
    jugadores:[
      {nombre_completo:"Ilma Sofia Caseres",   genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Abigail Barrero",      genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Luciano Orozco",       genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Matias Moreno",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Thiago Gomez",         genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Juan Diego Londono",   genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Jess G Espejo",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Shainy Ocampo",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Matias T Velez",       genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Thiago A Orango",      genero:"Masculino", numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"303", deporte:"Mini Futsal", nombre_equipo:"", capitan:"", color_camiseta:"", pais_asignado:"Uruguay",
    jugadores:[
      {nombre_completo:"Thiago A Velez T",     genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Martin Felix",         genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Salome Herrera",       genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Isabela Estrada",      genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Salome Morena",        genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Valeria Rios Velez",   genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Luciana Jaramillo B",  genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Sharon Patino Parra",  genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Matias Rojas",         genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Salome Marmolejo",     genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"304", deporte:"Mini Futsal", nombre_equipo:"", capitan:"", color_camiseta:"", pais_asignado:"Salvador",
    jugadores:[] },

  // GRADO 4 — PRIMARIA
  { grupo:"401", deporte:"Mini Voleibol", nombre_equipo:"", capitan:"Sara Sofia Amarilla", color_camiseta:"Blanco", pais_asignado:"Espana",
    jugadores:[
      {nombre_completo:"Sara Sofia Amarilla",  genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Sara Garcia",          genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Moira Fernando Gomez", genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Marangel Acosta",      genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Valentina Villegas",   genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"401", deporte:"Mini Futsal", nombre_equipo:"", capitan:"Ismael Espinal", color_camiseta:"Roja", pais_asignado:"Espana",
    jugadores:[
      {nombre_completo:"Manuel Espinal",         genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Juan Jose Espinal",      genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Juan Antonio Rodriguez", genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Jason Manuel Buitrago",  genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Maximiliano Giron Q",    genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Sara Sofia Anallo",      genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Maria Fernanda Gomez",   genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"402", deporte:"Mini Voleibol", nombre_equipo:"", capitan:"", color_camiseta:"", pais_asignado:"Paraguay",
    jugadores:[] },

  { grupo:"403", deporte:"Mini Futsal", nombre_equipo:"", capitan:"", color_camiseta:"", pais_asignado:"Canada",
    jugadores:[] },

  { grupo:"403", deporte:"Mini Voleibol", nombre_equipo:"Los Grandes", capitan:"", color_camiseta:"", pais_asignado:"Canada",
    jugadores:[
      {nombre_completo:"Nicole Valeria Calderon", genero:"Femenino", numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"404", deporte:"Mini Voleibol", nombre_equipo:"", capitan:"Emanuel Gomez", color_camiseta:"Blanca", pais_asignado:"Colombia",
    jugadores:[
      {nombre_completo:"Isabela Serna",  genero:"Femenino",  numero_camiseta:"2",  posicion:"Jugador"},
      {nombre_completo:"Gabriela Serna", genero:"Femenino",  numero_camiseta:"4",  posicion:"Jugador"},
      {nombre_completo:"Emanuel Gomez",  genero:"Masculino", numero_camiseta:"11", posicion:"Capitan"}
    ]},

  { grupo:"404", deporte:"Mini Futsal", nombre_equipo:"Tommy FC", capitan:"Tommy Coronel Castillo", color_camiseta:"", pais_asignado:"Colombia",
    jugadores:[
      {nombre_completo:"Jeronimo Torres",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Nicolas Agente",         genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Elbert Campos",          genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Salome Contreras",       genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Nicolas Castaneda",      genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Jean Pierre Lermos",     genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Jhon Will Botero",       genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Tommy Coronel Castillo", genero:"Masculino", numero_camiseta:"", posicion:"Capitan"}
    ]},

  // GRADO 5 — PRIMARIA
  { grupo:"501", deporte:"Futsal", nombre_equipo:"", capitan:"Jeronimo Najdo", color_camiseta:"Amarilla", pais_asignado:"Ecuador",
    jugadores:[
      {nombre_completo:"Jax Alejandro Galindo",    genero:"Masculino", numero_camiseta:"3",  posicion:"Jugador"},
      {nombre_completo:"Sebastian Uribe S",        genero:"Masculino", numero_camiseta:"4",  posicion:"Jugador"},
      {nombre_completo:"Mathias Haro G",           genero:"Masculino", numero_camiseta:"5",  posicion:"Jugador"},
      {nombre_completo:"Cristopher Jose Lopez G",  genero:"Masculino", numero_camiseta:"6",  posicion:"Portero"},
      {nombre_completo:"Jacobo Copin Correa",      genero:"Masculino", numero_camiseta:"1",  posicion:"Jugador"},
      {nombre_completo:"Juan Sebastian Mejia R",   genero:"Masculino", numero_camiseta:"9",  posicion:"Jugador"}
    ]},

  { grupo:"501", deporte:"Voleibol", nombre_equipo:"", capitan:"Maria Jose Lizalda Lorch", color_camiseta:"Amarilla", pais_asignado:"Ecuador",
    jugadores:[
      {nombre_completo:"Maria Jose Lizalda Lorch", genero:"Femenino", numero_camiseta:"1",  posicion:"Capitan"},
      {nombre_completo:"Dulce Maria Galindo H",    genero:"Femenino", numero_camiseta:"2",  posicion:"Jugador"},
      {nombre_completo:"Nicole Gomez Piedra",      genero:"Femenino", numero_camiseta:"3",  posicion:"Jugador"},
      {nombre_completo:"Gabriela Maria Gonzalez",  genero:"Femenino", numero_camiseta:"4",  posicion:"Jugador"},
      {nombre_completo:"Maura Sloma Gonzalez L",   genero:"Femenino", numero_camiseta:"5",  posicion:"Jugador"},
      {nombre_completo:"Dany Gabriela Hoyos G",    genero:"Femenino", numero_camiseta:"6",  posicion:"Jugador"},
      {nombre_completo:"Zara Horn Rivera",         genero:"Femenino", numero_camiseta:"7",  posicion:"Jugador"},
      {nombre_completo:"Antonella Montoya R",      genero:"Femenino", numero_camiseta:"8",  posicion:"Jugador"},
      {nombre_completo:"Marlino Perez Angarita",   genero:"Femenino", numero_camiseta:"9",  posicion:"Jugador"},
      {nombre_completo:"Luciana Valderrama S",     genero:"Femenino", numero_camiseta:"10", posicion:"Jugador"}
    ]},

  { grupo:"502", deporte:"Voleibol", nombre_equipo:"", capitan:"Laurent Sofia Castablanco", color_camiseta:"Verde rojo", pais_asignado:"Portugal",
    jugadores:[
      {nombre_completo:"Tiffany Guevara",      genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Melany Ballesteros",   genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Antonio Maron",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Anthonella Restrepo",  genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Barbara Victoria",     genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Geronimo Garcia",      genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Cristopher Maldonado", genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Mateas Aponte",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Laurent Sofia C",      genero:"Femenino",  numero_camiseta:"", posicion:"Capitan"},
      {nombre_completo:"Mateas Montermoso",    genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Melany Orola",         genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Simon Bustos",         genero:"Masculino", numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"502", deporte:"Futsal", nombre_equipo:"", capitan:"Geronimo Garcia", color_camiseta:"Verde rojo", pais_asignado:"Portugal",
    jugadores:[
      {nombre_completo:"Geronimo Garcia",      genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Juan Andres B",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Simon Bustos",         genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Cristopher Maldonado", genero:"Masculino", numero_camiseta:"", posicion:"Portero"},
      {nombre_completo:"Matias Montermoso",    genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Lucia Carvallo",       genero:"Femenino",  numero_camiseta:"", posicion:"Portero"},
      {nombre_completo:"Matias Aponte",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Alejandro Zapata",     genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Juan Jose Baquero",    genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Juan Jose Valencia",   genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Esteban Ordoñez",      genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Jared Giraldo Lopez",  genero:"Masculino", numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"503", deporte:"Futsal", nombre_equipo:"Los Alemanes", capitan:"David Alejandro F", color_camiseta:"Blanco y roja", pais_asignado:"Alemania",
    jugadores:[
      {nombre_completo:"Samuel Penilo",        genero:"Masculino", numero_camiseta:"", posicion:"Portero"},
      {nombre_completo:"Jeronimo Nieto",       genero:"Masculino", numero_camiseta:"", posicion:"Portero"},
      {nombre_completo:"Emanuel Ocampo Mena",  genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"David Alejandro F",    genero:"Masculino", numero_camiseta:"", posicion:"Capitan"},
      {nombre_completo:"Matias Murillo C",     genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Juan Manuel Restrepo", genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Nicolas Oyola",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Matias Morales",       genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Jeronimo Inza",        genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Luciana Garcia",       genero:"Femenino",  numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"504", deporte:"Voleibol", nombre_equipo:"Mexico", capitan:"Matias Garcia L", color_camiseta:"Azul y negro", pais_asignado:"Mexico",
    jugadores:[
      {nombre_completo:"Mathias Garcia L",     genero:"Masculino", numero_camiseta:"10", posicion:"Jugador"},
      {nombre_completo:"Sofia Garcia Y",       genero:"Femenino",  numero_camiseta:"6",  posicion:"Jugador"},
      {nombre_completo:"Demay Largo Z",        genero:"Femenino",  numero_camiseta:"7",  posicion:"Jugador"},
      {nombre_completo:"Juliana Gil M",        genero:"Femenino",  numero_camiseta:"2",  posicion:"Jugador"},
      {nombre_completo:"Gabriela Caceres",     genero:"Femenino",  numero_camiseta:"1",  posicion:"Jugador"}
    ]},

  { grupo:"504", deporte:"Futsal", nombre_equipo:"Mexico", capitan:"Emanuel Guzman Hidalgo", color_camiseta:"Azul y negro", pais_asignado:"Mexico",
    jugadores:[
      {nombre_completo:"Emanuel Guzman",          genero:"Masculino", numero_camiseta:"9",  posicion:"Jugador"},
      {nombre_completo:"Constantino Balcells L",  genero:"Masculino", numero_camiseta:"28", posicion:"Jugador"},
      {nombre_completo:"Juan Jose Castano G",     genero:"Masculino", numero_camiseta:"5",  posicion:"Jugador"},
      {nombre_completo:"Gabriela Carreon",        genero:"Femenino",  numero_camiseta:"23", posicion:"Jugador"},
      {nombre_completo:"Hernandez Gonzalez L",    genero:"Masculino", numero_camiseta:"1",  posicion:"Jugador"}
    ]},

  // GRADO 6 — BACHILLERATO
  { grupo:"601", deporte:"Futsal", nombre_equipo:"", capitan:"Miguel Enrique Garcia", color_camiseta:"Azul con blanco", pais_asignado:"Argentina",
    jugadores:[
      {nombre_completo:"Miguel Enrique Garcia",   genero:"Masculino", numero_camiseta:"10", posicion:"Jugador"},
      {nombre_completo:"Anthony Escobar Wiloche", genero:"Masculino", numero_camiseta:"1",  posicion:"Portero"},
      {nombre_completo:"Mathias Reina",           genero:"Masculino", numero_camiseta:"11", posicion:"Jugador"},
      {nombre_completo:"Alexandra Bermudez",      genero:"Femenino",  numero_camiseta:"4",  posicion:"Jugador"},
      {nombre_completo:"Samuel Rios Zuluaga",     genero:"Masculino", numero_camiseta:"7",  posicion:"Jugador"},
      {nombre_completo:"Samuel Acevedo",          genero:"Masculino", numero_camiseta:"17", posicion:"Jugador"},
      {nombre_completo:"Santiago Castillo",       genero:"Masculino", numero_camiseta:"9",  posicion:"Jugador"},
      {nombre_completo:"Juan Camilo",             genero:"Masculino", numero_camiseta:"5",  posicion:"Jugador"},
      {nombre_completo:"Dylan Restrepo",          genero:"Masculino", numero_camiseta:"77", posicion:"Jugador"},
      {nombre_completo:"Estella Cardona",         genero:"Femenino",  numero_camiseta:"2",  posicion:"Jugador"}
    ]},

  { grupo:"601", deporte:"Voleibol", nombre_equipo:"", capitan:"Karen Cañaveral", color_camiseta:"Azul", pais_asignado:"Argentina",
    jugadores:[
      {nombre_completo:"Karen Cañaveral",        genero:"Femenino",  numero_camiseta:"12", posicion:"Capitan"},
      {nombre_completo:"Luciana Ceballos",       genero:"Femenino",  numero_camiseta:"10", posicion:"Jugador"},
      {nombre_completo:"Emily Restrepo",         genero:"Femenino",  numero_camiseta:"27", posicion:"Jugador"},
      {nombre_completo:"Samuel Acevedo Mera",    genero:"Masculino", numero_camiseta:"17", posicion:"Jugador"},
      {nombre_completo:"Anthony Escobar Wiloch", genero:"Masculino", numero_camiseta:"1",  posicion:"Jugador"},
      {nombre_completo:"Miguel Enrique Garcia",  genero:"Masculino", numero_camiseta:"11", posicion:"Jugador"},
      {nombre_completo:"Dylan Restrepo",         genero:"Masculino", numero_camiseta:"4",  posicion:"Jugador"},
      {nombre_completo:"Mathias Reina",          genero:"Masculino", numero_camiseta:"19", posicion:"Jugador"},
      {nombre_completo:"Salome Piedrahita",      genero:"Femenino",  numero_camiseta:"11", posicion:"Jugador"}
    ]},

  { grupo:"602", deporte:"Futsal", nombre_equipo:"Los Brazucas FC", capitan:"", color_camiseta:"Vino y amarilla", pais_asignado:"Brasil",
    jugadores:[
      {nombre_completo:"Santiago Jimenez", genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Samuel Ramirez",   genero:"Masculino", numero_camiseta:"", posicion:"Jugador"},
      {nombre_completo:"Wilson Jaen",      genero:"Masculino", numero_camiseta:"", posicion:"Jugador"}
    ]},

  { grupo:"603", deporte:"Voleibol", nombre_equipo:"Galaxias de DC", capitan:"", color_camiseta:"Blanca", pais_asignado:"EEUU",
    jugadores:[
      {nombre_completo:"Fred Santiago",       genero:"Masculino", numero_camiseta:"5",  posicion:"Jugador"},
      {nombre_completo:"Ruth Londono",        genero:"Femenino",  numero_camiseta:"12", posicion:"Jugador"},
      {nombre_completo:"Samuel Cordero",      genero:"Masculino", numero_camiseta:"10", posicion:"Jugador"},
      {nombre_completo:"Luciana Ligia Flaez", genero:"Femenino",  numero_camiseta:"2",  posicion:"Jugador"},
      {nombre_completo:"Sara Cordoba",        genero:"Femenino",  numero_camiseta:"3",  posicion:"Jugador"},
      {nombre_completo:"Jacobo Giraldo",      genero:"Masculino", numero_camiseta:"28", posicion:"Jugador"},
      {nombre_completo:"Carlos Renteria",     genero:"Masculino", numero_camiseta:"14", posicion:"Jugador"}
    ]},

  { grupo:"603", deporte:"Futsal", nombre_equipo:"Estados Unidos", capitan:"Juan Esteban Galvis", color_camiseta:"Blanca", pais_asignado:"EEUU",
    jugadores:[
      {nombre_completo:"Juan Esteban Galvis",  genero:"Masculino", numero_camiseta:"10", posicion:"Jugador"},
      {nombre_completo:"Samuel Cardenas",      genero:"Masculino", numero_camiseta:"7",  posicion:"Jugador"},
      {nombre_completo:"Nicolas Carrasquilla", genero:"Masculino", numero_camiseta:"6",  posicion:"Jugador"},
      {nombre_completo:"David Jaramillo",      genero:"Masculino", numero_camiseta:"9",  posicion:"Jugador"},
      {nombre_completo:"Emanuel Salazar",      genero:"Masculino", numero_camiseta:"19", posicion:"Jugador"},
      {nombre_completo:"Emanuel Arenas",       genero:"Masculino", numero_camiseta:"1",  posicion:"Portero"},
      {nombre_completo:"Abel Santiago Naya",   genero:"Masculino", numero_camiseta:"8",  posicion:"Jugador"},
      {nombre_completo:"Samuel Cardona",       genero:"Masculino", numero_camiseta:"21", posicion:"Jugador"}
    ]},

  // GRADO 7 — BACHILLERATO
  { grupo:"702", deporte:"Futsal", nombre_equipo:"Brazil", capitan:"Santiago Cuero", color_camiseta:"Blanca", pais_asignado:"Rumania",
    jugadores:[
      {nombre_completo:"Santiago Cuero Lopez", genero:"Masculino", numero_camiseta:"17", posicion:"Jugador"},
      {nombre_completo:"Matias Castro Correa", genero:"Masculino", numero_camiseta:"10", posicion:"Jugador"},
      {nombre_completo:"Samuel Guerrero",      genero:"Masculino", numero_camiseta:"14", posicion:"Jugador"},
      {nombre_completo:"Juan David Martinez",  genero:"Masculino", numero_camiseta:"11", posicion:"Jugador"},
      {nombre_completo:"Kalemi Alzate Torres", genero:"Femenino",  numero_camiseta:"7",  posicion:"Jugador"}
    ]},

  { grupo:"703", deporte:"Futsal", nombre_equipo:"Seleccion de Venezuela", capitan:"Maximiliano Zapata V", color_camiseta:"Vino tinto", pais_asignado:"Venezuela",
    jugadores:[
      {nombre_completo:"Juan Manuel Cruz Paz",   genero:"Masculino", numero_camiseta:"2",  posicion:"Jugador"},
      {nombre_completo:"Arith David Sanchez",    genero:"Masculino", numero_camiseta:"10", posicion:"Jugador"},
      {nombre_completo:"Andrew Samuel Orozco",   genero:"Masculino", numero_camiseta:"4",  posicion:"Jugador"},
      {nombre_completo:"Maximiliano Zapata V",   genero:"Masculino", numero_camiseta:"8",  posicion:"Capitan"},
      {nombre_completo:"Elmo Bedoya Betancourt", genero:"Masculino", numero_camiseta:"7",  posicion:"Jugador"},
      {nombre_completo:"Isabella Rodriguez",     genero:"Femenino",  numero_camiseta:"3",  posicion:"Jugador"},
      {nombre_completo:"Cristopher Velez G",     genero:"Masculino", numero_camiseta:"1",  posicion:"Portero"}
    ]},

  { grupo:"703", deporte:"Voleibol", nombre_equipo:"Volei Club Venezuela", capitan:"Manuela Novoa", color_camiseta:"Vino tinto", pais_asignado:"Venezuela",
    jugadores:[
      {nombre_completo:"Manuela Novoa",         genero:"Femenino",  numero_camiseta:"1",  posicion:"Capitan"},
      {nombre_completo:"Isabella Rodriguez G",  genero:"Femenino",  numero_camiseta:"20", posicion:"Jugador"},
      {nombre_completo:"Allison Matta",         genero:"Femenino",  numero_camiseta:"4",  posicion:"Jugador"},
      {nombre_completo:"Juan Daniel Mazo",      genero:"Masculino", numero_camiseta:"6",  posicion:"Jugador"},
      {nombre_completo:"Nicolas Santiago B",    genero:"Masculino", numero_camiseta:"8",  posicion:"Jugador"},
      {nombre_completo:"Lizbeth Valverde",      genero:"Femenino",  numero_camiseta:"2",  posicion:"Jugador"},
      {nombre_completo:"Cristopher Velez",      genero:"Masculino", numero_camiseta:"7",  posicion:"Jugador"},
      {nombre_completo:"Maylen Velasquez",      genero:"Femenino",  numero_camiseta:"5",  posicion:"Jugador"}
    ]},

  { grupo:"704", deporte:"Voleibol", nombre_equipo:"Colombia", capitan:"Illhan Samuel Gomez", color_camiseta:"Blanca", pais_asignado:"Peru",
    jugadores:[
      {nombre_completo:"Illhan Samuel Gomez R", genero:"Masculino", numero_camiseta:"10", posicion:"Jugador"},
      {nombre_completo:"Sofia Lopez Bueno",     genero:"Femenino",  numero_camiseta:"8",  posicion:"Jugador"},
      {nombre_completo:"Valery Sanchez",        genero:"Femenino",  numero_camiseta:"17", posicion:"Jugador"},
      {nombre_completo:"Nicolas Cardona",       genero:"Masculino", numero_camiseta:"9",  posicion:"Jugador"},
      {nombre_completo:"Anderson Vasquez",      genero:"Masculino", numero_camiseta:"25", posicion:"Jugador"},
      {nombre_completo:"Samuel Ortiz Granillo", genero:"Masculino", numero_camiseta:"7",  posicion:"Jugador"}
    ]},

  { grupo:"704", deporte:"Futsal", nombre_equipo:"Colombia", capitan:"Montoya Juanjose", color_camiseta:"Blanca", pais_asignado:"Peru",
    jugadores:[
      {nombre_completo:"Wilder Romero",         genero:"Masculino", numero_camiseta:"99", posicion:"Jugador"},
      {nombre_completo:"Montoya Juanjose",      genero:"Masculino", numero_camiseta:"1",  posicion:"Capitan"},
      {nombre_completo:"Juan David Viego",      genero:"Masculino", numero_camiseta:"",   posicion:"Jugador"},
      {nombre_completo:"Nicolas Cardona",       genero:"Masculino", numero_camiseta:"11", posicion:"Jugador"},
      {nombre_completo:"Illhan Samuel",         genero:"Masculino", numero_camiseta:"80", posicion:"Jugador"},
      {nombre_completo:"Anderson Vasquez Baro", genero:"Masculino", numero_camiseta:"9",  posicion:"Jugador"},
      {nombre_completo:"Jhoan Camilo Martinez", genero:"Masculino", numero_camiseta:"7",  posicion:"Jugador"},
      {nombre_completo:"Samuel Ortiz",          genero:"Masculino", numero_camiseta:"4",  posicion:"Jugador"}
    ]}

];

function cargarInscripcionesDesdeData() {
  var ss = getSpreadsheet();

  var hojaEq  = ss.getSheetByName("IC_Equipos")   || ss.insertSheet("IC_Equipos");
  var hojaJug = ss.getSheetByName("IC_Jugadores")  || ss.insertSheet("IC_Jugadores");

  // Limpiar TODO y escribir encabezados correctos
  hojaEq.clearContents();
  hojaJug.clearContents();

  hojaEq.getRange(1,1,1,_ENCABEZADOS_EQUIPOS.length).setValues([_ENCABEZADOS_EQUIPOS])
        .setFontWeight("bold").setBackground("#003380").setFontColor("#ffffff");
  hojaJug.getRange(1,1,1,_ENCABEZADOS_JUGADORES.length).setValues([_ENCABEZADOS_JUGADORES])
         .setFontWeight("bold").setBackground("#003380").setFontColor("#ffffff");

  // Limpiar hojas viejas con nombre incorrecto si existen
  var hv1 = ss.getSheetByName("Equipos");   if(hv1) hv1.clearContents();
  var hv2 = ss.getSheetByName("Jugadores"); if(hv2) hv2.clearContents();

  var CODIGOS = {"Mini Futsal":"MF","Mini Voleibol":"MV","Futsal":"FS","Voleibol":"VB"};
  var GRADO_G = {
    "301":"3","302":"3","303":"3","304":"3",
    "401":"4","402":"4","403":"4","404":"4",
    "501":"5","502":"5","503":"5","504":"5",
    "601":"6","602":"6","603":"6",
    "702":"7","703":"7","704":"7"
  };
  var NIVEL_G = {
    "301":"Primaria","302":"Primaria","303":"Primaria","304":"Primaria",
    "401":"Primaria","402":"Primaria","403":"Primaria","404":"Primaria",
    "501":"Primaria","502":"Primaria","503":"Primaria","504":"Primaria",
    "601":"Bachillerato","602":"Bachillerato","603":"Bachillerato",
    "702":"Bachillerato","703":"Bachillerato","704":"Bachillerato"
  };

  var ahora = fechaHoraActual();
  var filasEq=[], filasJug=[], idsUsados={};
  var equiposOk=0, jugadoresOk=0, omitidos=0, dups=[];

  for(var i=0; i<INSCRIPCIONES_MANUALES.length; i++){
    var eq=INSCRIPCIONES_MANUALES[i];
    var grupo=String(eq.grupo||"").trim();
    var dep=String(eq.deporte||"").trim();
    var cod=CODIGOS[dep];
    if(!grupo||!cod){ continue; }
    var id=grupo+"_"+cod;
    if(idsUsados[id]){ dups.push(id); continue; }
    idsUsados[id]=true;
    filasEq.push([
      id, grupo, GRADO_G[grupo]||grupo.charAt(0), NIVEL_G[grupo]||"",
      dep, String(eq.nombre_equipo||"").trim(),
      String(eq.pais_asignado||"").trim(), "",
      String(eq.color_camiseta||"").trim(), String(eq.capitan||"").trim(),
      ahora,"","","","inscrito"
    ]);
    equiposOk++;
    var jugs=eq.jugadores||[];
    for(var j=0;j<jugs.length;j++){
      var nom=String(jugs[j].nombre_completo||"").trim();
      if(!nom||nom.toUpperCase().indexOf("TODO")!==-1){ omitidos++; continue; }
      filasJug.push([
        "PJ_"+id+"_"+(j+1), id, grupo, dep, nom,
        String(jugs[j].genero||"Masculino").trim(),
        String(jugs[j].numero_camiseta||"").trim(),
        String(jugs[j].posicion||"Jugador").trim(),
        "Si", ahora
      ]);
      jugadoresOk++;
    }
  }

  if(filasEq.length>0)  hojaEq.getRange(2,1,filasEq.length,_ENCABEZADOS_EQUIPOS.length).setValues(filasEq);
  if(filasJug.length>0) hojaJug.getRange(2,1,filasJug.length,_ENCABEZADOS_JUGADORES.length).setValues(filasJug);
  SpreadsheetApp.flush();

  var res="✅ CARGA COMPLETADA\n"+
    "  IC_Equipos  : "+equiposOk+" equipos\n"+
    "  IC_Jugadores: "+jugadoresOk+" jugadores\n"+
    "  Omitidos    : "+omitidos+" (vacíos/TODO)\n"+
    (dups.length?"  Duplicados  : "+dups.join(", ")+"\n":"")+
    "  Pendientes  : grupos 302-MF, 304, 402, 403-MF (ingresar manual)";
  Logger.log(res);
  return res;
}

function diagnosticarHojas() {
  var ss=getSpreadsheet();
  var hojas=["IC_Equipos","IC_Jugadores","Equipos","Jugadores"];
  var r=[];
  hojas.forEach(function(n){
    var h=ss.getSheetByName(n);
    if(!h){r.push("["+n+"] NO EXISTE");return;}
    var filas=h.getLastRow(), cols=h.getLastColumn();
    var enc=filas>0?h.getRange(1,1,1,cols).getValues()[0].join(" | "):"(vacía)";
    r.push("["+n+"] "+filas+" filas, "+cols+" cols\n  Encabezados: "+enc);
  });
  var resultado="📊 DIAGNÓSTICO:\n"+r.join("\n");
  Logger.log(resultado);
  return resultado;
}


// ============================================================
// DIAGNÓSTICO AVANZADO — detecta por qué los jugadores
// no aparecen en la plataforma para cada equipo
// ============================================================

/**
 * Ejecuta diagnosticarInscripciones() desde Apps Script.
 * Lee IC_Equipos e IC_Jugadores y cruza los IDs para encontrar
 * exactamente por qué los jugadores no aparecen en la plataforma.
 *
 * Imprime en Logs un reporte completo:
 *   ✅ OK — equipo tiene jugadores y los IDs coinciden
 *   ⚠️ SIN JUGADORES — equipo inscrito pero sin jugadores en IC_Jugadores
 *   ❌ ID MISMATCH — jugadores existen pero con id_equipo diferente
 *   ❓ NO INSCRITO — el id_equipo esperado no existe en IC_Equipos
 */
function diagnosticarInscripciones() {
  try {
    var ss     = getSpreadsheet();
    var hojaEq = ss.getSheetByName("IC_Equipos");
    var hojaJug= ss.getSheetByName("IC_Jugadores");

    if (!hojaEq)  { Logger.log("❌ IC_Equipos no existe. Ejecuta cargarInscripcionesDesdeData()"); return; }
    if (!hojaJug) { Logger.log("❌ IC_Jugadores no existe. Ejecuta cargarInscripcionesDesdeData()"); return; }

    var datosEq  = hojaEq.getDataRange().getValues();
    var datosJug = hojaJug.getDataRange().getValues();

    // Encabezados
    var encEq  = datosEq[0];
    var encJug = datosJug[0];
    var colEqId   = encEq.indexOf("id_equipo");
    var colEqGrupo= encEq.indexOf("grupo");
    var colEqDep  = encEq.indexOf("deporte");
    var colJugEq  = encJug.indexOf("id_equipo");
    var colJugNom = encJug.indexOf("nombre_completo");

    if (colEqId === -1)  { Logger.log("❌ Columna 'id_equipo' no encontrada en IC_Equipos. Encabezados: " + encEq.join(" | ")); return; }
    if (colJugEq === -1) { Logger.log("❌ Columna 'id_equipo' no encontrada en IC_Jugadores. Encabezados: " + encJug.join(" | ")); return; }

    // Construir mapa de jugadores por id_equipo
    var jugadoresPorEquipo = {};
    for (var j = 1; j < datosJug.length; j++) {
      var fila = datosJug[j];
      var idEq = String(fila[colJugEq] || "").trim();
      if (!idEq) continue;
      if (!jugadoresPorEquipo[idEq]) jugadoresPorEquipo[idEq] = [];
      jugadoresPorEquipo[idEq].push(String(fila[colJugNom] || "").trim());
    }

    // Construir set de id_equipo en IC_Equipos
    var idsEnEquipos = {};
    for (var e = 1; e < datosEq.length; e++) {
      var filaEq = datosEq[e];
      var idEqActual = String(filaEq[colEqId] || "").trim();
      if (!idEqActual) continue;
      idsEnEquipos[idEqActual] = {
        grupo  : String(filaEq[colEqGrupo] || ""),
        deporte: String(filaEq[colEqDep]   || "")
      };
    }

    // ── REPORTE ──
    var lineas = [
      "═══════════════════════════════════════════════",
      "  DIAGNÓSTICO DE INSCRIPCIONES — Mundial GABO 2026",
      "  " + new Date().toLocaleString("es-CO"),
      "═══════════════════════════════════════════════",
      "",
      "IC_Equipos  : " + (datosEq.length - 1)  + " equipos",
      "IC_Jugadores: " + (datosJug.length - 1) + " jugadores",
      "IDs únicos con jugadores: " + Object.keys(jugadoresPorEquipo).length,
      ""
    ];

    var ok=0, sinJug=0, mismatch=0, total=Object.keys(idsEnEquipos).length;

    // Revisar cada equipo inscrito
    Object.keys(idsEnEquipos).forEach(function(idEq){
      var info = idsEnEquipos[idEq];
      var jugs = jugadoresPorEquipo[idEq];
      if (jugs && jugs.length > 0) {
        lineas.push("✅ " + idEq + " (" + info.grupo + " · " + info.deporte + ") → " + jugs.length + " jugadores");
        ok++;
      } else {
        lineas.push("⚠️  " + idEq + " (" + info.grupo + " · " + info.deporte + ") → SIN JUGADORES en IC_Jugadores");
        sinJug++;
      }
    });

    // Revisar jugadores huérfanos (id_equipo en IC_Jugadores no existe en IC_Equipos)
    lineas.push("");
    lineas.push("── Jugadores con id_equipo sin equipo registrado ──");
    var huerfanos = 0;
    Object.keys(jugadoresPorEquipo).forEach(function(idEq){
      if (!idsEnEquipos[idEq]) {
        lineas.push("❌ HUÉRFANO: id_equipo='" + idEq + "' tiene " + jugadoresPorEquipo[idEq].length + " jugadores PERO no existe en IC_Equipos");
        lineas.push("   Jugadores: " + jugadoresPorEquipo[idEq].slice(0,5).join(", ") + (jugadoresPorEquipo[idEq].length>5?"...":""));
        huerfanos++;
        mismatch++;
      }
    });
    if (huerfanos === 0) lineas.push("   Ninguno — todos los jugadores tienen equipo válido.");

    // Verificar que los IDs generados por el sistema coincidan con los del Sheet
    lineas.push("");
    lineas.push("── Verificación de IDs esperados vs reales ──");
    var CODIGOS = {"Mini Futsal":"MF","Mini Voleibol":"MV","Futsal":"FS","Voleibol":"VB"};
    var GRUPOS = ["301","302","303","304","401","402","403","404","501","502","503","504","601","602","603","702","703","704"];
    var DEPORTES_PRIM = ["Mini Futsal","Mini Voleibol"];
    var DEPORTES_BACH = ["Futsal","Voleibol"];

    GRUPOS.forEach(function(g){
      var deps = parseInt(g.charAt(0)) <= 5 ? DEPORTES_PRIM : DEPORTES_BACH;
      deps.forEach(function(d){
        var idEsperado = g + "_" + CODIGOS[d];
        if (!idsEnEquipos[idEsperado]) {
          // Solo reportar si hay jugadores con un ID similar (posible mismatch)
          var similares = Object.keys(jugadoresPorEquipo).filter(function(k){ return k.indexOf(g)===0; });
          if (similares.length > 0) {
            lineas.push("⚠️  Esperado '" + idEsperado + "' NO existe. Jugadores encontrados con IDs similares: " + similares.join(", "));
          }
        }
      });
    });

    lineas.push("");
    lineas.push("═══════════════════════════════════════════════");
    lineas.push("RESUMEN:");
    lineas.push("  ✅ Con jugadores    : " + ok);
    lineas.push("  ⚠️  Sin jugadores   : " + sinJug);
    lineas.push("  ❌ IDs huérfanos    : " + huerfanos);
    lineas.push("  Total equipos       : " + total);
    lineas.push("");
    if (sinJug > 0 || huerfanos > 0) {
      lineas.push("SOLUCIÓN RECOMENDADA:");
      if (huerfanos > 0) {
        lineas.push("  Los jugadores huérfanos tienen un id_equipo que no coincide con IC_Equipos.");
        lineas.push("  Ejecuta cargarInscripcionesDesdeData() para recargar todo desde cero,");
        lineas.push("  o corrige manualmente los id_equipo en IC_Jugadores.");
      }
      if (sinJug > 0) {
        lineas.push("  Los equipos sin jugadores existen en IC_Equipos pero IC_Jugadores está vacío.");
        lineas.push("  Ejecuta cargarInscripcionesDesdeData() o ingresa los jugadores desde la plataforma.");
      }
    } else {
      lineas.push("🎉 Todo OK — todos los equipos tienen jugadores con IDs correctos.");
    }
    lineas.push("═══════════════════════════════════════════════");

    var reporte = lineas.join("\n");
    Logger.log(reporte);
    return reporte;

  } catch (e) {
    Logger.log("diagnosticarInscripciones ERROR: " + e.message);
    return "Error: " + e.message;
  }
}


// ============================================================
// VERIFICACIÓN DE CONSISTENCIA — test de 5 equipos al azar
// ============================================================
// Ejecutar desde Apps Script para detectar errores silenciosos.
// Compara IC_Equipos + IC_Jugadores y reporta discrepancias.
//
// INSTRUCCIÓN: Ejecuta verificarConsistencia() desde Apps Script
// y revisa los Logs. Reporta cualquier ⚠️ o ❌ al desarrollador.
// ============================================================

function verificarConsistencia() {
  try {
    var equipos   = leerHoja("EQUIPOS");
    var jugadores = leerHoja("JUGADORES");
    var errores   = [];
    var alertas   = [];

    if (equipos.length === 0) {
      Logger.log("❌ IC_Equipos está vacía.");
      return;
    }

    // ── Construir mapa jugadores por id_equipo ──
    var mapaJug = {};
    for (var j = 0; j < jugadores.length; j++) {
      var idEq = String(jugadores[j].id_equipo || "").trim();
      if (!idEq) continue;
      if (!mapaJug[idEq]) mapaJug[idEq] = [];
      mapaJug[idEq].push(jugadores[j]);
    }

    // ── Seleccionar muestra: 5 equipos con jugadores + todos sin jugadores ──
    var conJugadores = equipos.filter(function(eq){
      return mapaJug[String(eq.id_equipo)] && mapaJug[String(eq.id_equipo)].length > 0;
    });
    var sinJugadores = equipos.filter(function(eq){
      return !mapaJug[String(eq.id_equipo)] || mapaJug[String(eq.id_equipo)].length === 0;
    });

    // Selección aleatoria de 5 de los que tienen jugadores
    var muestra = [];
    var indices = [];
    while (indices.length < Math.min(5, conJugadores.length)) {
      var idx = Math.floor(Math.random() * conJugadores.length);
      if (indices.indexOf(idx) === -1) { indices.push(idx); muestra.push(conJugadores[idx]); }
    }

    var lineas = [
      "═══════════════════════════════════════════════════",
      "  VERIFICACIÓN DE CONSISTENCIA — Mundial GABO 2026",
      "  Muestra: " + muestra.length + " equipos con jugadores + " + sinJugadores.length + " sin jugadores",
      "  " + new Date().toLocaleString("es-CO"),
      "═══════════════════════════════════════════════════",
      ""
    ];

    // ── Analizar muestra ──
    for (var i = 0; i < muestra.length; i++) {
      var eq   = muestra[i];
      var idEq = String(eq.id_equipo || "").trim();
      var jugs = mapaJug[idEq] || [];

      lineas.push("── " + idEq + " (" + eq.deporte + " — Grupo " + eq.grupo + ")");

      // 1. Capitán no vacío
      var cap = String(eq.capitan || "").trim();
      if (!cap || cap.toUpperCase().indexOf("TODO") !== -1) {
        errores.push(idEq + ": capitán vacío o pendiente → \"" + cap + "\"");
        lineas.push("   ❌ Capitán: VACÍO o pendiente");
      } else {
        lineas.push("   ✅ Capitán: \"" + cap + "\"");
      }

      // 2. Pais asignado
      var pais = String(eq.pais || "").trim();
      if (!pais) {
        alertas.push(idEq + ": sin país asignado");
        lineas.push("   ⚠️  País: sin asignar");
      } else {
        lineas.push("   ✅ País: \"" + pais + "\"");
      }

      // 3. Jugadores con id_equipo correcto
      var orphans = 0;
      for (var k = 0; k < jugs.length; k++) {
        if (String(jugs[k].id_equipo).trim() !== idEq) orphans++;
      }
      if (orphans > 0) {
        errores.push(idEq + ": " + orphans + " jugadores con id_equipo incorrecto");
        lineas.push("   ❌ Jugadores huérfanos: " + orphans);
      } else {
        lineas.push("   ✅ Jugadores: " + jugs.length + " (todos con id_equipo correcto)");
      }

      // 4. Nombres sin caracteres problemáticos (comillas, tabs)
      var nombresRaros = jugs.filter(function(jj){
        var n = String(jj.nombre_completo || "");
        return n.indexOf('"') !== -1 || n.indexOf('\t') !== -1 || n.indexOf('\n') !== -1;
      });
      if (nombresRaros.length > 0) {
        alertas.push(idEq + ": " + nombresRaros.length + " nombre(s) con caracteres especiales");
        lineas.push("   ⚠️  Nombres con caracteres raros: " + nombresRaros.map(function(j){return j.nombre_completo;}).join(", "));
      }

      // 5. Duplicados de nombre dentro del mismo equipo
      var nombresSet = {};
      var dups = [];
      jugs.forEach(function(jj){
        var n = String(jj.nombre_completo || "").trim().toUpperCase();
        if (!n) return;
        if (nombresSet[n]) dups.push(n);
        nombresSet[n] = true;
      });
      if (dups.length > 0) {
        errores.push(idEq + ": jugador(es) duplicados: " + dups.join(", "));
        lineas.push("   ❌ Duplicados: " + dups.join(", "));
      }

      lineas.push("");
    }

    // ── Reportar sin jugadores ──
    if (sinJugadores.length > 0) {
      lineas.push("── EQUIPOS SIN JUGADORES EN IC_Jugadores (" + sinJugadores.length + "):");
      sinJugadores.forEach(function(eq){
        lineas.push("   ⚠️  " + eq.id_equipo + " — " + eq.deporte + " (Grupo " + eq.grupo + ")");
      });
      lineas.push("");
    }

    // ── Resumen ──
    lineas.push("═══════════════════════════════════════════════════");
    lineas.push("RESUMEN:");
    lineas.push("  Total equipos en BD      : " + equipos.length);
    lineas.push("  Equipos con jugadores    : " + conJugadores.length);
    lineas.push("  Equipos sin jugadores    : " + sinJugadores.length);
    lineas.push("  ❌ Errores encontrados   : " + errores.length);
    lineas.push("  ⚠️  Alertas              : " + alertas.length);
    if (errores.length > 0) {
      lineas.push("");
      lineas.push("ERRORES DETALLADOS:");
      errores.forEach(function(e){ lineas.push("  ❌ " + e); });
    }
    if (alertas.length > 0) {
      lineas.push("");
      lineas.push("ALERTAS:");
      alertas.forEach(function(a){ lineas.push("  ⚠️  " + a); });
    }
    if (errores.length === 0 && alertas.length === 0) {
      lineas.push("");
      lineas.push("  🎉 Todo OK en la muestra — sin errores detectados.");
    }
    lineas.push("═══════════════════════════════════════════════════");

    var reporte = lineas.join("\n");
    Logger.log(reporte);
    return reporte;

  } catch (e) {
    Logger.log("verificarConsistencia ERROR: " + e.message);
    return "Error: " + e.message;
  }
}
