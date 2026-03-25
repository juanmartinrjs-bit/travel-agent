const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

let lastRequest = 0;

async function searchAirbnb({ destination, checkin, checkout, travelers = 1 }) {
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

    const url = `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${checkin}&checkout=${checkout}&adults=${travelers}&price_max=150`;
    const bookingLink = `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000 + Math.floor(Math.random() * 2000));

    const listings = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('[data-testid="card-container"], [itemprop="itemListElement"]');

      cards.forEach((card, i) => {
        if (i >= 5) return;
        const name = card.querySelector('[data-testid="listing-card-title"], [class*="title"]')?.textContent?.trim();
        const price = card.querySelector('[class*="price"], [data-testid="price"]')?.textContent?.trim();
        const rating = card.querySelector('[class*="rating"], [aria-label*="rating"]')?.textContent?.trim();
        const link = card.querySelector('a')?.href;

        if (name && price) {
          results.push({ name, price, rating: rating || 'N/A', link, source: 'Airbnb' });
        }
      });

      return results;
    });

    return { source: 'Airbnb', listings, bookingLink };

  } catch (error) {
    return { source: 'Airbnb', error: error.message, listings: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchAirbnb };
