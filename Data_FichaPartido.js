// ============================================================
// Data_FichaPartido.gs — Ficha del árbitro: generación e ingesta OCR
// Mundial GABO 2026 · I.E. GABO · Cartago, Valle del Cauca
// ------------------------------------------------------------
// Flujo:
//   1. Admin genera ficha HTML imprimible por partido
//      → getFichaPartido(idPartido, pin)
//   2. Árbitro llena la ficha a mano durante el partido
//   3. Admin toma foto de la ficha llena
//   4. procesarFichaEscaneada(idPartido, imagenBase64, mimeType, pin)
//      → Gemini OCR extrae: marcador, goles, tarjetas, faltas
//      → Sistema actualiza todo automáticamente
// ============================================================


// ============================================================
// GENERAR DATOS PARA FICHA IMPRIMIBLE
// ============================================================

/**
 * Retorna todos los datos necesarios para renderizar la ficha
 * imprimible del árbitro para un partido.
 *
 * El frontend (Modulo_FichaArbitro.html) toma estos datos
 * y genera la ficha en HTML para imprimir con window.print().
 *
 * @param {string} idPartido
 * @param {string} pin
 * @return {Object}
 */
function getFichaPartido(idPartido, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    var partRes = buscarFila("PARTIDOS", "id_partido", idPartido);
    if (!partRes) return respuestaError("Partido no encontrado: " + idPartido, "NO_ENCONTRADO");

    var p = partRes.datos;
    var esFutsal  = String(p.deporte || "").indexOf("Futsal")   !== -1;
    var esVoley   = String(p.deporte || "").indexOf("Voleibol") !== -1;

    // Jugadores de ambos equipos
    var todosJug = leerHoja("JUGADORES");
    var jugLocal = [], jugVisit = [];
    for (var i = 0; i < todosJug.length; i++) {
      var j = todosJug[i];
      if (String(j.id_equipo) === String(p.id_equipo_local))     jugLocal.push(j);
      if (String(j.id_equipo) === String(p.id_equipo_visitante)) jugVisit.push(j);
    }

    // Ordenar por número de camiseta
    function porCamiseta(a, b) {
      return (Number(a.numero_camiseta) || 99) - (Number(b.numero_camiseta) || 99);
    }
    jugLocal.sort(porCamiseta);
    jugVisit.sort(porCamiseta);

    if (jugLocal.length === 0 && jugVisit.length === 0) {
      return respuestaError("No hay jugadores registrados para este grado", "SIN_JUGADORES");
    }

    // Obtener capitanes desde IC_Equipos
    var equipoL = buscarFila("EQUIPOS", "id_equipo", p.id_equipo_local);
    var equipoV = buscarFila("EQUIPOS", "id_equipo", p.id_equipo_visitante);
    var capitanLocal = equipoL ? equipoL.datos.capitan : "";
    var capitanVisitante = equipoV ? equipoV.datos.capitan : "";

    return respuestaExito({
      partido       : p,
      jugadores_local    : jugLocal,
      jugadores_visitante: jugVisit,
      capitan_local      : capitanLocal,
      capitan_visitante  : capitanVisitante,
      es_futsal     : esFutsal,
      es_voley      : esVoley,
      max_goles_fila: esFutsal ? 10 : 0,
      sets_voley    : esVoley  ? 3  : 0
    }, "Ficha lista para partido: " + idPartido);

  } catch (e) {
    log("Data_FichaPartido", "getFichaPartido error: " + e.message, "ERROR");
    return respuestaError("Error generando ficha: " + e.message);
  }
}

/**
 * Genera el PDF de la Ficha del Árbitro en el Servidor (Apps Script).
 * Transforma el Template_FichaPDF.html en un PDF puro y retorna el Blob encoding.
 */
function generarFichaPDFServer(idPartido, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");
    
    // Extraer datos usando la misma función lógica de base
    var datosRes = getFichaPartido(idPartido, pin);
    if (!datosRes.ok) return datosRes;
    
    var d = datosRes.datos;
    
    // Usar HtmlService para evaluar la plantilla
    var tmp = HtmlService.createTemplateFromFile("Template_FichaPDF");
    tmp.p = d.partido;
    tmp.jugLocal = d.jugadores_local;
    tmp.jugVisit = d.jugadores_visitante;
    tmp.capLocal = d.capitan_local;
    tmp.capVisit = d.capitan_visitante;
    tmp.esFutsal = d.es_futsal;
    tmp.esVoley  = d.es_voley;
    
    var output = tmp.evaluate();
    var blb    = Utilities.newBlob(output.getContent(), 'text/html', 'Ficha_' + idPartido + '.html');
    var pdf    = blb.getAs('application/pdf');
    var base64 = Utilities.base64Encode(pdf.getBytes());
    
    return respuestaExito({
      nombre: 'Ficha_Arbitro_' + idPartido + '.pdf',
      mime_type: 'application/pdf',
      data: base64
    }, "PDF generado exitosamente");
  } catch (e) {
    log("Data_FichaPartido", "generarFichaPDFServer error: " + e.message, "ERROR");
    return respuestaError("Error generando PDF server-side: " + e.message);
  }
}



// ============================================================
// PROCESAR FICHA ESCANEADA (OCR con Gemini Vision)
// ============================================================

/**
 * Recibe la foto de la ficha llena por el árbitro,
 * usa Gemini Vision para extraer los datos y actualiza
 * todo el torneo automáticamente.
 *
 * @param {string} idPartido       - ID del partido
 * @param {string} imagenBase64    - Imagen en Base64 (JPG o PNG)
 * @param {string} mimeType        - "image/jpeg" | "image/png"
 * @param {string} pin             - PIN admin
 * @return {Object} { ok, datos: { extraido, guardado, alertas } }
 */
function procesarFichaEscaneada(idPartido, imagenBase64, mimeType, pin) {
  try {
    var auth = verificarPIN(pin || "");
    if (!auth.esAdmin) return respuestaError("Acceso denegado.", "NO_AUTORIZADO");

    if (!imagenBase64 || !imagenBase64.trim()) {
      return respuestaError("Imagen requerida.", "IMAGEN_REQUERIDA");
    }

    var partRes = buscarFila("PARTIDOS", "id_partido", idPartido);
    if (!partRes) return respuestaError("Partido no encontrado: " + idPartido, "NO_ENCONTRADO");

    var p        = partRes.datos;
    var esFutsal = String(p.deporte || "").indexOf("Futsal")   !== -1;
    var esVoley  = String(p.deporte || "").indexOf("Voleibol") !== -1;

    // ── Obtener lista de jugadores para el prompt ──
    var todosJug = leerHoja("JUGADORES");
    var jugLocal = [], jugVisit = [];
    for (var i = 0; i < todosJug.length; i++) {
      var j = todosJug[i];
      if (String(j.id_equipo) === String(p.id_equipo_local))     jugLocal.push(j.nombre_completo + " (#" + (j.numero_camiseta||"?") + ")");
      if (String(j.id_equipo) === String(p.id_equipo_visitante)) jugVisit.push(j.nombre_completo + " (#" + (j.numero_camiseta||"?") + ")");
    }

    // ── Construir prompt para Gemini Vision ──
    var prompt = _buildPromptOCR(p, jugLocal, jugVisit, esFutsal, esVoley);

    // ── Llamar Gemini con imagen ──
    var jsonTexto = _llamarGeminiVision(imagenBase64, mimeType || "image/jpeg", prompt);

    // ── Parsear respuesta JSON ──
    var extraido;
    try {
      var limpio = jsonTexto.replace(/```json|```/g, "").trim();
      extraido = JSON.parse(limpio);
    } catch (ep) {
      log("Data_FichaPartido", "Error parseando OCR: " + jsonTexto.slice(0, 300), "ERROR");
      return respuestaError(
        "Gemini no pudo leer la ficha correctamente. Ingresa los datos manualmente.\n" +
        "Respuesta: " + jsonTexto.slice(0, 200),
        "OCR_PARSE_ERROR"
      );
    }

    // ── Guardar resultado principal ──
    var alertas = [];
    var golesL = Number(extraido.goles_local    || 0);
    var golesV = Number(extraido.goles_visitante || 0);

    // ── VALIDACIÓN CRUZADA: 1T + 2T debe coincidir con Total ──
    var g1tL = extraido.goles_1t_local    !== null && extraido.goles_1t_local    !== undefined ? Number(extraido.goles_1t_local)    : null;
    var g2tL = extraido.goles_2t_local    !== null && extraido.goles_2t_local    !== undefined ? Number(extraido.goles_2t_local)    : null;
    var g1tV = extraido.goles_1t_visitante !== null && extraido.goles_1t_visitante !== undefined ? Number(extraido.goles_1t_visitante) : null;
    var g2tV = extraido.goles_2t_visitante !== null && extraido.goles_2t_visitante !== undefined ? Number(extraido.goles_2t_visitante) : null;

    if (g1tL !== null && g2tL !== null) {
      var sumaL = g1tL + g2tL;
      if (sumaL !== golesL) {
        alertas.push("⚠️ VALIDACIÓN: LOCAL 1T(" + g1tL + ")+2T(" + g2tL + ")=" + sumaL + " ≠ Total(" + golesL + "). Se usa el Total de la columna.");
        log("Data_FichaPartido", "Discrepancia 1T+2T LOCAL: " + sumaL + " vs Total " + golesL, "WARN");
      }
    }
    if (g1tV !== null && g2tV !== null) {
      var sumaV = g1tV + g2tV;
      if (sumaV !== golesV) {
        alertas.push("⚠️ VALIDACIÓN: VISITANTE 1T(" + g1tV + ")+2T(" + g2tV + ")=" + sumaV + " ≠ Total(" + golesV + "). Se usa el Total de la columna.");
        log("Data_FichaPartido", "Discrepancia 1T+2T VISITANTE: " + sumaV + " vs Total " + golesV, "WARN");
      }
    }
    // Propagar alerta_suma de Gemini si existe
    if (extraido.alerta_suma) {
      alertas.push("🔍 OCR: " + extraido.alerta_suma);
    }

    var resGuardar = registrarResultado(
      idPartido, golesL, golesV, "Finalizado",
      "OCR ficha escaneada. " + (extraido.observaciones || ""),
      pin
    );

    if (!resGuardar.ok) {
      alertas.push("⚠️ No se pudo guardar el marcador: " + resGuardar.mensaje);
    }

    // ── Guardar goleadores (Futsal) ──
    var goleadoresGuardados = 0;
    if (esFutsal && extraido.goleadores && extraido.goleadores.length) {
      for (var g = 0; g < extraido.goleadores.length; g++) {
        var gol = extraido.goleadores[g];
        if (!gol.camiseta && !gol.nombre) continue;
        var jugadorEncontrado = _buscarJugadorPorCamisetaONombre(
          gol.camiseta, gol.nombre, p.id_equipo_local, p.id_equipo_visitante
        );
        if (jugadorEncontrado) {
          registrarGoles(
            idPartido,
            jugadorEncontrado.id_jugador,
            jugadorEncontrado.id_equipo,
            Number(gol.goles || 1),
            pin
          );
          goleadoresGuardados++;
        } else {
          alertas.push("⚠️ Goleador no encontrado: " + (gol.nombre || "#" + gol.camiseta));
        }
      }
    }

    // ── Guardar tarjetas ──
    var tarjetasGuardadas = 0;
    var todasTarjetas = (extraido.tarjetas || []);
    for (var t = 0; t < todasTarjetas.length; t++) {
      var tar = todasTarjetas[t];
      if (!tar.camiseta && !tar.nombre) continue;
      var jugTarjeta = _buscarJugadorPorCamisetaONombre(
        tar.camiseta, tar.nombre, p.id_equipo_local, p.id_equipo_visitante
      );
      if (jugTarjeta) {
        registrarTarjeta({
          id_partido  : idPartido,
          id_jugador  : jugTarjeta.id_jugador,
          id_equipo   : jugTarjeta.id_equipo,
          tipo_tarjeta: tar.tipo || "Amarilla",
          minuto      : Number(tar.minuto || 0),
          descripcion : tar.motivo || "OCR",
          pin         : pin
        });
        tarjetasGuardadas++;
      } else {
        alertas.push("⚠️ Jugador de tarjeta no encontrado: " + (tar.nombre || "#" + tar.camiseta));
      }
    }

    // ── Guardar registro de ficha escaneada ──
    _guardarRegistroFicha(idPartido, p, extraido, alertas);

    log("Data_FichaPartido",
        "OCR procesado: " + idPartido + " | " + golesL + "-" + golesV +
        " | goles: " + goleadoresGuardados + " | tarjetas: " + tarjetasGuardadas, "INFO");

    // ── Generar Noticia Automática IA ──
    try {
      if (typeof generarComentarioPartidoIA === "function" && typeof crearNoticia === "function") {
        var comentario = generarComentarioPartidoIA(
          p, golesL, golesV,
          extraido.goleadores  || [],   // goleadores con nombre/camiseta
          extraido.tarjetas    || [],   // tarjetas amarillas/rojas
          extraido.arbitro     || ""    // árbitro del partido
        );
        var nombreL = (p.pais_local    || p.grupo_local    || "LOCAL").toUpperCase();
        var nombreV = (p.pais_visitante || p.grupo_visitante || "VISITANTE").toUpperCase();
        var tituloNoticia = nombreL + " " + golesL + " — " + golesV + " " + nombreV +
                            " | " + (p.deporte || "Fútsal") +
                            (p.fase ? " · " + p.fase : "");
        var resNoticia = crearNoticia({
          titulo    : tituloNoticia,
          contenido : comentario + (extraido.observaciones ? "\n\n📋 Observaciones arbitrales: " + extraido.observaciones : ""),
          categoria : "Resultados",
          imagen_url: "",
          autor     : "IA Gemini OCR",
          pin       : pin
        });
        if (resNoticia && resNoticia.ok) {
          alertas.push("✅ Noticia automática generada por IA exitosamente.");
        }
      }
    } catch (eNoticia) {
      log("Data_FichaPartido", "Error generando noticia IA: " + eNoticia.message, "WARN");
    }

    return respuestaExito({
      marcador          : golesL + " - " + golesV,
      goleadores_ok     : goleadoresGuardados,
      tarjetas_ok       : tarjetasGuardadas,
      alertas           : alertas,
      datos_extraidos   : extraido
    },
      "Ficha procesada. Marcador: " + golesL + "-" + golesV +
      " | Goles: " + goleadoresGuardados +
      " | Tarjetas: " + tarjetasGuardadas +
      (alertas.length ? " | " + alertas.length + " alerta(s)" : ".")
    );

  } catch (e) {
    log("Data_FichaPartido", "procesarFichaEscaneada error: " + e.message, "ERROR");
    return respuestaError("Error procesando ficha: " + e.message);
  }
}


// ============================================================
// HELPERS PRIVADOS
// ============================================================

/**
 * Construye el prompt OCR para Gemini Vision.
 * Optimizado para la estructura exacta de las fichas del MUNDIAL GABO 2026:
 * - Le indica a Gemini la estructura del documento con sus IDs únicos
 * - Incluye la lista de jugadores para mejorar la precisión
 * - Exige normalización en MAYÚSCULA SOSTENIDA de nombres
 */
function _buildPromptOCR(partido, jugLocal, jugVisit, esFutsal, esVoley) {
  var tipoDeporte  = esFutsal ? "Fútsal/Mini-Fútsal" : "Voleibol/Mini-Voleibol";
  var listaLocal   = jugLocal.join(", ")  || "No disponible";
  var listaVisit   = jugVisit.join(", ") || "No disponible";
  var nombreLocal  = (partido.pais_local    || partido.grupo_local    || "Local").toUpperCase();
  var nombreVisit  = (partido.pais_visitante || partido.grupo_visitante || "Visitante").toUpperCase();

  var instrGoles = esFutsal
    ? 'Para "goleadores": array de { "camiseta": número_camiseta, "nombre": NOMBRE_EN_MAYÚSCULAS, "goles": cantidad }. Si el número de camiseta es ilegible usa null.'
    : 'Para Voleibol no hay goleadores individuales, deja "goleadores": []. En su lugar extrae puntos_local y puntos_visitante por set.';

  return (
    "Eres el sistema OCR oficial del MUNDIAL GABO 2026 (I.E. GABO, Cartago, Valle del Cauca).\n\n" +
    "## IDENTIFICADOR DEL PARTIDO (LLAVE PRIMARIA)\n" +
    "El ID único de este partido es: " + partido.id_partido + "\n" +
    "Este ID aparece impreso en la cabecera de la ficha física. Si lo detectas en la imagen,\n" +
    "confirma que coincide con el ID indicado arriba antes de extraer cualquier dato.\n" +
    "Si el ID de la imagen NO coincide con '" + partido.id_partido + "', detén la lectura y\n" +
    "devuelve confianza: 'baja' con observaciones: 'ID NO COINCIDE — FICHA INCORRECTA'.\n\n" +
    "## CONTEXTO PRECARGADO (no necesitas leer del documento)\n" +
    "Ya conoces el contexto completo de este partido. Estos datos son VERDAD absoluta:\n" +
    "  LOCAL    : " + nombreLocal + " (Grupo " + partido.grupo_local + ", Grado " + partido.grado + ")\n" +
    "  VISITANTE: " + nombreVisit + " (Grupo " + partido.grupo_visitante + ")\n" +
    "  Deporte  : " + partido.deporte + " | Fase: " + (partido.fase || "Regular") + "\n" +
    "  Fecha    : " + (partido.fecha || "—") + " | Hora: " + (partido.hora || "—") + "\n\n" +
    "Tu misión es enfocarte EXCLUSIVAMENTE en los datos MANUSCRITOS: goles, faltas, tarjetas y firmas.\n\n" +
    "## ESTRUCTURA FÍSICA DEL DOCUMENTO\n" +
    "  1. CABECERA: ID del partido, torneo, institución, jornada.\n" +
    "  2. TABLA VS: LOCAL (izq.) vs VISITANTE (der.) — ya conoces los nombres.\n" +
    "  3. TABLA DE MARCADOR: Columnas 'Goles 1T', 'Goles 2T', 'Total', 'Faltas'.\n" +
    "     Fila 1 = " + nombreLocal + " (LOCAL). Fila 2 = " + nombreVisit + " (VISITANTE).\n" +
    "  4. TABLAS DE JUGADORES: Local (izq.) y Visitante (der.), columnas: N°, Nombre, Pos, G, TA, TR.\n" +
    "     Marcas en TA/TR son cruces (X) manuscritas.\n" +
    "  5. MARCADOR FINAL: Bloque grande con goles totales escritos a mano — fuente primaria.\n" +
    "  6. FIRMAS: Árbitro (izq.), Capitán Local (centro), Capitán Visitante (der.).\n\n" +
    "## DATOS DEL PARTIDO\n" +
    "  Equipo LOCAL    : " + nombreLocal    + " (Grupo " + partido.grupo_local    + ")\n" +
    "  Equipo VISITANTE: " + nombreVisit + " (Grupo " + partido.grupo_visitante + ")\n" +
    "  Deporte         : " + partido.deporte + "\n\n" +
    "## JUGADORES LOCALES INSCRITOS (" + nombreLocal + ")\n" +
    listaLocal + "\n\n" +
    "## JUGADORES VISITANTES INSCRITOS (" + nombreVisit + ")\n" +
    listaVisit + "\n\n" +
    "## INSTRUCCIONES DE EXTRACCIÓN\n" +
    "Sigue este orden de lectura para máxima fidelidad:\n" +
    "  a) Lee los goles totales desde la columna 'Total' de la TABLA DE MARCADOR.\n" +
    "     Si hay ambigüedad, confirma con el bloque 'MARCADOR FINAL'.\n" +
    "  b) Lee las faltas desde la columna 'Faltas' de la misma tabla.\n" +
    "  c) Lee los goles por jugador (columna G) y tarjetas (columnas TA/TR) de las tablas de jugadores.\n" +
    "  d) Lee el árbitro del campo manuscrito en la cabecera y confirma con la firma inferior izquierda.\n\n" +
    "## REGLA DE MAYÚSCULAS — OBLIGATORIO\n" +
    "Todos los valores de texto (nombres de árbitro, jugadores, capitanes, observaciones)\n" +
    "DEBEN devolverse en MAYÚSCULA SOSTENIDA. Ejemplo: 'Don David' → 'DON DAVID'.\n\n" +
    "EXTRAE y responde SOLO con JSON puro, sin texto adicional ni backticks:\n" +
    "{\n" +
    '  "goles_1t_local"   : número o null (Goles 1er Tiempo equipo local),\n' +
    '  "goles_2t_local"   : número o null (Goles 2do Tiempo equipo local),\n' +
    '  "goles_local"      : número (TOTAL local — debe coincidir con 1T+2T si ambos son legibles),\n' +
    '  "goles_1t_visitante": número o null (Goles 1er Tiempo equipo visitante),\n' +
    '  "goles_2t_visitante": número o null (Goles 2do Tiempo equipo visitante),\n' +
    '  "goles_visitante"  : número (TOTAL visitante — debe coincidir con 1T+2T si ambos son legibles),\n' +
    '  "faltas_local"     : número o null,\n' +
    '  "faltas_visitante" : número o null,\n' +
    '  "puntos_local"     : número o null (solo Voleibol),\n' +
    '  "puntos_visitante" : número o null (solo Voleibol),\n' +
    '  "sets_local"       : número o null (solo Voleibol),\n' +
    '  "sets_visitante"   : número o null (solo Voleibol),\n' +
    '  "goleadores"       : [],\n' +
    '  "tarjetas"         : [\n' +
    '    { "tipo": "Amarilla|Roja|Roja directa", "camiseta": número, "nombre": "NOMBRE EN MAYÚSCULAS o null", "equipo": "local|visitante", "minuto": número_o_null, "motivo": "TEXTO EN MAYÚSCULAS o null" }\n' +
    '  ],\n' +
    '  "arbitro"          : "NOMBRE EN MAYÚSCULAS o null",\n' +
    '  "observaciones"    : "TEXTO EN MAYÚSCULAS o null",\n' +
    '  "confianza"        : "alta|media|baja",\n' +
    '  "alerta_suma"      : null\n' +
    "}\n\n" +
    instrGoles + "\n\n" +
    "REGLAS CRÍTICAS:\n" +
    "- Si no puedes leer un campo, usa null (NO inventes datos).\n" +
    "- VALIDACIÓN CRUZADA OBLIGATORIA: Si lees goles_1t y goles_2t de un equipo, verifica que\n" +
    "  su suma coincida con la columna Total. Si no coinciden, prioriza el bloque MARCADOR FINAL\n" +
    "  para el Total y reporta la discrepancia en el campo 'alerta_suma'.\n" +
    "  Ejemplo de alerta_suma: 'LOCAL: 1T(2)+2T(1)=3 pero Total dice 4 — usando MARCADOR FINAL'.\n" +
    "- Si el marcador es ilegible en la tabla, lee el bloque MARCADOR FINAL.\n" +
    "- Si sigue siendo ilegible, usa 0 para ambos y marca confianza: 'baja'.\n" +
    "- Para tarjetas: una X en columna TA = Amarilla; X en TR = Roja.\n" +
    "- Para tarjetas: identifica si la camiseta pertenece a local o visitante según su tabla.\n" +
    "- Sé conservador: mejor null que un dato incorrecto."
  );
}


/**
 * Llama a Gemini Vision con imagen base64 + texto.
 * Implementa Exponential Backoff automático ante errores 503/429
 * (hasta MAX_INTENTOS reintentos con espera creciente).
 */
function _llamarGeminiVision(imagenBase64, mimeType, prompt) {
  var props  = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY no configurada en PropertiesService.");

  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + apiKey;

  var payload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imagenBase64 } },
        { text: prompt }
      ]
    }],
    generationConfig: {
      maxOutputTokens: 1500,
      temperature    : 0.1    // Temperatura baja para OCR — más determinista
    }
  };

  var opciones = {
    method            : "post",
    contentType       : "application/json",
    payload           : JSON.stringify(payload),
    muteHttpExceptions: true
  };

  // ── Exponential Backoff ──────────────────────────────────────────────────
  // Reintenta ante 503 (alta demanda) y 429 (rate-limit) con espera creciente
  var MAX_INTENTOS  = 4;
  var ESPERA_BASE_MS = 2000;   // 2 s en el primer reintento → 4 s → 8 s → …

  for (var intento = 1; intento <= MAX_INTENTOS; intento++) {
    var resp   = UrlFetchApp.fetch(url, opciones);
    var code   = resp.getResponseCode();
    var cuerpo = resp.getContentText();

    if (code === 200) {
      // ── Éxito: parsear y devolver texto ─────────────────────────────────
      var json = JSON.parse(cuerpo);
      if (
        json && json.candidates && json.candidates[0] &&
        json.candidates[0].content && json.candidates[0].content.parts &&
        json.candidates[0].content.parts[0]
      ) {
        return _normalizarTextoOCR(json.candidates[0].content.parts[0].text);
      }
      throw new Error("Respuesta inesperada de Gemini Vision.");
    }

    // ── Error recuperable: 503 o 429 ────────────────────────────────────
    if ((code === 503 || code === 429) && intento < MAX_INTENTOS) {
      var espera = ESPERA_BASE_MS * Math.pow(2, intento - 1); // 2s, 4s, 8s
      log("Data_FichaPartido",
          "Gemini Vision error " + code + " (intento " + intento + "/" + MAX_INTENTOS +
          "). Reintentando en " + (espera / 1000) + " s…", "WARN");
      Utilities.sleep(espera);
      continue;
    }

    // ── Error definitivo (4xx, 5xx no recuperable, etc.) ────────────────
    throw new Error("Gemini Vision error " + code + ": " + cuerpo.slice(0, 300));
  }

  // Si llegamos aquí, agotamos todos los reintentos en 503/429
  throw new Error(
    "Gemini Vision no respondió tras " + MAX_INTENTOS + " intentos (error de alta demanda). " +
    "Por favor, intenta de nuevo en unos segundos."
  );
}


/**
 * Normaliza el texto de salida del OCR:
 *   - Convierte nombres de árbitro, jugadores, observaciones a MAYÚSCULA SOSTENIDA.
 *   - Es una segunda capa de seguridad sobre la instrucción ya incluida en el prompt.
 */
function _normalizarTextoOCR(textoJson) {
  try {
    var limpio  = textoJson.replace(/```json|```/g, "").trim();
    var obj     = JSON.parse(limpio);

    // Campos escalares de texto → MAYÚSCULAS
    var camposTexto = ["arbitro", "observaciones"];
    camposTexto.forEach(function(c) {
      if (obj[c] && typeof obj[c] === "string") obj[c] = obj[c].toUpperCase();
    });

    // Goleadores: nombre → MAYÚSCULAS
    if (Array.isArray(obj.goleadores)) {
      obj.goleadores = obj.goleadores.map(function(g) {
        if (g.nombre && typeof g.nombre === "string") g.nombre = g.nombre.toUpperCase();
        return g;
      });
    }

    // Tarjetas: nombre + motivo → MAYÚSCULAS
    if (Array.isArray(obj.tarjetas)) {
      obj.tarjetas = obj.tarjetas.map(function(t) {
        if (t.nombre  && typeof t.nombre  === "string") t.nombre  = t.nombre.toUpperCase();
        if (t.motivo  && typeof t.motivo  === "string") t.motivo  = t.motivo.toUpperCase();
        return t;
      });
    }

    return JSON.stringify(obj);
  } catch (e) {
    // Si no se puede parsear aquí, devolvemos el texto original y
    // el parseo principal en procesarFichaEscaneada manejará el error.
    return textoJson;
  }
}


/**
 * Busca un jugador por número de camiseta o nombre parcial
 * dentro de los equipos local y visitante.
 */
function _buscarJugadorPorCamisetaONombre(camiseta, nombre, idLocal, idVisit) {
  try {
    var jugadores = leerHoja("JUGADORES");
    var candidatos = jugadores.filter(function(j) {
      return String(j.id_equipo) === String(idLocal) ||
             String(j.id_equipo) === String(idVisit);
    });

    // Primero buscar por camiseta exacta
    if (camiseta !== null && camiseta !== undefined) {
      for (var i = 0; i < candidatos.length; i++) {
        if (String(candidatos[i].numero_camiseta) === String(camiseta)) {
          return candidatos[i];
        }
      }
    }

    // Luego buscar por nombre parcial
    if (nombre && String(nombre).trim()) {
      var nombreLow = String(nombre).toLowerCase().trim();
      for (var k = 0; k < candidatos.length; k++) {
        var nomJug = String(candidatos[k].nombre_completo || "").toLowerCase();
        // Coincidencia si el nombre del OCR está contenido en el nombre completo
        if (nomJug.indexOf(nombreLow) !== -1 || nombreLow.indexOf(nomJug.split(" ")[0]) !== -1) {
          return candidatos[k];
        }
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}


/**
 * Guarda el registro completo de la ficha escaneada en IC_FichasPartido.
 */
function _guardarRegistroFicha(idPartido, partido, extraido, alertas) {
  try {
    var idFicha = generarId("FP");

    // Separar goleadores por equipo
    var golesLocal  = (extraido.goleadores || []).filter(function(g){ return String(g.equipo||"").toLowerCase() === "local"; });
    var golesVisit  = (extraido.goleadores || []).filter(function(g){ return String(g.equipo||"").toLowerCase() === "visitante"; });

    // Contar tarjetas desde el array extraido
    var tarjetas    = extraido.tarjetas || [];
    var taL = tarjetas.filter(function(t){ return String(t.equipo||"").toLowerCase()==="local"    && t.tipo==="Amarilla"; }).length;
    var taV = tarjetas.filter(function(t){ return String(t.equipo||"").toLowerCase()==="visitante"&& t.tipo==="Amarilla"; }).length;
    var trL = tarjetas.filter(function(t){ return String(t.equipo||"").toLowerCase()==="local"    && t.tipo!=="Amarilla"; }).length;
    var trV = tarjetas.filter(function(t){ return String(t.equipo||"").toLowerCase()==="visitante"&& t.tipo!=="Amarilla"; }).length;

    var fila = [
      idFicha,
      idPartido,
      partido.grupo_local     || "",
      partido.grupo_visitante || "",
      partido.deporte         || "",
      Number(extraido.goles_local      || 0),
      Number(extraido.goles_visitante  || 0),
      JSON.stringify(golesLocal),
      JSON.stringify(golesVisit),
      Number(extraido.faltas_local     || 0),
      Number(extraido.faltas_visitante || 0),
      taL, taV,   // tarjetas_amarillas local / visitante
      trL, trV,   // tarjetas_rojas local / visitante
      Number(extraido.puntos_local     || 0),
      Number(extraido.puntos_visitante || 0),
      Number(extraido.sets_local       || 0),
      Number(extraido.sets_visitante   || 0),
      // Campos 1T / 2T para histórico
      extraido.goles_1t_local      !== undefined ? Number(extraido.goles_1t_local    || 0) : "",
      extraido.goles_2t_local      !== undefined ? Number(extraido.goles_2t_local    || 0) : "",
      extraido.goles_1t_visitante  !== undefined ? Number(extraido.goles_1t_visitante|| 0) : "",
      extraido.goles_2t_visitante  !== undefined ? Number(extraido.goles_2t_visitante|| 0) : "",
      String(extraido.arbitro      || ""),
      String(extraido.confianza    || ""),
      String(extraido.observaciones|| "") + (alertas.length ? " | Alertas: " + alertas.join("; ") : ""),
      "OCR_Gemini",
      fechaHoraActual(),
      fechaHoraActual()
    ];
    agregarFila("FICHAS_PARTIDO", fila);
  } catch (e) {
    log("Data_FichaPartido", "_guardarRegistroFicha warning: " + e.message, "WARN");
  }
}
