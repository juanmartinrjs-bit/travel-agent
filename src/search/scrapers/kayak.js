const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

async function searchKayak({ origin, destination, departure_date, return_date, travelers = 1 }) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const tripPath = return_date
      ? `${origin}-${destination}/${departure_date}/${return_date}`
      : `${origin}-${destination}/${departure_date}`;
    const bookingLink = `https://www.kayak.com/flights/${tripPath}/${travelers}adults?sort=price_a`;

    await page.goto(bookingLink, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await new Promise(r => setTimeout(r, 7000));

    const currentUrl = page.url();
    if (currentUrl.includes('captcha') || currentUrl.includes('security')) {
      return { source: 'Kayak', error: 'Blocked', flights: [], bookingLink };
    }

    const flights = await page.evaluate(() => {
      const results = [];

      const cards = document.querySelectorAll('.nrc6-wrapper, .resultWrapper, [class*="result-"]');
      cards.forEach((card, i) => {
        if (i >= 5) return;
        const price = card.querySelector('.f8F1-price-text, [class*="price-text"], .above-button')?.textContent?.trim();
        const airline = card.querySelector('[class*="carrier-text"], [class*="airline"], .codeshares-airline-names')?.textContent?.trim();
        const duration = card.querySelector('[class*="duration"], .vmXl')?.textContent?.trim();
        const stops = card.querySelector('[class*="stops-text"], .JWEO-stops-text')?.textContent?.trim();

        if (price && /\$/.test(price)) {
          results.push({ price, airline: airline || 'See Kayak', duration, stops, source: 'Kayak' });
        }
      });

      return results;
    });

    return { source: 'Kayak', flights, bookingLink };

  } catch (error) {
    return { source: 'Kayak', error: error.message, flights: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchKayak };
