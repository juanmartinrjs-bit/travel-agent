const { chromium } = require('playwright');

// Busca alojamientos en Airbnb
async function searchAirbnb({ destination, checkin, checkout, travelers = 1 }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US'
    });

    const page = await context.newPage();

    const url = `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4000);

    const listings = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('[data-testid="card-container"]');

      cards.forEach((card, i) => {
        if (i >= 6) return;

        const name = card.querySelector('[data-testid="listing-card-title"]')?.textContent?.trim();
        const price = card.querySelector('._tyxjp1')?.textContent?.trim();
        const rating = card.querySelector('._17p6nbba')?.textContent?.trim();
        const type = card.querySelector('[data-testid="listing-card-subtitle"]')?.textContent?.trim();
        const link = card.querySelector('a')?.href;

        if (name && price) {
          results.push({ name, type, price, rating, link, source: 'Airbnb' });
        }
      });

      return results;
    });

    const bookingLink = `https://www.airbnb.com/s/${encodeURIComponent(destination)}/homes?checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;

    return {
      source: 'Airbnb',
      listings,
      bookingLink
    };

  } catch (error) {
    return { source: 'Airbnb', error: error.message, listings: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchAirbnb };
