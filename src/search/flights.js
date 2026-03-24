// Amadeus API - búsqueda de vuelos en tiempo real
let accessToken = null;
let tokenExpiry = null;

async function getAmadeusToken() {
  // Reusar token si todavía es válido
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const response = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AMADEUS_CLIENT_ID,
      client_secret: process.env.AMADEUS_CLIENT_SECRET
    })
  });

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function searchFlights({ origin, destination, departure_date, return_date, travelers = 1, budget_usd }) {
  try {
    const token = await getAmadeusToken();

    const params = new URLSearchParams({
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: departure_date,
      adults: travelers,
      currencyCode: 'USD',
      max: 10
    });

    if (return_date) params.append('returnDate', return_date);
    if (budget_usd) params.append('maxPrice', budget_usd);

    const response = await fetch(
      `https://test.api.amadeus.com/v2/shopping/flight-offers?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return { error: 'No flights found for those parameters.' };
    }

    // Simplificar los resultados para Claude
    const flights = data.data.slice(0, 6).map(offer => ({
      id: offer.id,
      price: parseFloat(offer.price.total),
      currency: offer.price.currency,
      airline: offer.validatingAirlineCodes?.[0] || 'Unknown',
      stops: offer.itineraries[0].segments.length - 1,
      duration: offer.itineraries[0].duration,
      departure: offer.itineraries[0].segments[0].departure.at,
      arrival: offer.itineraries[0].segments.at(-1).arrival.at,
      bookingLink: `https://www.kayak.com/flights/${origin}-${destination}/${departure_date}${return_date ? '/' + return_date : ''}`
    }));

    return { flights };
  } catch (error) {
    return { error: error.message };
  }
}

module.exports = { searchFlights };
