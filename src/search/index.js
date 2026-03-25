const { searchGoogleFlights } = require('./scrapers/google-flights');
const { searchKayak } = require('./scrapers/kayak');
const { searchFlightsTravelpayouts, getIATA } = require('./scrapers/travelpayouts');
const { searchBookingHotels } = require('./scrapers/booking-api');
const { searchGoogleHotels } = require('./scrapers/google-hotels');
const { searchAirbnb } = require('./scrapers/airbnb');
const { searchTripAdvisor } = require('./scrapers/tripadvisor');

async function searchEverything({ origin, destination, departure_date, return_date, travelers, needs_hotel, budget_usd }) {
  console.log(`🔍 Searching: ${origin} → ${destination} | ${departure_date}${return_date ? ' - ' + return_date : ''} | $${budget_usd}`);

  // ── VUELOS ────────────────────────────────────────────────────
  // Estrategia: Travelpayouts (API, instantáneo) + Google Flights (scraper, real)
  const flightSearches = [];

  // 1. Travelpayouts API (si hay token)
  if (process.env.TRAVELPAYOUTS_TOKEN) {
    flightSearches.push(
      searchFlightsTravelpayouts({ origin, destination, departure_date, return_date, travelers })
        .catch(e => ({ source: 'Travelpayouts', flights: [], error: e.message }))
    );
  }

  // 2. Google Flights (siempre)
  flightSearches.push(
    searchGoogleFlights({ origin, destination, departure_date, return_date, travelers })
      .catch(e => ({ source: 'Google Flights', flights: [], error: e.message }))
  );

  // 3. Kayak (siempre)
  flightSearches.push(
    searchKayak({ origin, destination, departure_date, return_date, travelers })
      .catch(e => ({ source: 'Kayak', flights: [], error: e.message }))
  );



  // ── HOTELES ───────────────────────────────────────────────────
  const hotelSearches = [];
  if (needs_hotel && departure_date && return_date) {
    // 1. Booking API (si hay key)
    if (process.env.BOOKING_API_KEY) {
      hotelSearches.push(
        searchBookingHotels({ destination, checkin: departure_date, checkout: return_date, travelers })
          .catch(e => ({ source: 'Booking.com', hotels: [], error: e.message }))
      );
    }
    // 2. Google Hotels scraper (siempre)
    hotelSearches.push(
      searchGoogleHotels({ destination, checkin: departure_date, checkout: return_date, travelers })
        .catch(e => ({ source: 'Google Hotels', hotels: [], error: e.message }))
    );
    // 3. Airbnb scraper
    hotelSearches.push(
      searchAirbnb({ destination, checkin: departure_date, checkout: return_date, travelers })
        .catch(e => ({ source: 'Airbnb', listings: [], error: e.message }))
    );
  }

  // ── ACTIVIDADES ───────────────────────────────────────────────
  const activitiesSearch = searchTripAdvisor({ destination })
    .catch(e => ({ source: 'TripAdvisor', places: [], error: e.message }));

  // ── CORRER TODO EN PARALELO con timeout global ────────────────
  const timeout = ms => new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );

  const [flightResults, hotelResults, activities] = await Promise.all([
    Promise.race([Promise.all(flightSearches), timeout(50000)]).catch(() => []),
    Promise.race([Promise.all(hotelSearches), timeout(50000)]).catch(() => []),
    Promise.race([activitiesSearch, timeout(30000)]).catch(() => ({ places: [] }))
  ]);

  // Combinar todos los vuelos encontrados
  const allFlights = (flightResults || []).flatMap(r => r.flights || []);
  const allHotels = (hotelResults || []).flatMap(r => r.hotels || r.listings || []);

  // Links de reserva para cada sitio
  const originCode = getIATA(origin);
  const destCode = getIATA(destination);
  const bookingLinks = {
    googleFlights: `https://www.google.com/travel/flights?hl=en&q=flights+from+${encodeURIComponent(origin)}+to+${encodeURIComponent(destination)}+${departure_date}${return_date ? '+return+' + return_date : '+one+way'}`,
    kayak: `https://www.kayak.com/flights/${originCode}-${destCode}/${departure_date}${return_date ? '/' + return_date : ''}/${travelers}adults?sort=price_a`,
    skyscanner: `https://www.skyscanner.com/transport/flights/${originCode.toLowerCase()}/${destCode.toLowerCase()}/${departure_date?.replace(/-/g,'').substring(2)}/?adults=${travelers}&sortby=price`,
    expedia: `https://www.expedia.com/Flights-Search?trip=${return_date ? 'roundtrip' : 'oneway'}&leg1=from%3A${originCode}%2Cto%3A${destCode}%2Cdeparture%3A${departure_date}TANYT&passengers=adults%3A${travelers}&mode=search&options=sortby%3Aprice`,
    booking: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}&checkin=${departure_date}&checkout=${return_date || ''}`,
    airbnb: `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${departure_date}&checkout=${return_date || ''}`,
    aviasales: `https://www.aviasales.com/search/${originCode}${departure_date?.replace(/-/g,'').substring(2)}${destCode}1`
  };

  console.log(`✅ Found: ${allFlights.length} flights, ${allHotels.length} hotels`);

  return {
    flights: {
      results: allFlights,
      sources: (flightResults || []).map(r => r.source),
      bookingLinks
    },
    stays: needs_hotel ? {
      results: allHotels,
      sources: (hotelResults || []).map(r => r.source),
      bookingLinks
    } : null,
    activities,
    bookingLinks
  };
}

module.exports = { searchEverything };
