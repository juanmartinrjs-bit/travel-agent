const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

async function searchGoogleFlights({ origin, destination, departure_date, return_date, travelers = 1 }) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const searchUrl = `https://www.google.com/travel/flights?hl=en&q=flights+from+${encodeURIComponent(origin)}+to+${encodeURIComponent(destination)}+${departure_date}${return_date ? '+return+' + return_date : '+one+way'}`;
    const bookingLink = searchUrl;

    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await new Promise(r => setTimeout(r, 5000));

    const flights = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Google Flights renders prices in various ways — grab all price-like text
      document.querySelectorAll('*').forEach(el => {
        if (results.length >= 6) return;
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3
          ? el.textContent.trim() : '';
        if (!text) return;
        if (!/\$[\d,]+/.test(text) && !/[\d,]+\s*CAD/.test(text)) return;
        if (seen.has(text)) return;
        seen.add(text);

        const card = el.closest('li, [role="listitem"], [jsname]');
        if (!card) return;
        const cardText = card.innerText?.replace(/\s+/g, ' ').trim().substring(0, 250);
        results.push({ price: text, details: cardText, source: 'Google Flights' });
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
