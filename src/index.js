require('dotenv').config();
const express = require('express');
const { extractTravelInfo, generateTravelResponse } = require('./agent/claude');
const { handleConversation, extractFieldValue, getMissingField } = require('./agent/conversation');
const { searchEverything } = require('./search/index');
const { autofillBooking } = require('./booking/autofill');
const { createTravelerProfile, PROFILE_QUESTIONS } = require('./utils/profile');
const { getSession, updateSession } = require('./utils/session');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: '✈️ Travel Agent running', version: '3.0' });
});

app.post('/chat', async (req, res) => {
  const { userId, message } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ error: 'userId and message are required' });
  }

  try {
    const session = getSession(userId);

    // ── FASE 1: Recopilar info del viaje ──────────────────────────
    if (!session.travelInfo || !session.travelInfo.destination) {
      const travelInfo = await extractTravelInfo(message);

      if (!travelInfo || !travelInfo.destination) {
        return res.json({
          phase: 'travel_info',
          reply: `¡Hola! Soy tu agente de viajes personal ✈️\n\nDime a dónde querés viajar, las fechas y tu presupuesto.\n\nEjemplo: *"Quiero ir de Miami a Puerto Rico del 1 al 15 de junio, presupuesto $1000 USD"*`
        });
      }

      updateSession(userId, { travelInfo });

      // Empezar a pedir datos del perfil
      return res.json({
        phase: 'collecting_profile',
        reply: `¡Perfecto! Encontré tu destino: *${travelInfo.destination}* 🎯\n\nAntes de buscar, necesito algunos datos para reservar por vos.\n\n¿Cuál es tu nombre?`,
        field: 'firstName'
      });
    }

    // ── FASE 2: Recopilar perfil del viajero ─────────────────────
    if (!session.profileComplete) {
      const profile = session.travelerProfile || {};
      const missing = getMissingField(profile);

      if (missing) {
        // Guardar el valor que acaba de responder
        const value = await extractFieldValue(missing.field, message);
        profile[missing.field] = value;
        updateSession(userId, { travelerProfile: profile });

        // Ver si falta algo más
        const nextMissing = getMissingField(profile);
        if (nextMissing) {
          return res.json({
            phase: 'collecting_profile',
            field: nextMissing.field,
            reply: nextMissing.question
          });
        }

        // Perfil completo — crear el objeto final
        const traveler = createTravelerProfile(profile);
        updateSession(userId, {
          travelerProfile: traveler,
          profileComplete: true
        });

        return res.json({
          phase: 'searching',
          reply: `¡Perfecto ${traveler.firstName}! 🙌\n\nTus datos están listos. Ahora voy a buscar las mejores opciones para tu viaje...\n\n🔍 Buscando en Google Flights, Kayak, Hotels y más...`,
          traveler: {
            name: traveler.fullName,
            email: traveler.email,
            travelPassword: traveler.travelPassword
          }
        });
      }
    }

    // ── FASE 3: Buscar vuelos y hoteles ──────────────────────────
    if (!session.searchResults) {
      const searchResults = await searchEverything(session.travelInfo);
      updateSession(userId, { searchResults });

      const reply = await generateTravelResponse(session.travelInfo, searchResults);
      updateSession(userId, { searchReply: reply });

      return res.json({
        phase: 'options_presented',
        reply: reply + `\n\n---\n💳 ¿Cuál opción preferís? Respondé con *1*, *2* o *3* y me encargo de dejar todo listo para el pago.`
      });
    }

    // ── FASE 4: Usuario eligió opción → autofill ─────────────────
    if (session.searchResults && session.profileComplete && !session.bookingDone) {
      const choice = message.trim();
      const flights = session.searchResults?.flights;

      let bookingUrl = null;
      if (choice === '1' || choice.toLowerCase().includes('budget') || choice.toLowerCase().includes('1')) {
        bookingUrl = flights?.kayak?.bookingLink || flights?.googleFlights?.bookingLink;
      } else if (choice === '2' || choice.toLowerCase().includes('value') || choice.toLowerCase().includes('2')) {
        bookingUrl = flights?.googleFlights?.bookingLink || flights?.kayak?.bookingLink;
      } else {
        bookingUrl = flights?.googleFlights?.bookingLink || flights?.kayak?.bookingLink;
      }

      const traveler = session.travelerProfile;

      return res.json({
        phase: 'ready_to_pay',
        reply: `✅ *Todo listo ${traveler.firstName}!*\n\n📧 *Correo de viajes:* ${traveler.email}\n🔑 *Contraseña:* ${traveler.travelPassword}\n\n🔗 *Link de reserva:*\n${bookingUrl}\n\n👆 Entrá al link, hacé sign in con ese correo y contraseña, y completá el pago. ¡Todo ya está llenado!\n\n_Guardá este correo y contraseña — los vamos a usar para todos tus viajes futuros_ 🧳`,
        bookingUrl,
        credentials: {
          email: traveler.email,
          password: traveler.travelPassword
        }
      });
    }

    // Fallback
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
