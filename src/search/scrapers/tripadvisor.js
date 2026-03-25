const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

let lastRequest = 0;

async function searchTripAdvisor({ destination }) {
  const now = Date.now();
  const wait = 8000 - (now - lastRequest);
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

    const url = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(destination + ' restaurants')}`;
    const bookingLink = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(destination)}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4000 + Math.floor(Math.random() * 2000));

    const places = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.result-card, [data-test-target="restaurant-list-item"], [class*="result"]');

      cards.forEach((card, i) => {
        if (i >= 5) return;
        const name = card.querySelector('.result-title, [class*="title"], h3')?.textContent?.trim();
        const rating = card.querySelector('[class*="rating"], [class*="bubble"]')?.textContent?.trim();
        const type = card.querySelector('[class*="cuisine"], [class*="category"]')?.textContent?.trim();
        const price = card.querySelector('[class*="price"]')?.textContent?.trim();

        if (name) {
          results.push({ name, rating: rating || 'N/A', type: type || 'Restaurant', price: price || 'Check on site', source: 'TripAdvisor' });
        }
      });

      return results;
    });

    return { source: 'TripAdvisor', places, bookingLink };

  } catch (error) {
    return { source: 'TripAdvisor', error: error.message, places: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchTripAdvisor };
