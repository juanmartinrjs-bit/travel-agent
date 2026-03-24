const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// Busca hoteles en Google Hotels (agrega Booking, Expedia, Hilton, y miles más)
async function searchGoogleHotels({ destination, checkin, checkout, travelers = 1 }) {
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

    const url = `https://www.google.com/travel/hotels?hl=en&q=hotels+in+${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(4000);

    const hotels = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('[data-hveid] .BcKAgd, .uaTTDe');

      cards.forEach((card, i) => {
        if (i >= 6) return;

        const name = card.querySelector('.BTPx6e, .QT3iQ')?.textContent?.trim();
        const price = card.querySelector('.kixHKb, .qQOQpe')?.textContent?.trim();
        const rating = card.querySelector('.KFi5wf, .lA0BZ')?.textContent?.trim();
        const reviews = card.querySelector('.jdzyld, .RDApEe')?.textContent?.trim();
        const stars = card.querySelector('.KB0k9b')?.textContent?.trim();

        if (name && price) {
          results.push({ name, price, rating, reviews, stars, source: 'Google Hotels' });
        }
      });

      return results;
    });

    const bookingLink = `https://www.google.com/travel/hotels?hl=en&q=hotels+in+${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;

    return {
      source: 'Google Hotels',
      hotels,
      bookingLink
    };

  } catch (error) {
    return { source: 'Google Hotels', error: error.message, hotels: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchGoogleHotels };
