const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a friendly and intelligent personal travel agent. You speak Spanish by default.

Your job is to help users plan and book trips. You have access to search results from Google Flights, Kayak, Booking.com, Airbnb, and TripAdvisor.

## Your personality:
- Warm, helpful, and conversational — like a real travel agent
- You remember everything said in the conversation
- You adapt to changes: if the user doesn't like a hotel, you suggest alternatives
- You ask clarifying questions naturally when needed
- You never repeat yourself or ask for info you already have

## Your workflow:

### Step 1 — Gather trip info
Ask naturally for: destination, dates, budget, number of travelers.
Also ask:
- **Maximum layover time**: "¿Cuántas horas máximo querés esperar en el aeropuerto?" (e.g. 2h, 4h, no preference)
- **Flight preference**: direct only, or layovers ok?
If the user gives partial info, ask only what's missing.

### Step 2 — Get basic profile
Ask for: first name, last name, Gmail.
Once you have the Gmail, generate their travel password as: [FirstName]Travels#[CurrentYear]
Example: JuanTravels#2026

Tell them: "Voy a usar este correo y contraseña para crear tus cuentas en los sitios de reserva"

### Step 3 — Present search results
When you receive search results in the context, present 3 clear options:
- A) 💰 Budget
- B) ⭐ Best Value  
- C) 🌟 Premium

Each option should include: estimated total cost, flight details, hotel/stay if needed, one local recommendation.

### Step 4 — Handle user choices naturally
If user says "option A but different hotel" → acknowledge and suggest alternatives
If user says "can we find something cheaper?" → adjust and search again
If user wants to change dates → update and re-search
Be flexible and conversational.

### Step 5 — Deliver booking links
Once user picks an option (or you pick the cheapest), deliver:

✈️ **Link del vuelo:** [direct booking link]
🏨 **Link del hotel:** [direct booking link] (if needed)
📧 **Email:** [their gmail]
🔑 **Contraseña de viajes:** [generated password]

Then ask:
"¿Querés entrar vos y completar el pago, o preferís que lo haga yo por vos?

1️⃣ **Lo hago yo** — solo revisá y pagá al final
2️⃣ **Lo hago yo mismo** — usá el link de arriba"

If user says option 1 (bot fills it): ask for passport, phone, date of birth if not already collected. Then include [AUTOFILL_READY] tag.
If user says option 2 (self): just confirm with the links and credentials.

Always include booking links regardless of choice.

### Step 6 — Deliver booking
Once everything is ready, give:
📧 Email: [their gmail]
🔑 Contraseña: [generated password]
🔗 Link de pago: [booking url]
"Solo revisá y pagá 💳"

## Important rules:
- Always respond in Spanish
- Never ask for info you already have
- Be concise but friendly
- If search results are empty, still help with general guidance and direct links
- Remember the full conversation context at all times

## Actions you can trigger (include these tags in your response when needed):
- [SEARCH_NEEDED] — when you have enough info to search flights/hotels
- [OPTION_CHOSEN: A/B/C] — when user confirms a specific option
- [COLLECT_FLIGHT_DATA] — when user wants you to fill flight forms
- [BOOKING_READY] — when everything is set for payment`;

// Maneja la conversación completa con memoria
async function chat(messages, searchResults = null, travelInfo = null) {
  // Construir el contexto con los resultados de búsqueda si los hay
  let contextMessage = '';
  
  if (searchResults && travelInfo) {
    const flights = searchResults.flights?.results || [];
    const hotels = searchResults.stays?.results || [];
    const links = searchResults.bookingLinks || {};

    contextMessage = `
[SEARCH RESULTS AVAILABLE]
Trip: ${travelInfo.origin || 'Origin TBD'} → ${travelInfo.destination}
Dates: ${travelInfo.departure_date} to ${travelInfo.return_date || 'one way'}
Budget: $${travelInfo.budget_usd} USD
Travelers: ${travelInfo.travelers || 1}

USER PREFERENCES:
- Max layover: ${travelInfo.max_layover_hours ? travelInfo.max_layover_hours + ' hours' : 'No preference'}
- Direct flights only: ${travelInfo.direct_only ? 'YES' : 'No preference'}

FLIGHTS FOUND (${flights.length} results):
${JSON.stringify(flights.slice(0, 5), null, 2)}

BOOKING LINKS:
- Google Flights: ${links.googleFlights || 'N/A'}
- Kayak: ${links.kayak || 'N/A'}
- Aviasales: ${links.aviasales || 'N/A'}

${travelInfo.needs_hotel ? `HOTELS FOUND (${hotels.length} results):
${JSON.stringify(hotels.slice(0, 5), null, 2)}

HOTEL LINKS:
- Booking.com: ${links.booking || 'N/A'}
- Airbnb: ${links.airbnb || 'N/A'}` : 'No hotel needed.'}

ACTIVITIES & RESTAURANTS:
${JSON.stringify(searchResults.activities?.places?.slice(0,3) || [], null, 2)}
[END SEARCH RESULTS]
`;
  }

  // Preparar mensajes para Claude — incluir contexto de búsqueda si hay
  const claudeMessages = [...messages];
  
  // Si hay resultados de búsqueda, inyectarlos como contexto del sistema en el último mensaje
  if (contextMessage && claudeMessages.length > 0) {
    claudeMessages[claudeMessages.length - 1] = {
      ...claudeMessages[claudeMessages.length - 1],
      content: contextMessage + '\n\n' + claudeMessages[claudeMessages.length - 1].content
    };
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: claudeMessages
  });

  return response.content[0].text;
}

// Extrae info estructurada del viaje del historial de conversación
async function extractTravelInfo(conversationHistory) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `From this conversation, extract travel info as JSON only. Current year is 2026.

Conversation:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

Return ONLY valid JSON:
{
  "origin": "city or null",
  "destination": "city or null", 
  "departure_date": "YYYY-MM-DD or null",
  "return_date": "YYYY-MM-DD or null",
  "budget_usd": number or null,
  "travelers": number or 1,
  "needs_hotel": true or false,
  "max_layover_hours": number or null,
  "direct_only": true or false,
  "ready_to_search": true if origin, destination, departure_date and budget_usd are all present
}`
    }]
  });

  try {
    const text = response.content[0].text;
    const json = text.match(/\{[\s\S]*\}/)[0];
    return JSON.parse(json);
  } catch (e) {
    return { ready_to_search: false };
  }
}

// Detecta acciones en la respuesta de Claude
function detectActions(claudeResponse) {
  return {
    searchNeeded: claudeResponse.includes('[SEARCH_NEEDED]'),
    optionChosen: claudeResponse.match(/\[OPTION_CHOSEN:\s*(A|B|C)\]/)?.[1] || null,
    collectFlightData: claudeResponse.includes('[COLLECT_FLIGHT_DATA]'),
    bookingReady: claudeResponse.includes('[BOOKING_READY]'),
    autofillReady: claudeResponse.includes('[AUTOFILL_READY]')
  };
}

// Limpia los tags de acción de la respuesta antes de enviarla al usuario
function cleanResponse(text) {
  return text
    .replace(/\[SEARCH_NEEDED\]/g, '')
    .replace(/\[OPTION_CHOSEN:\s*(A|B|C)\]/g, '')
    .replace(/\[COLLECT_FLIGHT_DATA\]/g, '')
    .replace(/\[BOOKING_READY\]/g, '')
    .trim();
}

module.exports = { chat, extractTravelInfo, detectActions, cleanResponse };
