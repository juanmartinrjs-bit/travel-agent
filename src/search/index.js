const { searchGoogleFlights } = require('./scrapers/google-flights');
const { searchKayak } = require('./scrapers/kayak');
const { searchGoogleHotels } = require('./scrapers/google-hotels');
const { searchAirbnb } = require('./scrapers/airbnb');
const { searchTripAdvisor } = require('./scrapers/tripadvisor');

// Búsqueda rápida — Kayak para vuelos, Google Hotels para estadías
// Tiempo objetivo: < 40 segundos
async function searchEverything({ origin, destination, departure_date, return_date, travelers, needs_hotel, budget_usd }) {

  console.log(`🔍 Searching for: ${origin} → ${destination} | ${departure_date}${return_date ? ' - ' + return_date : ''} | $${budget_usd}`);

  // Vuelos: solo Kayak (probado, rápido, precios reales)
  const flightSearch = searchKayak({ origin, destination, departure_date, return_date, travelers });

  // Hotel: solo si necesita
  const hotelSearch = (needs_hotel && departure_date && return_date)
    ? searchGoogleHotels({ destination, checkin: departure_date, checkout: return_date, travelers })
    : Promise.resolve(null);

  // Correr en paralelo con timeout de 45s
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Search timeout')), 45000)
  );

  const [flightResult, hotelResult] = await Promise.all([
    Promise.race([flightSearch, timeout]).catch(e => ({ error: e.message, flights: [] })),
    Promise.race([hotelSearch, timeout]).catch(e => ({ error: e.message, hotels: [] }))
  ]);

  // Links de respaldo para los demás sitios
  const backupLinks = {
    googleFlights: `https://www.google.com/travel/flights?q=flights+from+${encodeURIComponent(origin)}+to+${encodeURIComponent(destination)}+${departure_date}`,
    kayak: `https://www.kayak.com/flights/${origin}-${destination}/${departure_date}${return_date ? '/' + return_date : ''}/${travelers}adults?sort=price_a`,
    airbnb: `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${departure_date}&checkout=${return_date || ''}`,
    booking: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}&checkin=${departure_date}&checkout=${return_date || ''}`
  };

  return {
    flights: {
      kayak: flightResult || {},
      googleFlights: { bookingLink: backupLinks.googleFlights, flights: [] }
    },
    stays: needs_hotel ? {
      googleHotels: hotelResult || {},
      airbnb: { bookingLink: backupLinks.airbnb, listings: [] }
    } : null,
    backupLinks,
    activities: { places: [], bookingLink: `https://www.tripadvisor.com/Search?q=${encodeURIComponent(destination)}` }
  };
}

module.exports = { searchEverything };
