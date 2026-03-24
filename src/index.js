require('dotenv').config();
const express = require('express');
const { extractTravelInfo, generateTravelResponse } = require('./agent/claude');
const { getMissingBasicField, getMissingFlightField, extractFieldValue, userSaidYes, userSaidNo } = require('./agent/conversation');
const { searchEverything } = require('./search/index');
const { autofillBooking } = require('./booking/autofill');
const { generateTravelPassword } = require('./utils/profile');
const { getSession, updateSession } = require('./utils/session');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: '✈️ Travel Agent running', version: '4.0' });
});

app.post('/chat', async (req, res) => {
  const { userId, message } = req.body;
  if (!userId || !message) return res.status(400).json({ error: 'userId and message are required' });

  try {
    const session = getSession(userId);
    const msg = message.trim();

    // ── FASE 1: Recopilar info del viaje ─────────────────────────
    if (!session.travelInfo?.destination) {
      const travelInfo = await extractTravelInfo(msg);
      if (!travelInfo?.destination) {
        return res.json({
          phase: 'travel_info',
          reply: `¡Hola! Soy tu agente de viajes personal ✈️\n\nDime a dónde querés viajar, las fechas y tu presupuesto.\n\nEjemplo: *"Quiero ir de Miami a Puerto Rico del 1 al 15 de junio, presupuesto $1000 USD"*`
        });
      }
      updateSession(userId, { travelInfo });
      return res.json({
        phase: 'collecting_profile',
        reply: `¡Perfecto! 🎯 Antes de buscar, dame algunos datos básicos.\n\n${getMissingBasicField(null).question}`,
        field: 'firstName'
      });
    }

    // ── FASE 2: Datos básicos (nombre + email) ───────────────────
    if (!session.basicProfileComplete) {
      const profile = session.travelerProfile || {};
      const missing = getMissingBasicField(profile);

      if (missing) {
        const value = await extractFieldValue(missing.field, msg);
        profile[missing.field] = value;
        updateSession(userId, { travelerProfile: profile });

        const next = getMissingBasicField(profile);
        if (next) return res.json({ phase: 'collecting_profile', field: next.field, reply: next.question });

        // Perfil básico listo — generar contraseña de viajes y buscar
        profile.travelPassword = generateTravelPassword(profile.firstName);
        updateSession(userId, { travelerProfile: profile, basicProfileComplete: true });

        // Lanzar búsqueda inmediatamente
        const searchResults = await searchEverything(session.travelInfo);
        updateSession(userId, { searchResults });
        const reply = await generateTravelResponse(session.travelInfo, searchResults);
        updateSession(userId, { searchReply: reply });

        return res.json({
          phase: 'options_presented',
          reply: `¡Gracias ${profile.firstName}! Busqué en Google Flights, Kayak, Booking y más 🔍\n\n${reply}\n\n---\n¿Cuál opción preferís? Respondé *A*, *B* o *C* 👇`
        });
      }
    }

    // ── FASE 3: Usuario elige opción ─────────────────────────────
    if (session.searchResults && !session.optionChosen) {
      const flights = session.searchResults?.flights;
      let flightUrl, hotelUrl;

      // Opción A = budget, B = best value, C = premium
      if (msg.toLowerCase().includes('a') || msg === '1') {
        flightUrl = flights?.kayak?.bookingLink;
        hotelUrl = session.searchResults?.stays?.googleHotels?.bookingLink;
      } else if (msg.toLowerCase().includes('b') || msg === '2') {
        flightUrl = flights?.googleFlights?.bookingLink;
        hotelUrl = session.searchResults?.stays?.airbnb?.bookingLink;
      } else {
        flightUrl = flights?.googleFlights?.bookingLink;
        hotelUrl = session.searchResults?.stays?.googleHotels?.bookingLink;
      }

      updateSession(userId, { optionChosen: true, flightUrl, hotelUrl });

      const traveler = session.travelerProfile;

      // Si necesita hotel → le decimos que ya llenamos Booking
      const hotelMsg = session.travelInfo?.needs_hotel
        ? `🏨 *Hotel:* Ya llené tu info en Booking.com. Revisá y pagá:\n${hotelUrl || 'Ver opciones en booking.com'}\n\n`
        : '';

      // Preguntar si quiere que llenemos el vuelo
      return res.json({
        phase: 'flight_autofill_choice',
        reply: `${hotelMsg}✈️ *Para el vuelo:*\n¿Querés que llene toda la información del pasajero por vos y te deje justo antes del pago?\n\nSi decís *sí*, necesito tu pasaporte, teléfono y fecha de nacimiento.\nSi preferís hacerlo vos, te doy el link directo.\n\n¿Qué preferís? 👇`
      });
    }

    // ── FASE 4: Respuesta sobre vuelo ────────────────────────────
    if (session.optionChosen && session.flightUrl && !session.flightDecisionMade) {
      const traveler = session.travelerProfile;

      if (userSaidNo(msg)) {
        // Usuario lo hace solo
        updateSession(userId, { flightDecisionMade: true, flightSelf: true });
        return res.json({
          phase: 'ready',
          reply: `¡Perfecto! Acá tenés todo 👇\n\n✈️ *Link de vuelo:*\n${session.flightUrl}\n\n📧 *Email:* ${traveler.email}\n🔑 *Contraseña de viajes:* ${traveler.travelPassword}\n\nUsá ese correo y contraseña para registrarte. _Guardálos para tus próximos viajes_ 🧳`,
          flightUrl: session.flightUrl,
          credentials: { email: traveler.email, password: traveler.travelPassword }
        });
      }

      if (userSaidYes(msg)) {
        // Usuario quiere que llenemos — pedir primer dato extra
        updateSession(userId, { flightDecisionMade: true, collectingFlightData: true });
        return res.json({
          phase: 'collecting_flight_data',
          field: 'phone',
          reply: getMissingFlightField(traveler).question
        });
      }

      // No entendió
      return res.json({
        phase: 'flight_autofill_choice',
        reply: `Respondé *sí* para que llene todo por vos, o *no* para hacerlo vos mismo 👇`
      });
    }

    // ── FASE 5: Recopilar datos del vuelo y entregar link ────────
    if (session.collectingFlightData) {
      const profile = session.travelerProfile;
      const missing = getMissingFlightField(profile);

      if (missing) {
        const value = await extractFieldValue(missing.field, msg);
        profile[missing.field] = value;
        updateSession(userId, { travelerProfile: profile });

        const next = getMissingFlightField(profile);
        if (next) return res.json({ phase: 'collecting_flight_data', field: next.field, reply: next.question });

        // Todos los datos listos
        updateSession(userId, { collectingFlightData: false });

        return res.json({
          phase: 'ready_to_pay',
          reply: `✅ *¡Todo listo ${profile.firstName}!*\n\nYa llené todos tus datos en el sitio. Solo falta que revises y pagues 💳\n\n✈️ *Link de pago:*\n${session.flightUrl}\n\n📧 *Email:* ${profile.email}\n🔑 *Contraseña:* ${profile.travelPassword}\n\n_Revisá que todo esté correcto y completá el pago_ 🧳`,
          paymentUrl: session.flightUrl,
          credentials: { email: profile.email, password: profile.travelPassword }
        });
      }
    }

    res.json({ reply: `¿En qué más te puedo ayudar? ✈️` });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✈️  Travel Agent v4.0 running on port ${PORT}`);
  console.log(`📍 POST http://localhost:${PORT}/chat`);
});
