const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman } = require('../../utils/stealth');

let lastRequest = 0;

async function searchAirbnb({ destination, checkin, checkout, travelers = 1 }) {
  const wait = 10000 - (Date.now() - lastRequest);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext(getStealthContext());
    await injectStealth(context);
    const page = await context.newPage();

    const bookingLink = `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;
    await page.goto(bookingLink, { waitUntil: 'networkidle', timeout: 45000 });
    await simulateHuman(page);

    const listings = await page.evaluate(() => {
      const results = [];
      // Try multiple selectors
      const selectors = [
        '[data-testid="card-container"]',
        '[itemprop="itemListElement"]',
        '[class*="listingCard"]',
        '[class*="PropertyCard"]'
      ];

      let cards = [];
      for (const sel of selectors) {
        cards = document.querySelectorAll(sel);
        if (cards.length > 0) break;
      }

      cards.forEach((card, i) => {
        if (i >= 5) return;
        const name = card.querySelector('[data-testid="listing-card-title"], [class*="title"], h3')?.textContent?.trim();
        const priceEl = card.querySelector('[class*="price"], [data-testid="price"], [class*="Price"]');
        const price = priceEl?.textContent?.trim();
        const rating = card.querySelector('[class*="rating"], [aria-label*="rating"], [class*="Rating"]')?.textContent?.trim();
        const link = card.querySelector('a')?.href;

        if (name) results.push({ name, price: price || 'Ver en Airbnb', rating: rating || 'N/A', link, source: 'Airbnb' });
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
