const { chromium } = require('playwright');

// Busca vuelos en Kayak (compara cientos de aerolíneas)
async function searchKayak({ origin, destination, departure_date, return_date, travelers = 1 }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US'
    });

    const page = await context.newPage();

    // Formato de fecha Kayak: YYYY-MM-DD
    const tripPath = return_date
      ? `${origin}-${destination}/${departure_date}/${return_date}`
      : `${origin}-${destination}/${departure_date}`;

    const url = `https://www.kayak.com/flights/${tripPath}/${travelers}adults?sort=price_a`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000); // Kayak necesita más tiempo para cargar precios

    const flights = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.nrc6-wrapper, .resultWrapper');

      cards.forEach((card, i) => {
        if (i >= 6) return;

        const price = card.querySelector('.f8F1-price-text, .above-button')?.textContent?.trim();
        const airline = card.querySelector('.c_cgF-carrier-text, .codeshares-airline-names')?.textContent?.trim();
        const duration = card.querySelector('.xdW8 .vmXl, .duration')?.textContent?.trim();
        const stops = card.querySelector('.JWEO-stops-text, .stops')?.textContent?.trim();
        const departure = card.querySelector('.depart-time, .time')?.textContent?.trim();
        const arrival = card.querySelector('.arrival-time')?.textContent?.trim();

        if (price && airline) {
          results.push({ price, airline, duration, stops: stops || 'Nonstop', departure, arrival, source: 'Kayak' });
        }
      });

      return results;
    });

    const bookingLink = `https://www.kayak.com/flights/${origin}-${destination}/${departure_date}${return_date ? '/' + return_date : ''}/${travelers}adults?sort=price_a`;

    return {
      source: 'Kayak',
      flights,
      bookingLink
    };

  } catch (error) {
    return { source: 'Kayak', error: error.message, flights: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchKayak };
