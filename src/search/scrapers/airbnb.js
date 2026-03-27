const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman } = require('../../utils/stealth');

let lastRequest = 0;

async function searchAirbnb({ destination, checkin, checkout, travelers = 1 }) {
  const wait = 12000 - (Date.now() - lastRequest);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();

  const bookingLink = `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext(getStealthContext());
    await injectStealth(context);
    const page = await context.newPage();

    // Use domcontentloaded + manual wait (networkidle times out on Airbnb)
    await page.goto(bookingLink, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);

    const listings = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      const cards = document.querySelectorAll('[data-testid="card-container"]');

      cards.forEach((card, i) => {
        if (i >= 6) return;

        const name = card.querySelector('[data-testid="listing-card-title"]')?.textContent?.trim()
                  || card.querySelector('h3, [class*="title"]')?.textContent?.trim()
                  || 'Airbnb listing';

        // Extract prices from card text — first price is usually per-night or total
        const cardText = card.innerText || '';
        const prices = cardText.match(/\$[\d,]+/g) || [];
        const price = prices[0] ? prices[0] + (prices[1] && prices[1] !== prices[0] ? ` (original: ${prices[1]})` : '') : 'Ver precios';

        // Extract rating
        const ratingMatch = cardText.match(/([\d.]+)\s*\(([\d,]+)\)/);
        const rating = ratingMatch ? `${ratingMatch[1]} (${ratingMatch[2]} reviews)` : 'New';

        // Get direct link
        const link = card.querySelector('a')?.href;

        if (!seen.has(name + price)) {
          seen.add(name + price);
          results.push({ name, price, rating, link, source: 'Airbnb' });
        }
      });

      return results;
    });

    return { source: 'Airbnb', listings, bookingLink };

  } catch (error) {
    return { source: 'Airbnb', listings: [], bookingLink, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchAirbnb };
