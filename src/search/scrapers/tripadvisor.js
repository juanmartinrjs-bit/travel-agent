const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman } = require('../../utils/stealth');

let lastRequest = 0;

// Uses Google search to find top restaurants/activities since TripAdvisor blocks scrapers
async function searchTripAdvisor({ destination }) {
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

    // Search Google for top restaurants in destination
    const query = `best restaurants in ${destination} site:tripadvisor.com OR top things to do ${destination}`;
    const bookingLink = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(destination)}`;
    const googleUrl = `https://www.google.com/search?q=best+restaurants+and+activities+in+${encodeURIComponent(destination)}&hl=en`;

    await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await simulateHuman(page);

    const places = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Google search results for restaurants/places
      const items = document.querySelectorAll('div[data-hveid] h3, .LC20lb, [class*="title"]');
      items.forEach((el, i) => {
        if (i >= 8 || results.length >= 5) return;
        const name = el.textContent?.trim();
        if (!name || name.length > 80 || seen.has(name)) return;
        if (name.toLowerCase().includes('google') || name.toLowerCase().includes('search')) return;
        seen.add(name);

        const snippet = el.closest('[data-hveid]')?.querySelector('.VwiC3b, [class*="snippet"]')?.textContent?.trim();
        results.push({
          name,
          rating: 'See Google',
          type: 'Restaurant/Activity',
          price: 'Check on site',
          description: snippet?.substring(0, 100) || '',
          source: 'Google'
        });
      });

      return results;
    });

    return { source: 'Google (activities)', places, bookingLink };

  } catch (error) {
    return { source: 'Google (activities)', error: error.message, places: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchTripAdvisor };
