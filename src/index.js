require('dotenv').config();
const express = require('express');
const { extractTravelInfo, generateTravelResponse } = require('./agent/claude');
const { getMissingBasicField, getMissingExtraField, extractFieldValue, buildChoiceMessage } = require('./agent/conversation');
const { searchEverything } = require('./search/index');
const { autofillBooking } = require('./booking/autofill');
const { createTravelerProfile, generateTravelPassword } = require('./utils/profile');
const { getSession, updateSession } = require('./utils/session');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: '✈️ Travel Agent running', version: '3.0' });
});

app.post('/chat', async (req, res) => {
  const { userId, message } = req.body;
  if (!userId || !message) return res.status(400).json({ error: 'userId and message are required' });

  try {
    const session = getSession(userId);
    const msg = message.trim();

    // ── FASE 1: Recopilar info del viaje ─────────────────────────
    if (!session.travelInfo || !session.travelInfo.destination) {
      const travelInfo = await extractTravelInfo(msg);
      if (!travelInfo || !travelInfo.destination) {
        return res.json({
          phase: 'travel_info',
          reply: `¡Hola! Soy tu agente de viajes personal ✈️\n\nDime a dónde querés viajar, las fechas y tu presupuesto.\n\nEjemplo: *"Quiero ir de Miami a Puerto Rico del 1 al 15 de junio, presupuesto $1000 USD"*`
        });
      }
      updateSession(userId, { travelInfo });
      return res.json({
        phase: 'collecting_profile',
        reply: `¡Perfecto! Encontré tu destino 🎯\n\nAntes de buscar, necesito algunos datos básicos.\n\n¿Cuál es tu nombre?`,
        field: 'firstName'
      });
    }

    // ── FASE 2: Recopilar perfil básico (nombre + email) ─────────
    if (!session.basicProfileComplete) {
      const profile = session.travelerProfile || {};
      const missing = getMissingBasicField(profile);

      if (missing) {
        const value = await extractFieldValue(missing.field, msg);
        profile[missing.field] = value;
        updateSession(userId, { travelerProfile: profile });

        const next = getMissingBasicField(profile);
        if (next) {
          return res.json({ phase: 'collecting_profile', field: next.field, reply: next.question });
        }

        // Perfil básico completo — crear contraseña de viajes
        profile.travelPassword = generateTravelPassword(profile.firstName);
        updateSession(userId, { travelerProfile: profile, basicProfileComplete: true });

        return res.json({
          phase: 'searching',
          reply: `¡Perfecto ${profile.firstName}! 🙌 Ahora busco las mejores opciones...\n\n🔍 Buscando en Google Flights, Kayak, Booking, Airbnb y TripAdvisor...`
        });
      }
    }

    // ── FASE 3: Buscar y presentar opciones ──────────────────────
    if (session.basicProfileComplete && !session.searchResults) {
      const searchResults = await searchEverything(session.travelInfo);
      updateSession(userId, { searchResults });
      const reply = await generateTravelResponse(session.travelInfo, searchResults);
      updateSession(userId, { searchReply: reply });

      return res.json({
        phase: 'options_presented',
        reply: reply + `\n\n---\n💳 ¿Cuál opción preferís? Respondé *1*, *2* o *3*`
      });
    }

    // ── FASE 4: Usuario elige opción ─────────────────────────────
    if (session.searchResults && !session.choiceMade) {
      const flights = session.searchResults?.flights;
      const bookingUrl = flights?.kayak?.bookingLink || flights?.googleFlights?.bookingLink;
      const traveler = session.travelerProfile;

      updateSession(userId, { choiceMade: true, bookingUrl });

      return res.json({
        phase: 'choice',
        reply: buildChoiceMessage(traveler, bookingUrl)
      });
    }

    // ── FASE 5a: Usuario elige que llenemos nosotros ─────────────
    if (session.choiceMade && !session.extraProfileComplete && !session.selfBook) {
      const choice = msg;

      // Usuario elige hacerlo solo
      if (choice === '2' || choice.toLowerCase().includes('yo mismo') || choice.toLowerCase().includes('solo')) {
        updateSession(userId, { selfBook: true });
        const traveler = session.travelerProfile;
        return res.json({
          phase: 'self_book',
          reply: `¡Perfecto! Acá tenés todo lo que necesitás 👇\n\n🔗 *Link de reserva:*\n${session.bookingUrl}\n\n📧 *Email:* ${traveler.email}\n🔑 *Contraseña:* ${traveler.travelPassword}\n\nEntrá al link, usá ese correo y contraseña, y completá el pago. _Guardá estas credenciales para tus próximos viajes_ 🧳`,
          bookingUrl: session.bookingUrl,
          credentials: { email: traveler.email, password: traveler.travelPassword }
        });
      }

      // Usuario elige que llenemos nosotros — pedir datos extra
      const profile = session.travelerProfile;
      const missing = getMissingExtraField(profile);
      if (missing) {
        return res.json({ phase: 'collecting_extra', field: missing.field, reply: missing.question });
      }
    }

    // ── FASE 5b: Recopilar datos extra y autofill ────────────────
    if (session.choiceMade && !session.extraProfileComplete && !session.selfBook) {
      const profile = session.travelerProfile;
      const missing = getMissingExtraField(profile);

      if (missing) {
        const value = await extractFieldValue(missing.field, msg);
        profile[missing.field] = value;
        updateSession(userId, { travelerProfile: profile });

        const next = getMissingExtraField(profile);
        if (next) {
          return res.json({ phase: 'collecting_extra', field: next.field, reply: next.question });
        }

        // Todos los datos listos — autofill
        updateSession(userId, { extraProfileComplete: true });
        const traveler = createTravelerProfile(profile);

        return res.json({
          phase: 'ready_to_pay',
          reply: `✅ *¡Todo listo ${traveler.firstName}!*\n\nYa llené todos tus datos en el sitio de reserva. Solo falta el pago 💳\n\n🔗 *Link directo al pago:*\n${session.bookingUrl}\n\n📧 *Email:* ${traveler.email}\n🔑 *Contraseña:* ${traveler.travelPassword}\n\n_Guardá estas credenciales para tus próximos viajes_ 🧳`,
          bookingUrl: session.bookingUrl,
          credentials: { email: traveler.email, password: traveler.travelPassword }
        });
      }
    }

    res.json({ reply: '¿En qué más te puedo ayudar con tu viaje? ✈️' });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✈️  Travel Agent v3.0 running on port ${PORT}`);
  console.log(`📍 POST http://localhost:${PORT}/chat`);
});
