// ============================================================
// Code.gs — Ensamblador principal v2
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// CAMBIOS v2:
// - verificarRolDocente() ya NO usa Session.getActiveUser()
//   Usa PIN secreto pasado desde el frontend via parametro.
// - verificarPIN() nueva funcion publica llamada por el Shell
// - El PIN se guarda en PropertiesService, nunca en el codigo
// - El frontend lo guarda en sessionStorage y lo envia en
//   cada llamada admin como parametro adicional
// ============================================================


// ============================================================
// ENTRY POINT
// ============================================================

function doGet(e) {
  var output = HtmlService
    .createTemplateFromFile("Shell")
    .evaluate()
    .setTitle("Mundial GABO 2026 · I.E. GABO")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return output;
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}


// ============================================================
// AUTENTICACION POR PIN
// ------------------------------------------------------------
// Flujo completo:
// 1. El docente accede a la URL con ?admin=MICLAVE
// 2. Shell.html lee el parametro de la URL con window.location
//    (GAS no expone parametros al frontend directamente,
//     asi que se pasa via fragment o el docente lo escribe)
// 3. Shell llama verificarPIN(pin) → GAS valida contra Props
// 4. Si OK, Shell guarda { esAdmin: true } en sessionStorage
// 5. Cada modulo admin llama verificarRolDocente() que ahora
//    recibe el pin desde el frontend y lo valida de nuevo
// ============================================================

/**
 * Verifica si un PIN es correcto comparandolo con PropertiesService.
 * Llamado desde el frontend una sola vez al cargar la app.
 * @param {string} pin - PIN enviado desde el frontend
 * @return {Object} { esAdmin: boolean }
 */
function verificarPIN(pin) {
  try {
    if (!pin || String(pin).trim() === "") {
      return { esAdmin: false };
    }

    var props    = PropertiesService.getScriptProperties();
    var pinGuardado = props.getProperty("ADMIN_PIN");

    if (!pinGuardado) {
      // Si no hay PIN configurado, ningun acceso admin
      log("Code", "ADMIN_PIN no configurado en PropertiesService.", "WARN");
      return { esAdmin: false };
    }

    var esAdmin = String(pin).trim() === String(pinGuardado).trim();

    log("Code", "verificarPIN: " + (esAdmin ? "ACCESO ADMIN OK" : "PIN incorrecto"), "INFO");
    return { esAdmin: esAdmin };
  } catch (e) {
    log("Code", "verificarPIN error: " + e.message, "ERROR");
    return { esAdmin: false };
  }
}

/**
 * Verifica rol del docente para modulos que requieren admin.
 * El frontend pasa el PIN que tiene guardado en sessionStorage.
 * Esta funcion se llama en cada modulo admin para re-validar.
 * @param {string} pin - PIN guardado en el cliente
 * @return {Object} { esAdmin: boolean }
 */
function verificarRolDocente(pin) {
  return verificarPIN(pin || "");
}

/**
 * Configura el PIN del docente en PropertiesService.
 * Ejecutar UNA SOLA VEZ desde la consola de GAS.
 * El PIN puede ser cualquier texto alfanumerico (min 6 chars recomendado).
 * Ejemplo: configurarPINAdmin("GABO2026*")
 * @param {string} pin
 */
function configurarPINAdmin(pin) {
  if (!pin || pin.length < 4) {
    Logger.log("ERROR: El PIN debe tener al menos 4 caracteres.");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("ADMIN_PIN", pin);
  Logger.log("PIN admin configurado correctamente. Longitud: " + pin.length + " chars.");
}


// ============================================================
// NOTICIAS — CRUD
// ============================================================

function getNoticias(limite) {
  try {
    var max     = limite || 20;
    var todas   = leerHoja("NOTICIAS");
    var activas = [];

    for (var i = 0; i < todas.length; i++) {
      var n = todas[i];
      if (n.activa === "Si" || n.activa === true || n.activa === "TRUE" || n.activa === 1) {
        activas.push(n);
      }
    }

    activas.sort(function(a, b) {
      var aD = a.destacada === "Si" || a.destacada === true;
      var bD = b.destacada === "Si" || b.destacada === true;
      if (aD && !bD) return -1;
      if (!aD && bD) return 1;
      var fa = String(a.fecha_publicacion || "");
      var fb = String(b.fecha_publicacion || "");
      return fb > fa ? 1 : fb < fa ? -1 : 0;
    });

    return respuestaExito(activas.slice(0, max));
  } catch (e) {
    log("Code", "getNoticias error: " + e.message, "ERROR");
    return respuestaError("Error cargando noticias: " + e.message);
  }
}

function crearNoticia(datos) {
  try {
    var auth = verificarPIN(datos.pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!datos.titulo || String(datos.titulo).trim() === "") {
      return respuestaError("El titulo es requerido.", "CAMPO_REQUERIDO");
    }
    if (!datos.contenido || String(datos.contenido).trim() === "") {
      return respuestaError("El contenido es requerido.", "CAMPO_REQUERIDO");
    }

    var idNoticia = generarId("NOT");
    var fila = [
      idNoticia,
      String(datos.titulo).trim(),
      String(datos.contenido).trim(),
      datos.categoria  || "General",
      datos.imagen_url || "",
      datos.autor      || "Docente",
      fechaHoraActual(),
      datos.activa     || "Si",
      datos.destacada  || "No"
    ];

    agregarFila("NOTICIAS", fila);
    log("Code", "Noticia creada: " + datos.titulo, "INFO");
    return respuestaExito({ id_noticia: idNoticia }, "Noticia publicada correctamente.");
  } catch (e) {
    log("Code", "crearNoticia error: " + e.message, "ERROR");
    return respuestaError("Error creando noticia: " + e.message);
  }
}

function eliminarNoticia(idNoticia, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    var resultado = buscarFila("NOTICIAS", "id_noticia", idNoticia);
    if (!resultado) return respuestaError("Noticia no encontrada.", "NO_ENCONTRADO");

    var hoja   = getHoja("NOTICIAS");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];
    var col    = encabs.indexOf("activa") + 1;
    if (col === 0) return respuestaError("Columna activa no encontrada.");

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      hoja.getRange(resultado.fila, col).setValue("No");
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }

    log("Code", "Noticia eliminada: " + idNoticia, "INFO");
    return respuestaExito(null, "Noticia eliminada.");
  } catch (e) {
    log("Code", "eliminarNoticia error: " + e.message, "ERROR");
    return respuestaError("Error eliminando noticia: " + e.message);
  }
}


// ============================================================
// PREMIOS
// ============================================================

function getPremios() {
  try {
    return respuestaExito(leerHoja("PREMIOS"));
  } catch (e) {
    return respuestaError("Error cargando premios: " + e.message);
  }
}

function registrarPremio(datos) {
  try {
    var auth = verificarPIN(datos.pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!datos.categoria || !datos.nombre_ganador) {
      return respuestaError("Categoria y nombre_ganador son requeridos.", "CAMPO_REQUERIDO");
    }

    var existente = buscarFila("PREMIOS", "categoria", datos.categoria);

    if (existente) {
      // AUDITORIA v3 - BATCH WRITE: reemplaza 6 setValue() individuales por 1 setValues().
      // Antes: loop con 6 getRange().setValue() = 6 llamadas API.
      // Ahora: 1 getValues() + 1 setValues() = 2 llamadas API total.
      var hoja  = getHoja("PREMIOS");
      var dts   = hoja.getDataRange().getValues();
      var encabs = dts[0];

      // Clonar la fila existente para mutarla en memoria
      var filaActual = dts[existente.fila - 1].slice();
      var campos = ["nombre_ganador","grupo","pais","bandera","observaciones","fecha_entrega"];

      for (var i = 0; i < campos.length; i++) {
        var col = encabs.indexOf(campos[i]);
        if (col === -1) continue;
        if (campos[i] === "fecha_entrega") {
          filaActual[col] = fechaHoraActual();
        } else if (datos[campos[i]] !== undefined) {
          filaActual[col] = datos[campos[i]] || "";
        }
      }

      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try {
        // UNA sola escritura batch de toda la fila
        hoja.getRange(existente.fila, 1, 1, filaActual.length).setValues([filaActual]);
        SpreadsheetApp.flush();
      } finally {
        lock.releaseLock();
      }
      log("Code", "Premio actualizado (batch): " + datos.categoria, "INFO");
      return respuestaExito(null, "Premio actualizado.");
    } else {
      var idPremio = generarId("PR");
      agregarFila("PREMIOS", [
        idPremio, datos.categoria, datos.descripcion || "",
        "", datos.nombre_ganador, datos.grupo || "",
        datos.pais || "", datos.bandera || "",
        datos.valor || "", fechaHoraActual(), datos.observaciones || ""
      ]);
      log("Code", "Premio registrado: " + datos.categoria, "INFO");
      return respuestaExito({ id_premio: idPremio }, "Premio registrado.");
    }
  } catch (e) {
    log("Code", "registrarPremio error: " + e.message, "ERROR");
    return respuestaError("Error registrando premio: " + e.message);
  }
}


// ============================================================
// PRE-SELECCION
// ============================================================

function getPreseleccion() {
  try {
    return respuestaExito(leerHoja("PRESELECCION"));
  } catch (e) {
    return respuestaError("Error cargando pre-seleccion: " + e.message);
  }
}

