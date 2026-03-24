const { searchGoogleFlights } = require('./scrapers/google-flights');
const { searchKayak } = require('./scrapers/kayak');
const { searchGoogleHotels } = require('./scrapers/google-hotels');
const { searchAirbnb } = require('./scrapers/airbnb');
const { searchTripAdvisor } = require('./scrapers/tripadvisor');

// Lanza todas las búsquedas EN PARALELO — mismo tiempo que buscar en uno solo
async function searchEverything({ origin, destination, departure_date, return_date, travelers, needs_hotel, budget_usd }) {

  console.log(`🔍 Searching for: ${origin} → ${destination} | ${departure_date}${return_date ? ' - ' + return_date : ''} | $${budget_usd}`);

  // Lanzar todas las búsquedas al mismo tiempo
  const searches = [
    searchGoogleFlights({ origin, destination, departure_date, return_date, travelers }),
    searchKayak({ origin, destination, departure_date, return_date, travelers }),
  ];

  // Agregar búsquedas de alojamiento si es necesario
  if (needs_hotel && departure_date && return_date) {
    searches.push(
      searchGoogleHotels({ destination, checkin: departure_date, checkout: return_date, travelers }),
      searchAirbnb({ destination, checkin: departure_date, checkout: return_date, travelers })
    );
  }

  // Siempre buscar actividades/restaurantes
  searches.push(searchTripAdvisor({ destination }));

  // Esperar que todas terminen (en paralelo)
  const results = await Promise.allSettled(searches);

  // Organizar resultados
  const [googleFlights, kayak, googleHotels, airbnb, tripadvisor] = results.map(r =>
    r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
  );

  return {
    flights: {
      googleFlights: googleFlights || {},
      kayak: kayak || {}
    },
    stays: needs_hotel ? {
      googleHotels: googleHotels || {},
      airbnb: airbnb || {}
    } : null,
    activities: tripadvisor || {}
  };
}

module.exports = { searchEverything };
