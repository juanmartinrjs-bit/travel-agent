const axios = require('axios');

// Travelpayouts API — agrega todas las aerolíneas del mundo
// Token gratis en: travelpayouts.com
const TOKEN = process.env.TRAVELPAYOUTS_TOKEN;

// Convierte nombre de ciudad a código IATA
const CITY_CODES = {
  'edmonton': 'YEG', 'calgary': 'YYC', 'toronto': 'YYZ', 'vancouver': 'YVR',
  'montreal': 'YUL', 'miami': 'MIA', 'new york': 'NYC', 'bogota': 'BOG',
  'medellin': 'MDE', 'cali': 'CLO', 'cartagena': 'CTG', 'cancun': 'CUN',
  'puerto rico': 'SJU', 'san juan': 'SJU', 'mexico city': 'MEX',
  'london': 'LON', 'madrid': 'MAD', 'paris': 'PAR', 'dubai': 'DXB',
  'miami': 'MIA', 'los angeles': 'LAX', 'chicago': 'ORD', 'houston': 'HOU',
  'orlando': 'MCO', 'new york': 'JFK', 'buenos aires': 'BUE', 'lima': 'LIM',
  'quito': 'UIO', 'panama city': 'PTY', 'san jose': 'SJO'
};

function getIATA(city) {
  if (!city) return null;
  const lower = city.toLowerCase();
  // Si ya parece un código IATA (3 letras mayúsculas)
  if (/^[A-Z]{3}$/.test(city)) return city;
  return CITY_CODES[lower] || city.toUpperCase().substring(0, 3);
}

async function searchFlightsTravelpayouts({ origin, destination, departure_date, return_date, travelers = 1, direct_only = false, max_layover_hours = null }) {
  const originCode = getIATA(origin);
  const destCode = getIATA(destination);

  // Si no hay token, devolver vacío con links directos
  if (!TOKEN) {
    return {
      source: 'Travelpayouts',
      flights: [],
      bookingLink: `https://www.aviasales.com/search/${originCode}${departure_date?.replace(/-/g, '').substring(2)}${destCode}1`,
      error: 'No token configured'
    };
  }

  try {
    // Travelpayouts: precios más baratos de los últimos días (cache)
    const depDate = departure_date?.substring(0, 7); // YYYY-MM
    const response = await axios.get('https://api.travelpayouts.com/v1/prices/cheap', {
      params: {
        origin: originCode,
        destination: destCode,
        depart_date: depDate,
        return_date: return_date?.substring(0, 7) || undefined,
        currency: 'usd',
        token: TOKEN
      },
      timeout: 10000
    });

    const data = response.data?.data?.[destCode];
    if (!data) return { source: 'Travelpayouts', flights: [], bookingLink: buildLink(originCode, destCode, departure_date) };

    const flights = Object.values(data).slice(0, 5).map(f => ({
      price: `$${f.price}`,
      airline: f.airline || 'Various airlines',
      departure: f.departure_at,
      stops: f.transfers === 0 ? 'Nonstop' : `${f.transfers} stop(s)`,
      source: 'Travelpayouts'
    }));

    return {
      source: 'Travelpayouts',
      flights,
      bookingLink: buildLink(originCode, destCode, departure_date)
    };

  } catch (error) {
    return { source: 'Travelpayouts', error: error.message, flights: [], bookingLink: buildLink(originCode, destCode, departure_date) };
  }
}

function buildLink(origin, dest, date) {
  const d = date?.replace(/-/g, '').substring(2) || '';
  return `https://www.aviasales.com/search/${origin}${d}${dest}1`;
}

module.exports = { searchFlightsTravelpayouts, getIATA };