function marcarPreseleccion(datos) {
  try {
    var auth = verificarPIN(datos.pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    if (!datos.nombre_jugador || !datos.grupo) {
      return respuestaError("nombre_jugador y grupo son requeridos.", "CAMPO_REQUERIDO");
    }

    var existente = buscarFila("PRESELECCION", "nombre_jugador", datos.nombre_jugador);
    if (existente) {
      return respuestaError(datos.nombre_jugador + " ya esta en la pre-seleccion.", "DUPLICADO");
    }

    var pais    = datos.pais    || "";
    var bandera = datos.bandera || "";

    if (!pais && datos.grupo) {
      var eqRes = buscarFila("EQUIPOS", "grupo", datos.grupo);
      if (eqRes) {
        pais    = eqRes.datos.pais           || "";
        bandera = eqRes.datos.bandera_codigo || "";
      }
    }

    var idPre = generarId("PS");
    agregarFila("PRESELECCION", [
      idPre, datos.id_jugador || "", datos.nombre_jugador,
      datos.grupo, pais, datos.posicion || "Jugador",
      datos.genero || "", datos.observaciones_docente || "",
      datos.analisis_ia || "", fechaHoraActual()
    ]);

    log("Code", "Pre-seleccion: " + datos.nombre_jugador, "INFO");
    return respuestaExito({ id_pre: idPre }, datos.nombre_jugador + " agregado a pre-seleccion.");
  } catch (e) {
    log("Code", "marcarPreseleccion error: " + e.message, "ERROR");
    return respuestaError("Error en pre-seleccion: " + e.message);
  }
}

function eliminarPreseleccion(idPre, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    var hoja   = getHoja("PRESELECCION");
    var datos  = hoja.getDataRange().getValues();
    var encabs = datos[0];
    var colId  = encabs.indexOf("id_pre");
    if (colId === -1) return respuestaError("Columna id_pre no encontrada.");

    for (var i = datos.length - 1; i >= 1; i--) {
      if (String(datos[i][colId]) === String(idPre)) {
        var lock = LockService.getScriptLock();
        lock.waitLock(10000);
        try {
          hoja.deleteRow(i + 1);
          SpreadsheetApp.flush();
        } finally {
          lock.releaseLock();
        }
        return respuestaExito(null, "Jugador eliminado de pre-seleccion.");
      }
    }
    return respuestaError("Registro no encontrado.", "NO_ENCONTRADO");
  } catch (e) {
    log("Code", "eliminarPreseleccion error: " + e.message, "ERROR");
    return respuestaError("Error: " + e.message);
  }
}

function generarAnalisisIA(idPre) {
  try {
    var resultado = buscarFila("PRESELECCION", "id_pre", idPre);
    if (!resultado) return respuestaError("Pre-seleccion no encontrada.", "NO_ENCONTRADO");

    var jugador    = resultado.datos;
    var goleadores = leerHoja("GOLEADORES");
    var totalGoles = 0;
    for (var i = 0; i < goleadores.length; i++) {
      if (String(goleadores[i].nombre_jugador).toLowerCase() === String(jugador.nombre_jugador).toLowerCase()) {
        totalGoles = totalGoles + (Number(goleadores[i].goles) || 0);
      }
    }

    var analisis = analizarJugadorConIA(
      { nombre: jugador.nombre_jugador, grado: jugador.grupo ? jugador.grupo.charAt(0) : "", posicion: jugador.posicion, genero: jugador.genero },
      { "Goles en el torneo": totalGoles, "Posicion": jugador.posicion, "Observaciones del docente": jugador.observaciones_docente || "Ninguna" }
    );

    var hoja   = getHoja("PRESELECCION");
    var dts    = hoja.getDataRange().getValues();
    var encabs = dts[0];
    var col    = encabs.indexOf("analisis_ia") + 1;
    if (col > 0) {
      var lock = LockService.getScriptLock();
      lock.waitLock(10000);
      try { hoja.getRange(resultado.fila, col).setValue(analisis); SpreadsheetApp.flush(); }
      finally { lock.releaseLock(); }
    }

    return respuestaExito({ analisis: analisis }, "Analisis generado.");
  } catch (e) {
    log("Code", "generarAnalisisIA error: " + e.message, "ERROR");
    return respuestaError("Error generando analisis: " + e.message);
  }
}

// ============================================================
// CONFIG PUBLICA — lectura sin autenticacion
// Usa PropertiesService como almacen principal (persistente
// y garantizado), con IC_Config como escritura secundaria.
// ============================================================

/**
 * Lee un valor de configuracion publica.
 * Busca primero en PropertiesService (garantizado),
 * luego en IC_Config como fallback.
 * @param {string} clave
 * @return {Object} { ok, datos }
 */
function getConfigPublico(clave) {
  try {
    var claveKey = "CFG_" + String(clave).trim().toUpperCase();

    // 1. Intentar PropertiesService (siempre disponible)
    var props = PropertiesService.getScriptProperties();
    var valor = props.getProperty(claveKey);

    // 2. Fallback: IC_Config en Sheets
    if (!valor) {
      try {
        valor = getConfig(clave, "") || "";
      } catch(eSheets) {
        valor = "";
      }
    }

    return respuestaExito(valor || "");
  } catch (e) {
    log("Code", "getConfigPublico error: " + e.message, "ERROR");
    return respuestaError("Error leyendo config: " + e.message);
  }
}

/**
 * Guarda un valor de configuracion. Requiere PIN admin valido.
 * Escribe en PropertiesService (persistente) Y en IC_Config (Sheets).
 * @param {string} pin   - PIN admin
 * @param {string} clave - Clave a guardar
 * @param {string} valor - Valor a guardar
 * @return {Object} { ok, datos }
 */
function setConfigAdmin(pin, clave, valor) {
  try {
    var auth = verificarPIN(pin);
    if (!auth.esAdmin) {
      return respuestaError("Acceso denegado. PIN incorrecto.", "NO_AUTORIZADO");
    }
    if (!clave || String(clave).trim() === "") {
      return respuestaError("Clave requerida.", "CAMPO_REQUERIDO");
    }

    var claveClean = String(clave).trim();
    var valorClean = String(valor || "").trim();
    var claveKey   = "CFG_" + claveClean.toUpperCase();

    // 1. Guardar en PropertiesService (siempre funciona, persiste)
    PropertiesService.getScriptProperties().setProperty(claveKey, valorClean);

    // 2. Intentar guardar en IC_Config tambien (puede fallar si la hoja no existe)
    try {
      setConfig(claveClean, valorClean);
    } catch(eSheets) {
      log("Code", "setConfigAdmin: IC_Config no disponible, guardado solo en Properties. " + eSheets.message, "WARN");
    }

    log("Code", "setConfigAdmin OK: [" + claveClean + "] = " + valorClean, "INFO");
    return respuestaExito(null, "Configuracion guardada correctamente.");
  } catch (e) {
    log("Code", "setConfigAdmin error: " + e.message, "ERROR");
    return respuestaError("Error guardando config: " + e.message);
  }
}


// ============================================================
// TRIGGERS SIMPLES — onOpen / onEdit
// ============================================================

/**
 * Se ejecuta automáticamente al abrir el Spreadsheet.
 * Agrega el menú personalizado en la barra de Sheets.
 */
function onOpen(e) {
  try {
    var ui = SpreadsheetApp.getUi();
    ui.createMenu("⚽ Mundial GABO 2026")
      .addItem("🌐 Abrir plataforma",        "abrirPlataforma")
      .addSeparator()
      .addSubMenu(
        ui.createMenu("🔧 Administración")
          .addItem("⚡ Generar fixture completo",    "triggerGenerarFixture")
          .addItem("🔄 Recalcular todas las tablas", "triggerRecalcularTablas")
          .addItem("🌍 Sincronizar países",          "triggerSincronizarPaises")
          .addItem("📋 Diagnóstico de inscripciones","triggerDiagnostico")
      )
      .addSubMenu(
        ui.createMenu("🏆 Torneo")
          .addItem("📊 Estado completo del torneo",  "triggerEstadoTorneo")
          .addItem("🎯 Activar plataforma completa", "triggerActivarPlataforma")
      )
      .addSeparator()
      .addItem("🔑 Configurar PIN admin",     "triggerConfigurarPIN")
      .addItem("🤖 Configurar API Gemini",    "triggerConfigurarGemini")
      .addToUi();
    console.log("onOpen: menú GABO 2026 creado.");
  } catch (e) {
    console.error("onOpen error: " + e.message);
  }
}

/**
 * Se ejecuta automáticamente en cada edición del Spreadsheet.
 * Recalcula la tabla del grado/deporte afectado si se editó IC_Partidos.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var hoja = e.range.getSheet();
    var nombre = hoja.getName();
    // Solo reaccionar a ediciones en IC_Partidos
    if (nombre !== "IC_Partidos") return;
    // Buscar si las columnas editadas son resultado (goles_local, goles_visitante, estado)
    var col   = e.range.getColumn();
    var encabs = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    var colGL  = encabs.indexOf("goles_local")     + 1;
    var colGV  = encabs.indexOf("goles_visitante") + 1;
    var colEst = encabs.indexOf("estado")          + 1;
    if (col !== colGL && col !== colGV && col !== colEst) return;

    // Leer fila editada para saber grado y deporte
    var fila   = e.range.getRow();
    var datos  = hoja.getRange(fila, 1, 1, hoja.getLastColumn()).getValues()[0];
    var colG   = encabs.indexOf("grado");
    var colD   = encabs.indexOf("deporte");
    if (colG === -1 || colD === -1) return;
    var grado   = String(datos[colG]);
    var deporte = String(datos[colD]);
    if (!grado || !deporte) return;

    recalcularTablaGrado(grado, deporte);
    console.log("onEdit: tabla recalculada — Grado " + grado + " " + deporte);
  } catch (err) {
    console.error("onEdit error: " + err.message);
  }
}


// ============================================================
// FUNCIONES DE MENÚ — se invocan desde el menú personalizado
// ============================================================

function abrirPlataforma() {
  try {
    var props = PropertiesService.getScriptProperties();
    var ssId  = props.getProperty("SPREADSHEET_ID");
    var deployId = props.getProperty("WEBAPP_DEPLOY_ID") || "";
    var url   = deployId
      ? "https://script.google.com/macros/s/" + deployId + "/exec"
      : "https://script.google.com/home";
    SpreadsheetApp.getUi().alert(
      "🌐 URL de la Plataforma\n\n" + url +
      "\n\nCopia esta URL y compártela con los estudiantes.\n" +
      "Para acceso admin agrega: ?admin=TU_PIN"
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error: " + e.message);
  }
}

function triggerGenerarFixture() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.prompt("Generar Fixture Completo",
    "Ingresa el PIN de administrador:", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pin = res.getResponseText().trim();
  var r   = generarFixtureAutomatico("", "13:00", pin);
  ui.alert(r.ok
    ? "✅ Fixture generado:\n" + (r.datos.generados || []).join("\n")
    : "❌ Error: " + r.mensaje);
}

function triggerRecalcularTablas() {
  try {
    recalcularTodasLasTablas();
    SpreadsheetApp.getUi().alert("✅ Todas las tablas recalculadas correctamente.");
  } catch (e) {
    SpreadsheetApp.getUi().alert("❌ Error: " + e.message);
  }
}

function triggerSincronizarPaises() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.prompt("Sincronizar Países",
    "Ingresa el PIN de administrador:", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var r = sincronizarPaisesEquipos(res.getResponseText().trim());
  ui.alert(r.ok ? "✅ " + r.mensaje : "❌ " + r.mensaje);
}

function triggerDiagnostico() {
  var reporte = diagnosticarInscripciones();
  var ui = SpreadsheetApp.getUi();
  ui.alert("Diagnóstico de Inscripciones", reporte.substring(0, 1500), ui.ButtonSet.OK);
}

function triggerEstadoTorneo() {
  try {
    var r = getEstadoCompletoTorneo();
    var txt = r.ok
      ? "📊 ESTADO DEL TORNEO\n\n" +
        "Equipos: " + r.datos.resumen.total_equipos + "\n" +
        "Jugadores: " + r.datos.resumen.total_jugadores + "\n" +
        "Partidos: " + r.datos.resumen.partidos_jugados + "/" + r.datos.resumen.total_partidos + "\n" +
        "Avance: " + r.datos.resumen.pct_avance + "%"
      : "❌ " + r.mensaje;
    SpreadsheetApp.getUi().alert(txt);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error: " + e.message);
  }
}

function triggerConfigurarPIN() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.prompt("Configurar PIN de Administrador",
    "Ingresa el nuevo PIN (mín. 4 caracteres):", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var pin = res.getResponseText().trim();
  if (pin.length < 4) { ui.alert("El PIN debe tener al menos 4 caracteres."); return; }
  configurarPINAdmin(pin);
  ui.alert("✅ PIN configurado correctamente.");
}

function triggerConfigurarGemini() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.prompt("Configurar API Key de Gemini",
    "Pega tu Google AI API Key:", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var key = res.getResponseText().trim();
  if (!key) { ui.alert("API Key no puede estar vacía."); return; }
  PropertiesService.getScriptProperties().setProperty("GEMINI_API_KEY", key);
  ui.alert("✅ Gemini API Key guardada. Las funciones de IA ya están disponibles.");
}


// ============================================================
// ACTIVACIÓN COMPLETA DE LA PLATAFORMA
// Se llama desde Apertura cuando se completan todas las actividades
// ============================================================

/**
 * Activa todas las utilidades del torneo tras completar la Apertura.
 * 1. Sincroniza países con TORNEO.PAISES
 * 2. Genera fixture completo (si no existe)
 * 3. Recalcula tablas de posiciones
 * 4. Genera resumen IA de la apertura
 * 5. Guarda estado "torneo_activo" = "si"
 *
 * @param {string} pin
 * @param {string} fechaBase  - "YYYY-MM-DD"
 * @param {string} horaInicio - "HH:MM"
 * @return {Object}
 */
function activarPlataformaCompleta(pin, fechaBase, horaInicio) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    var pasos = [];
    var errores = [];

    // ── PASO 1: Sincronizar países ──
    try {
      var rPaises = sincronizarPaisesEquipos(pin);
      pasos.push("Países: " + rPaises.mensaje);
      console.log("activarPlataforma PASO 1 OK: " + rPaises.mensaje);
    } catch (e1) {
      errores.push("Países: " + e1.message);
      console.error("activarPlataforma PASO 1 error: " + e1.message);
    }

    // ── PASO 2: Generar fixture completo ──
    try {
      var fecha = fechaBase || (function(){
        var hoy = new Date();
        var m   = String(hoy.getMonth()+1); if(m.length<2) m="0"+m;
        var d   = String(hoy.getDate());    if(d.length<2) d="0"+d;
        return hoy.getFullYear()+"-"+m+"-"+d;
      })();
      var rFix = generarFixtureAutomatico(fecha, horaInicio || "13:00", pin);
      pasos.push("Fixture: " + rFix.mensaje);
      console.log("activarPlataforma PASO 2 OK: " + rFix.mensaje);
    } catch (e2) {
      errores.push("Fixture: " + e2.message);
      console.error("activarPlataforma PASO 2 error: " + e2.message);
    }

    // ── PASO 3: Recalcular tablas ──
    try {
      recalcularTodasLasTablas();
      pasos.push("Tablas: recalculadas correctamente.");
      console.log("activarPlataforma PASO 3 OK.");
    } catch (e3) {
      errores.push("Tablas: " + e3.message);
      console.error("activarPlataforma PASO 3 error: " + e3.message);
    }

    // ── PASO 4: Resumen IA de la apertura ──
    var resumenIA = "";
    try {
      var equipos   = leerHoja("EQUIPOS");
      var jugadores = leerHoja("JUGADORES");
      resumenIA = generarResumenAperturaIA(equipos.length, jugadores.length);
      pasos.push("IA: resumen generado.");
      console.log("activarPlataforma PASO 4 OK: IA activa.");
    } catch (e4) {
      resumenIA = "IA no disponible.";
      errores.push("IA: " + e4.message);
      console.warn("activarPlataforma PASO 4 skip: " + e4.message);
    }

    // ── PASO 5: Marcar torneo como activo ──
    try {
      setConfigAdmin(pin, "torneo_activo", "si");
      setConfigAdmin(pin, "apertura_completada", new Date().toISOString());
      pasos.push("Estado: torneo marcado como ACTIVO.");
      console.log("activarPlataforma PASO 5 OK: torneo activo.");
    } catch (e5) {
      errores.push("Estado: " + e5.message);
    }

    return respuestaExito({
      pasos    : pasos,
      errores  : errores,
      resumen_ia: resumenIA,
      activo   : errores.length === 0
    },
      "Activación completada: " + pasos.length + " pasos OK" +
      (errores.length > 0 ? ", " + errores.length + " con advertencia." : ".")
    );

  } catch (e) {
    log("Code", "activarPlataformaCompleta error: " + e.message, "ERROR");
    return respuestaError("Error en activación: " + e.message);
  }
}

/**
 * Genera un resumen narrativo de la apertura usando Gemini.
 * @param {number} totalEquipos
 * @param {number} totalJugadores
 * @return {string} texto del resumen
 */
function generarResumenAperturaIA(totalEquipos, totalJugadores) {
  var hoy = new Date();
  var fecha = hoy.getDate() + "/" + (hoy.getMonth()+1) + "/" + hoy.getFullYear();
  var prompt =
    "Eres el cronista oficial del 'Mundial GABO 2026' en I.E. GABO, Cartago, Valle del Cauca.\n\n" +
    "Escribe un párrafo festivo y emotivo de 3-4 oraciones anunciando el inicio del torneo:\n" +
    "- Fecha de apertura: " + fecha + "\n" +
    "- Equipos participantes: " + totalEquipos + " (de grados 3° a 7°, jornada tarde)\n" +
    "- Jugadores inscritos: " + totalJugadores + "\n" +
    "- 2 deportes: Futsal/Mini Futsal y Voleibol/Mini Voleibol\n\n" +
    "Tono: escolar colombiano, festivo, motivador. Máximo 80 palabras. Sin emojis.";
  return llamarGemini(prompt, 200);
}

/**
 * Genera comentario IA sobre un partido recién jugado (para noticias automáticas).
 * @param {Object} partido - datos del partido
 * @param {number} golesL
 * @param {number} golesV
 * @return {string}
 */
/**
 * Genera una crónica deportiva completa para la sección de Noticias.
 * Llamada automáticamente tras procesar una Ficha de Arbitraje escaneada.
 *
 * @param {Object} partido      - Objeto partido de IC_Partidos
 * @param {number} golesL       - Goles del equipo local
 * @param {number} golesV       - Goles del equipo visitante
 * @param {Array}  goleadores   - (opcional) [{ nombre, camiseta, equipo, goles }]
 * @param {Array}  tarjetas     - (opcional) [{ nombre, tipo, equipo, minuto }]
 * @param {string} arbitro      - (opcional) Nombre del árbitro
 * @return {string} Crónica periodística lista para publicar
 */
function generarComentarioPartidoIA(partido, golesL, golesV, goleadores, tarjetas, arbitro) {
  try {
    var nombreLocal  = (partido.pais_local    || partido.grupo_local    || "Local").toUpperCase();
    var nombreVisit  = (partido.pais_visitante || partido.grupo_visitante || "Visitante").toUpperCase();
    var deporte      = partido.deporte  || "Fútsal";
    var grado        = partido.grado    || "";
    var fase         = partido.fase     || "Fase Regular";

    // ── Determinar resultado ──
    var resultado, ganador, perdedor;
    if (golesL > golesV) {
      resultado = "victoria"; ganador = nombreLocal; perdedor = nombreVisit;
    } else if (golesV > golesL) {
      resultado = "victoria"; ganador = nombreVisit; perdedor = nombreLocal;
    } else {
      resultado = "empate"; ganador = ""; perdedor = "";
    }

    // ── Contexto de goleadores ──
    var ctxGoleadores = "";
    if (Array.isArray(goleadores) && goleadores.length) {
      var lineas = goleadores.map(function(g) {
        return (g.nombre || "#" + g.camiseta) + " (" +
               (g.goles > 1 ? g.goles + " goles, " : "") +
               (String(g.equipo).toLowerCase() === "local" ? nombreLocal : nombreVisit) + ")";
      });
      ctxGoleadores = "Goleadores: " + lineas.join(", ") + ".";
    }

    // ── Contexto de tarjetas ──
    var ctxTarjetas = "";
    if (Array.isArray(tarjetas) && tarjetas.length) {
      var amarillas = tarjetas.filter(function(t){ return t.tipo === "Amarilla"; }).length;
      var rojas     = tarjetas.filter(function(t){ return t.tipo !== "Amarilla"; }).length;
      ctxTarjetas = "Disciplina: " + amarillas + " tarjeta(s) amarilla(s)" +
                    (rojas ? ", " + rojas + " tarjeta(s) roja(s)" : "") + ".";
    }

    // ── Árbitro ──
    var ctxArbitro = arbitro ? "Árbitro: " + arbitro + "." : "";

    var prompt =
      "Eres el cronista oficial del MUNDIAL GABO 2026 (I.E. GABO, Cartago, Valle del Cauca).\n" +
      "Redacta una crónica deportiva emocionante y profesional de máximo 120 palabras.\n\n" +
      "DATOS DEL PARTIDO:\n" +
      "  Deporte : " + deporte + "\n" +
      "  Fase    : " + fase + (grado ? " | Grado " + grado + "°" : "") + "\n" +
      "  Resultado: " + nombreLocal + " " + golesL + " — " + golesV + " " + nombreVisit + "\n" +
      (resultado === "empate"
        ? "  Resultado: EMPATE EMOCIONANTE\n"
        : "  Ganador: " + ganador + " · Derrotado: " + perdedor + "\n") +
      (ctxGoleadores ? "  " + ctxGoleadores + "\n" : "") +
      (ctxTarjetas   ? "  " + ctxTarjetas   + "\n" : "") +
      (ctxArbitro    ? "  " + ctxArbitro    + "\n" : "") +
      "\nESTILO:\n" +
      "- Tono festivo, apasionado, escolar colombiano.\n" +
      "- Incluye un titular llamativo en la primera línea (sin etiquetas HTML).\n" +
      "- Narra la intensidad del partido, menciona jugadores clave si tienes datos.\n" +
      "- Cierra con una frase motivadora para los equipos.\n" +
      "- Máximo 120 palabras. No uses markdown ni asteriscos.";

    return llamarGemini(prompt, 300);
  } catch (e) {
    log("Code", "generarComentarioPartidoIA error: " + e.message, "WARN");
    // Fallback determinista si Gemini falla
    var loc  = (partido.pais_local    || partido.grupo_local    || "Local").toUpperCase();
    var vis  = (partido.pais_visitante || partido.grupo_visitante || "Visitante").toUpperCase();
    if (golesL > golesV) {
      return loc + " se impuso " + golesL + "-" + golesV + " ante " + vis +
             " en un gran partido del Mundial GABO 2026. ¡Así se juega!";
    } else if (golesV > golesL) {
      return vis + " venció " + golesV + "-" + golesL + " a " + loc +
             " en una jornada vibrante del Mundial GABO 2026. ¡Felicitaciones!";
    } else {
      return "Empate " + golesL + "-" + golesV + " entre " + loc + " y " + vis +
             ". ¡Partido intenso en el Mundial GABO 2026!";
    }
  }
}


// ============================================================
// TRIGGER DESDE MENÚ
// ============================================================

function triggerActivarPlataforma() {
  var ui  = SpreadsheetApp.getUi();
  var res = ui.prompt("Activar Plataforma",
    "PIN de admin + fecha inicio (YYYY-MM-DD):\n(Ej: GABO2026 2026-04-10)\nSeparados por espacio:",
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var partes = res.getResponseText().trim().split(" ");
  var pin    = partes[0] || "";
  var fecha  = partes[1] || "";
  var r      = activarPlataformaCompleta(pin, fecha, "13:00");
  var txt    = r.ok
    ? "✅ Plataforma activada:\n" + r.datos.pasos.join("\n") +
      (r.datos.resumen_ia ? "\n\nResumen IA:\n" + r.datos.resumen_ia : "")
    : "❌ Error: " + r.mensaje;
  ui.alert("Activación de Plataforma", txt.substring(0, 1200), ui.ButtonSet.OK);
}


// ============================================================
// INSTALACIÓN DE TRIGGERS PROGRAMÁTICOS
// Ejecutar UNA VEZ como admin para instalar todos los triggers.
// ============================================================

/**
 * Instala todos los triggers instalables del proyecto.
 * Ejecutar desde el editor de Apps Script → Run → instalarTriggers().
 * Solo necesita ejecutarse una vez.
 */
function instalarTriggers() {
  // Eliminar triggers previos para evitar duplicados
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(t) { ScriptApp.deleteTrigger(t); });

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // onOpen — menú personalizado
  ScriptApp.newTrigger("onOpen")
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  // onEdit — recalcular tabla en tiempo real
  ScriptApp.newTrigger("onEdit")
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  // Trigger diario — recalcular todas las tablas a medianoche
  ScriptApp.newTrigger("triggerRecalcularTablas")
    .timeBased()
    .atHour(0)
    .everyDays(1)
    .create();

  Logger.log("✅ Triggers instalados: onOpen, onEdit, recálculo diario.");
}


// ============================================================
// FASE 1 — MIGRACIÓN DE BANDERAS (Script de un solo uso)
// Ejecutar desde Apps Script: Run → migrarCodigosBanderas()
// Lee IC_Equipos y escribe el código ISO-2 en bandera_codigo
// usando el campo grupo como clave.
// ============================================================

/**
 * Script de un solo uso.
 * Lee IC_Equipos, localiza la columna bandera_codigo y escribe
 * el código ISO 3166-1 alpha-2 correspondiente a cada grupo.
 * No modifica filas donde bandera_codigo ya tiene valor.
 *
 * Mapeo oficial del torneo:
 *   301→FR  302→HT  303→UY  304→SV
 *   401→ES  402→PY  403→CA  404→CO
 *   501→EC  502→PT  503→DE  504→MX
 *   601→AR  602→BR  603→US
 *   702→RO  703→VE  704→PE
 */
function migrarCodigosBanderas() {
  var MAPA = {
    "301": "FR", "302": "HT", "303": "UY", "304": "SV",
    "401": "ES", "402": "PY", "403": "CA", "404": "CO",
    "501": "EC", "502": "PT", "503": "DE", "504": "MX",
    "601": "AR", "602": "BR", "603": "US",
    "702": "RO", "703": "VE", "704": "PE"
  };

  try {
    var ss   = getSpreadsheet();
    var hoja = ss.getSheetByName("IC_Equipos");
    if (!hoja) {
      Logger.log("❌ Hoja IC_Equipos no encontrada.");
      return;
    }

    var datos     = hoja.getDataRange().getValues();
    var encabs    = datos[0];
    var colGrupo  = encabs.indexOf("grupo");
    var colBand   = encabs.indexOf("bandera_codigo");

    if (colGrupo === -1) {
      Logger.log("❌ Columna 'grupo' no encontrada. Encabezados: " + encabs.join(" | "));
      return;
    }
    if (colBand === -1) {
      Logger.log("❌ Columna 'bandera_codigo' no encontrada. Encabezados: " + encabs.join(" | "));
      return;
    }

    var actualizados = 0, omitidos = 0, sinMapeo = 0;

    for (var i = 1; i < datos.length; i++) {
      var fila  = datos[i];
      var grupo = String(fila[colGrupo] || "").trim();
      var actual = String(fila[colBand] || "").trim();

      if (!grupo) continue;

      if (actual !== "") {
        omitidos++;
        Logger.log("✓ Fila " + (i + 1) + " grupo=" + grupo + " ya tiene bandera_codigo=" + actual + " (omitida)");
        continue;
      }

      var iso = MAPA[grupo];
      if (!iso) {
        sinMapeo++;
        Logger.log("⚠️ Fila " + (i + 1) + " grupo=" + grupo + " sin mapeo de bandera.");
        continue;
      }

      hoja.getRange(i + 1, colBand + 1).setValue(iso);
      actualizados++;
      Logger.log("✅ Fila " + (i + 1) + " grupo=" + grupo + " → bandera_codigo=" + iso);
    }

    SpreadsheetApp.flush();

    var resumen =
      "=== MIGRACIÓN COMPLETADA ===\n" +
      "✅ Actualizados : " + actualizados + "\n" +
      "✓ Omitidos      : " + omitidos    + " (ya tenían valor)\n" +
      "⚠️ Sin mapeo    : " + sinMapeo    + "\n" +
      "Total filas     : " + (datos.length - 1);

    Logger.log(resumen);
    SpreadsheetApp.getUi().alert("Migración de Banderas", resumen, SpreadsheetApp.getUi().ButtonSet.OK);

  } catch (e) {
    Logger.log("❌ migrarCodigosBanderas ERROR: " + e.message);
    try { SpreadsheetApp.getUi().alert("Error: " + e.message); } catch (_) {}
  }
}
