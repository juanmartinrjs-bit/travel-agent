require('dotenv').config();
const express = require('express');
const { chat, extractTravelInfo, detectActions, cleanResponse } = require('./agent/claude');
const { searchEverything } = require('./search/index');
const { getSession, updateSession } = require('./utils/session');

const app = express();
app.use(express.json());

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

    if (!searchResults) {
      // Extraer info del viaje del historial
      travelInfo = await extractTravelInfo(messages);
      updateSession(userId, { travelInfo });

      // Si tenemos todo, lanzar búsqueda
      if (travelInfo?.ready_to_search && travelInfo?.destination) {
        console.log(`🔍 Searching for: ${travelInfo.origin} → ${travelInfo.destination}`);
        searchResults = await searchEverything(travelInfo);
        updateSession(userId, { searchResults, travelInfo });
      }
    }

    // Claude responde con toda la memoria conversacional
    const claudeResponse = await chat(messages, searchResults, travelInfo);

    // Detectar acciones especiales en la respuesta
    const actions = detectActions(claudeResponse);
    
    // Limpiar tags internos antes de enviar al usuario
    const cleanedReply = cleanResponse(claudeResponse);

    // Agregar respuesta de Claude al historial
    messages.push({ role: 'assistant', content: cleanedReply });
    updateSession(userId, { messages });

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
