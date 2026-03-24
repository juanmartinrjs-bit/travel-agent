require('dotenv').config();
const express = require('express');
const { extractTravelInfo, generateTravelResponse } = require('./agent/claude');
const { searchEverything } = require('./search/index');
const { getSession, updateSession } = require('./utils/session');

const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: '✈️ Travel Agent running', version: '2.0' });
});

// Endpoint principal — el marketplace llama este
app.post('/chat', async (req, res) => {
  const { userId, message } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message are required' });
  }

  try {
    // 1. Extraer info del viaje del mensaje
    const travelInfo = await extractTravelInfo(message);

    if (!travelInfo || !travelInfo.destination) {
      return res.json({
        reply: `¡Hola! Soy tu agente de viajes 🧳\n\nDime a dónde querés viajar, las fechas y tu presupuesto.\n\nEjemplo: *"Quiero ir de Miami a Puerto Rico del 1 al 15 de junio, presupuesto $1000 USD para 2 personas"`
      });
    }

    updateSession(userId, { travelInfo });

    // 2. Buscar en TODOS los sitios en paralelo
    console.log('🔍 Launching parallel searches...');
    const searchResults = await searchEverything(travelInfo);

    updateSession(userId, { searchResults });

    // 3. Claude analiza todo y arma las 3 mejores opciones
    const reply = await generateTravelResponse(travelInfo, searchResults);

    res.json({
      reply,
      travelInfo,
      sources: {
        flights: ['Google Flights', 'Kayak'],
        stays: travelInfo.needs_hotel ? ['Google Hotels', 'Airbnb'] : [],
        activities: ['TripAdvisor']
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✈️  Travel Agent v2.0 running on port ${PORT}`);
  console.log(`📍 Endpoint: POST http://localhost:${PORT}/chat`);
});
