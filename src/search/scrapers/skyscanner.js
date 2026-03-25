const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

let lastRequest = 0;

async function searchSkyscanner({ origin, destination, departure_date, return_date, travelers = 1 }) {
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

    // Skyscanner URL
    const dep = departure_date?.replace(/-/g, '').substring(2);
    const ret = return_date ? return_date.replace(/-/g, '').substring(2) : null;
    const tripType = ret ? 'return' : 'one-way';
    const url = `https://www.skyscanner.com/transport/flights/${origin.toLowerCase()}/${destination.toLowerCase()}/${dep}${ret ? '/' + ret : ''}/?adults=${travelers}&adultsv2=${travelers}&cabinclass=economy&sortby=price`;
    const bookingLink = url;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(6000 + Math.floor(Math.random() * 3000));

    const flights = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Skyscanner price elements
      const cards = document.querySelectorAll('[class*="FlightsResults_dayViewItems"] > div, [data-testid="itinerary-card"]');
      cards.forEach((card, i) => {
        if (i >= 5) return;
        const priceEl = card.querySelector('[class*="Price_mainPriceContainer"], [data-testid="price"]');
        const price = priceEl?.textContent?.trim();
        if (!price || !/\$/.test(price)) return;
        if (seen.has(price)) return;
        seen.add(price);

        const airline = card.querySelector('[class*="LogoImage"], [class*="carrier"]')?.getAttribute('alt') ||
                        card.querySelector('[class*="airline"]')?.textContent?.trim();
        const duration = card.querySelector('[class*="duration"]')?.textContent?.trim();
        const stops = card.querySelector('[class*="StopsIndicator"], [class*="stops"]')?.textContent?.trim();

        results.push({
          price,
          airline: airline || 'See Skyscanner',
          duration: duration || '',
          stops: stops || '',
          source: 'Skyscanner'
        });
      });

      return results;
    });

    return { source: 'Skyscanner', flights, bookingLink };

  } catch (error) {
    return { source: 'Skyscanner', error: error.message, flights: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchSkyscanner };
