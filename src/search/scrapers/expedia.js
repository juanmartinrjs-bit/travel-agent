const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

let lastRequest = 0;

async function searchExpedia({ origin, destination, departure_date, return_date, travelers = 1 }) {
  const now = Date.now();
  const wait = 9000 - (now - lastRequest);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      locale: 'en-US',
      viewport: { width: 1280, height: 800 }
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    const tripType = return_date ? 'roundtrip' : 'oneway';
    const url = `https://www.expedia.com/Flights-Search?trip=${tripType}&leg1=from%3A${origin}%2Cto%3A${destination}%2Cdeparture%3A${departure_date}TANYT&passengers=adults%3A${travelers}&mode=search&options=sortby%3Aprice%2Ccabinclass%3Aeconomy`;
    const bookingLink = url;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(6000 + Math.floor(Math.random() * 3000));

    const flights = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      const cards = document.querySelectorAll('[data-test-id="offer-listing"], [class*="uitk-card"]');
      cards.forEach((card, i) => {
        if (i >= 5) return;

        const price = card.querySelector('[data-test-id="price-summary"], [class*="price"]')?.textContent?.trim();
        if (!price || !/\$/.test(price)) return;
        if (seen.has(price)) return;
        seen.add(price);

        const airline = card.querySelector('[data-test-id="airline-name"], [class*="airline"]')?.textContent?.trim();
        const duration = card.querySelector('[data-test-id="journey-duration"], [class*="duration"]')?.textContent?.trim();
        const stops = card.querySelector('[data-test-id="stop-count"], [class*="stop"]')?.textContent?.trim();

        results.push({
          price,
          airline: airline || 'See Expedia',
          duration: duration || '',
          stops: stops || '',
          source: 'Expedia'
        });
      });

      return results;
    });

    return { source: 'Expedia', flights, bookingLink };

  } catch (error) {
    return { source: 'Expedia', error: error.message, flights: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchExpedia };
