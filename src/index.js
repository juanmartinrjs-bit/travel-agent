require('dotenv').config();
const express = require('express');
const { chat, extractTravelInfo, detectActions, cleanResponse } = require('./agent/claude');
const { searchEverything } = require('./search/index');
const { getSession, updateSession } = require('./utils/session');
const { transcribeAudio } = require('./utils/audio');
const { kayakAutofill } = require('./booking/kayak-autofill');
const { airlineAutofill } = require('./booking/airline-autofill');

const path = require('path');
const app = express();
app.use(express.json());
app.use(express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '25mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.json({ status: '✈️ Travel Agent running', version: '5.0' });
});

app.post('/chat', async (req, res) => {
  const { userId, message } = req.body;
  if (!userId || !message) return res.status(400).json({ error: 'userId and message are required' });

  try {
    const session = getSession(userId);

    // Agregar mensaje del usuario al historial
    const messages = session.messages || [];
    messages.push({ role: 'user', content: message });

    // Verificar si tenemos suficiente info para buscar
    let searchResults = session.searchResults || null;
    let travelInfo = session.travelInfo || null;

    // Extraer info del viaje del historial
    travelInfo = await extractTravelInfo(messages);
    updateSession(userId, { travelInfo });

    // Si tenemos todo y no hemos buscado aún, buscar PRIMERO antes de responder
    if (!searchResults && travelInfo?.ready_to_search && travelInfo?.destination) {
      console.log(`🔍 Searching for: ${travelInfo.origin} → ${travelInfo.destination}`);
      // Informar al usuario que está buscando
      // Buscar y esperar resultados completos
      searchResults = await searchEverything(travelInfo);
      updateSession(userId, { searchResults, travelInfo });
      console.log(`✅ Search complete. Flights: ${searchResults?.flights?.kayak?.flights?.length || 0} results`);
    }

    // Claude responde CON los resultados ya disponibles
    const claudeResponse = await chat(messages, searchResults, travelInfo);

    // Detectar acciones especiales en la respuesta
    const actions = detectActions(claudeResponse);
    
    // Limpiar tags internos antes de enviar al usuario
    const cleanedReply = cleanResponse(claudeResponse);

    // Agregar respuesta de Claude al historial
    messages.push({ role: 'assistant', content: cleanedReply });
    updateSession(userId, { messages });

    // Si autofill listo — ejecutar en background
    if (actions.autofillReady && travelInfo && session.travelerProfile) {
      const traveler = session.travelerProfile;
      console.log(`🤖 Triggering autofill for ${traveler.firstName}...`);

      airlineAutofill({
        origin: travelInfo.origin,
        destination: travelInfo.destination,
        departure_date: travelInfo.departure_date,
        return_date: travelInfo.return_date,
        travelers: travelInfo.travelers || 1,
        traveler
      }).then(result => {
        updateSession(userId, { autofillResult: result });
        console.log('✅ Autofill done:', result.paymentUrl?.substring(0, 60));
      }).catch(e => console.error('Autofill error:', e.message));

      return res.json({
        reply: cleanedReply + `\n\n🤖 *Llenando el formulario ahora... (1-2 min). En cuanto esté listo te mando el link de pago.*`,
        phase: 'autofilling'
      });
    }

    // Si autofill ya terminó y no se entregó aún
    if (session.autofillResult?.success && !session.autofillDelivered) {
      updateSession(userId, { autofillDelivered: true });
      const r = session.autofillResult;
      return res.json({
        reply: `✅ *¡Todo listo! Solo falta que revises y pagues:*\n\n🔗 ${r.paymentUrl}\n📧 Email: ${r.credentials.email}\n🔑 Contraseña: ${r.credentials.password}`,
        phase: 'ready_to_pay',
        paymentUrl: r.paymentUrl,
        credentials: r.credentials
      });
    }

    res.json({
      reply: cleanedReply,
      phase: actions.bookingReady ? 'ready_to_pay' : 
             actions.searchNeeded ? 'searching' : 
             searchResults ? 'in_conversation' : 'collecting_info'
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Booking autofill endpoint — fills all forms and stops before payment
app.post('/book', async (req, res) => {
  const { userId, flightUrl } = req.body;
  if (!userId || !flightUrl) return res.status(400).json({ error: 'userId and flightUrl required' });

  const session = getSession(userId);
  const traveler = session.travelerProfile;

  if (!traveler?.email) {
    return res.status(400).json({ error: 'No traveler profile found. Start a chat first.' });
  }

  res.json({ status: 'processing', message: '🤖 Llenando el formulario... (puede tomar 1-2 minutos)' });

  // Run autofill in background and notify via session
  kayakAutofill({ flightUrl, traveler }).then(result => {
    updateSession(userId, { lastBooking: result });
  });
});

// Get booking result
app.get('/book/result/:userId', (req, res) => {
  const session = getSession(req.params.userId);
  if (session.lastBooking) {
    res.json(session.lastBooking);
  } else {
    res.json({ status: 'pending' });
  }
});

// Audio endpoint — receives audio buffer, transcribes, then sends to /chat
app.post('/audio', async (req, res) => {
  const userId = req.headers['x-user-id'] || req.query.userId;
  const mimeType = req.headers['content-type'] || 'audio/ogg';

  if (!userId) return res.status(400).json({ error: 'x-user-id header required' });
  if (!req.body || req.body.length === 0) return res.status(400).json({ error: 'Audio buffer required' });

  try {
    console.log(`🎙️ Transcribing audio for user ${userId} (${req.body.length} bytes)`);
    const transcript = await transcribeAudio(req.body, mimeType);
    console.log(`📝 Transcript: "${transcript}"`);

    // Now process the transcript as a normal chat message
    // Reuse the same chat logic by making an internal request
    const chatReq = { body: { userId, message: transcript } };
    const chatRes = {
      _data: null,
      json(data) { this._data = data; },
      status(code) { return this; }
    };

    // Inline the chat handler
    const session = getSession(userId);
    const messages = session.messages || [];
    messages.push({ role: 'user', content: transcript });

    let searchResults = session.searchResults || null;
    let travelInfo = session.travelInfo || null;

    if (!searchResults) {
      travelInfo = await extractTravelInfo(messages);
      updateSession(userId, { travelInfo });
      if (travelInfo?.ready_to_search && travelInfo?.destination) {
        searchResults = await searchEverything(travelInfo);
        updateSession(userId, { searchResults, travelInfo });
      }
    }

    const claudeResponse = await chat(messages, searchResults, travelInfo);
    const cleanedReply = cleanResponse(claudeResponse);
    messages.push({ role: 'assistant', content: cleanedReply });
    updateSession(userId, { messages });

    res.json({
      transcript,          // What the user said (so frontend can show it)
      reply: cleanedReply, // Agent's response
      phase: searchResults ? 'in_conversation' : 'collecting_info'
    });

  } catch (error) {
    console.error('Audio error:', error);
    res.status(500).json({ error: 'Audio processing failed', details: error.message });
  }
});

// Endpoint para resetear sesión (nueva búsqueda)
app.post('/reset', (req, res) => {
  const { userId } = req.body;
  if (userId) {
    const { clearSession } = require('./utils/session');
    clearSession(userId);
  }
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✈️  Travel Agent v5.0 running on port ${PORT}`);
  console.log(`📍 POST http://localhost:${PORT}/chat`);
});
