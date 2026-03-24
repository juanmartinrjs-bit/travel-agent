const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// Busca restaurantes y actividades top en TripAdvisor
async function searchTripAdvisor({ destination }) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US'
    });

    const page = await context.newPage();

    // Buscar restaurantes top
    const url = `https://www.tripadvisor.com/Search?q=${encodeURIComponent(destination + ' restaurants')}&searchSessionId=&sid=`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(3000);

    const places = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('.result-card, [data-test-target="restaurant-list-item"]');

      cards.forEach((card, i) => {
        if (i >= 5) return;

        const name = card.querySelector('.result-title, .BMQDV')?.textContent?.trim();
        const rating = card.querySelector('.ui_bubble_rating, .jVDab')?.getAttribute('alt') ||
                       card.querySelector('.biGQs')?.textContent?.trim();
        const type = card.querySelector('.result-type, .dlMOJ')?.textContent?.trim();
        const price = card.querySelector('.restaurants-list-ListCell__price--2DGRB, .iPaBr')?.textContent?.trim();

        if (name) {
          results.push({ name, rating, type, price: price || 'Check on site', source: 'TripAdvisor' });
        }
      });

      return results;
    });

    return {
      source: 'TripAdvisor',
      places,
      bookingLink: `https://www.tripadvisor.com/Search?q=${encodeURIComponent(destination)}`
    };

  } catch (error) {
    return { source: 'TripAdvisor', error: error.message, places: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchTripAdvisor };
