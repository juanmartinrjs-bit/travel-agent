const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman } = require('../../utils/stealth');

let lastRequest = 0;

async function searchGoogleHotels({ destination, checkin, checkout, travelers = 1 }) {
  const wait = 9000 - (Date.now() - lastRequest);
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

    const bookingLink = `https://www.google.com/travel/hotels?hl=en&q=hotels+in+${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;
    await page.goto(bookingLink, { waitUntil: 'networkidle', timeout: 45000 });
    await simulateHuman(page);

    const hotels = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Look for price patterns near hotel names
      const allText = document.querySelectorAll('h2, h3, [class*="hotel"], [class*="property"]');
      allText.forEach((el, i) => {
        if (i >= 10 || results.length >= 5) return;
        const name = el.textContent?.trim();
        if (!name || name.length > 80 || seen.has(name)) return;

        // Look for price nearby
        const parent = el.closest('li, [role="listitem"], [class*="card"], div[data-hveid]');
        if (!parent) return;

        const priceEl = parent.querySelector('[class*="price"], [class*="Price"], [class*="rate"]');
        const price = priceEl?.textContent?.trim();
        const rating = parent.querySelector('[class*="rating"], [class*="score"]')?.textContent?.trim();

        if (name && price) {
          seen.add(name);
          results.push({ name, price, rating: rating || 'N/A', source: 'Google Hotels' });
        }
      });

      return results;
    });

    return { source: 'Google Hotels', hotels, bookingLink };
  } catch (error) {
    return { source: 'Google Hotels', error: error.message, hotels: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchGoogleHotels };
