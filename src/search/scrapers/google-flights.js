const { chromium } = require('playwright');

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

    const tripType = return_date ? 'r' : 'o';
    const bookingLink = `https://www.google.com/travel/flights?hl=en&q=flights+from+${encodeURIComponent(origin)}+to+${encodeURIComponent(destination)}+${departure_date}${return_date ? '+return+' + return_date : '+one+way'}`;

    await page.goto(bookingLink, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(4000);

    // Extract flight data from Google Flights
    const flights = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Find all list items that could be flights
      const items = document.querySelectorAll('ul[role="list"] > li, li[class*="pIav2d"]');

      items.forEach((item, i) => {
        if (i >= 6) return;
        const text = item.innerText?.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 20) return;

        // Look for price pattern
        const priceMatch = text.match(/\$[\d,]+|[\d,]+\s*CAD/);
        if (!priceMatch) return;

        const price = priceMatch[0];
        if (seen.has(price + text.substring(0, 30))) return;
        seen.add(price + text.substring(0, 30));

        // Extract airline (usually first word/line)
        const lines = text.split('\n').filter(l => l.trim());
        const airline = lines[0]?.trim() || 'See Google Flights';

        // Extract duration
        const durationMatch = text.match(/\d+\s*hr\s*\d*\s*min|\d+h\s*\d*m/i);
        const duration = durationMatch ? durationMatch[0] : '';

        // Extract stops
        const stopsMatch = text.match(/Nonstop|1 stop|2 stops|\d+ stops/i);
        const stops = stopsMatch ? stopsMatch[0] : '';

        results.push({ price, airline, duration, stops, source: 'Google Flights' });
      });

      return results;
    });

    return { source: 'Google Flights', flights, bookingLink };

  } catch (error) {
    return { source: 'Google Flights', error: error.message, flights: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchGoogleFlights };
