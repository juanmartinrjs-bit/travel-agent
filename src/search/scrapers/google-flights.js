const { chromium } = require('playwright');

// Busca vuelos en Google Flights (agrega TODAS las aerolíneas del mundo)
async function searchGoogleFlights({ origin, destination, departure_date, return_date, travelers = 1 }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US'
    });

    const page = await context.newPage();

    // Construir URL de Google Flights
    const tripType = return_date ? '1' : '2'; // 1=roundtrip, 2=oneway
    let url = `https://www.google.com/travel/flights?hl=en&q=flights+from+${encodeURIComponent(origin)}+to+${encodeURIComponent(destination)}+${departure_date}`;
    if (return_date) url += `+${return_date}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4000);

    // Extraer resultados de vuelos
    const flights = await page.evaluate(() => {
      const results = [];
      const items = document.querySelectorAll('[jsname="IWWDBc"], [jsname="YdtKid"]');

      items.forEach((item, i) => {
        if (i >= 8) return;

        const priceEl = item.querySelector('[data-gs]') || item.querySelector('.YMlIz');
        const airlineEl = item.querySelector('.h1fkLb') || item.querySelector('.Ir0Voe');
        const timeEl = item.querySelectorAll('.zxVSec, .mv1WYe');
        const durationEl = item.querySelector('.AdWm1c.gvkrdb') || item.querySelector('.AdWm1c');
        const stopsEl = item.querySelector('.EfT7Ae span') || item.querySelector('.ogfYpf');

        const price = priceEl?.textContent?.trim();
        const airline = airlineEl?.textContent?.trim();
        const duration = durationEl?.textContent?.trim();
        const stops = stopsEl?.textContent?.trim();

        if (price && airline) {
          results.push({ price, airline, duration, stops: stops || 'Nonstop', source: 'Google Flights' });
        }
      });

      return results;
    });

    // Link directo para reservar
    const bookingLink = `https://www.google.com/travel/flights?hl=en&q=flights+from+${encodeURIComponent(origin)}+to+${encodeURIComponent(destination)}+${departure_date}${return_date ? '+' + return_date : ''}`;

    return {
      source: 'Google Flights',
      flights: flights.length > 0 ? flights : [],
      bookingLink
    };

  } catch (error) {
    return { source: 'Google Flights', error: error.message, flights: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchGoogleFlights };
