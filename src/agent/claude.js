const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Extrae destino, fechas y budget del mensaje del usuario
async function extractTravelInfo(userMessage) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Extract travel information from this message and return ONLY valid JSON.
Message: "${userMessage}"

Return this exact format:
{
  "origin": "city name or airport code or null",
  "destination": "city name or airport code or null",
  "departure_date": "YYYY-MM-DD or null",
  "return_date": "YYYY-MM-DD or null",
  "budget_usd": number or null,
  "travelers": number (default 1),
  "needs_hotel": true or false
}

If dates are relative like "first week of june" or "second week of june 2026", convert to actual dates.
Current year is 2026.`
    }]
  });

  try {
    const text = response.content[0].text;
    const json = text.match(/\{[\s\S]*\}/)[0];
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

// Genera respuesta amigable con las 3 mejores opciones de viaje
async function generateTravelResponse(travelInfo, searchResults) {
  const context = `
Travel request:
- From: ${travelInfo.origin || 'Not specified'}
- To: ${travelInfo.destination}
- Departure: ${travelInfo.departure_date}
- Return: ${travelInfo.return_date || 'One way'}
- Budget: $${travelInfo.budget_usd} USD
- Travelers: ${travelInfo.travelers}
- Needs hotel: ${travelInfo.needs_hotel}

Search results from multiple sites:

FLIGHTS:
Google Flights: ${JSON.stringify(searchResults.flights?.googleFlights?.flights || [], null, 2)}
Kayak: ${JSON.stringify(searchResults.flights?.kayak?.flights || [], null, 2)}

${travelInfo.needs_hotel ? `STAYS:
Google Hotels: ${JSON.stringify(searchResults.stays?.googleHotels?.hotels || [], null, 2)}
Airbnb: ${JSON.stringify(searchResults.stays?.airbnb?.listings || [], null, 2)}` : ''}

LOCAL ACTIVITIES & RESTAURANTS (TripAdvisor):
${JSON.stringify(searchResults.activities?.places || [], null, 2)}

BOOKING LINKS:
- Google Flights: ${searchResults.flights?.googleFlights?.bookingLink || 'N/A'}
- Kayak: ${searchResults.flights?.kayak?.bookingLink || 'N/A'}
${travelInfo.needs_hotel ? `- Google Hotels: ${searchResults.stays?.googleHotels?.bookingLink || 'N/A'}
- Airbnb: ${searchResults.stays?.airbnb?.bookingLink || 'N/A'}` : ''}
`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: `You are a friendly and efficient travel agent. 
    
Based on the search results from multiple sites, present exactly 3 travel package options:
1. 💰 Budget Option — cheapest combination that fits the budget
2. ⭐ Best Value — best price/quality balance
3. 🌟 Premium Option — best experience within or slightly above budget

For each option include:
- Total estimated cost
- Flight details (airline, duration, stops)
- Hotel/stay if needed (name, price per night)
- One local recommendation (restaurant or activity from TripAdvisor)
- Direct booking links

If search results are empty or have errors, still provide helpful guidance with the booking links.
Be concise, friendly, and practical. Use some emojis but not too many.`,
    messages: [{ role: 'user', content: context }]
  });

  return response.content[0].text;
}

module.exports = { extractTravelInfo, generateTravelResponse };
