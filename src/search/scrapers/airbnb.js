const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman } = require('../../utils/stealth');

let lastRequest = 0;

async function searchAirbnb({ destination, checkin, checkout, travelers = 1 }) {
  const wait = 15000 - (Date.now() - lastRequest);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();

  // Direct Airbnb link for user to book
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

    // Strategy: search Google for Airbnb listings in destination
    const googleQuery = `airbnb ${destination} ${checkin} to ${checkout} ${travelers} guest`;
    await page.goto(`https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${checkin}&checkout=${checkout}&adults=${travelers}&price_max=200`, {
      waitUntil: 'networkidle',
      timeout: 45000
    });
    await simulateHuman(page);

    const listings = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Try multiple selector strategies
      const cardSelectors = [
        '[data-testid="card-container"]',
        '[itemprop="itemListElement"]',
        '[class*="listingCard"]',
        '[class*="c1l1h97y"]', // Airbnb's obfuscated class
        'div[id*="listing"]'
      ];

      let cards = [];
      for (const sel of cardSelectors) {
        const found = document.querySelectorAll(sel);
        if (found.length > 0) { cards = found; break; }
      }

      // If no cards found, try extracting from page text
      if (cards.length === 0) {
        const priceMatches = document.body.innerText.match(/\$[\d,]+\s*(CAD|USD)?\s*(per night|total|\/night)?/g);
        if (priceMatches) {
          priceMatches.slice(0, 5).forEach((price, i) => {
            results.push({ name: `Airbnb listing ${i+1}`, price, rating: 'N/A', source: 'Airbnb' });
          });
        }
        return results;
      }

      cards.forEach((card, i) => {
        if (i >= 5) return;
        const name = card.querySelector('[data-testid="listing-card-title"], h3, [class*="title"]')?.textContent?.trim()
          || `Airbnb in ${document.title.replace('Airbnb', '').trim()}`;
        const cardText = card.innerText || '';
        const priceMatch = cardText.match(/\$[\d,]+/);
        const price = priceMatch ? priceMatch[0] + ' total' : 'Ver precios';
        const rating = card.querySelector('[class*="rating"]')?.textContent?.trim();
        const link = card.querySelector('a')?.href;

        if (!seen.has(name + price)) {
          seen.add(name + price);
          results.push({ name, price, rating: rating || 'N/A', link, source: 'Airbnb' });
        }
      });

      return results;
    });

    return { source: 'Airbnb', listings, bookingLink };

  } catch (error) {
    // Even if scraping fails, return the booking link
    return { 
      source: 'Airbnb', 
      listings: [],
      bookingLink,
      fallback: true,
      error: error.message 
    };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchAirbnb };
