const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
];

let lastRequest = 0;

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function searchAviasales({ origin, destination, departure_date, return_date, travelers = 1 }) {
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
      userAgent: randomUA(),
      locale: 'en-US',
      viewport: { width: 1280, height: 800 }
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    // Aviasales URL format
    const dep = departure_date?.replace(/-/g, '').substring(2); // YYMMDD
    const ret = return_date?.replace(/-/g, '').substring(2) || '';
    const url = return_date
      ? `https://www.aviasales.com/search/${origin}${dep}${destination}${ret}${travelers}`
      : `https://www.aviasales.com/search/${origin}${dep}${destination}${travelers}`;

    const bookingLink = url;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000 + Math.floor(Math.random() * 3000));

    const flights = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      // Aviasales price selectors
      const priceEls = document.querySelectorAll('[class*="price"], [data-testid*="price"], .ticket-price');
      priceEls.forEach((el, i) => {
        if (i >= 5) return;
        const text = el.textContent?.trim();
        if (!text || !/\$|USD/.test(text)) return;
        if (seen.has(text)) return;
        seen.add(text);

        const card = el.closest('[class*="ticket"], [class*="result"], [data-testid*="ticket"]');
        const airline = card?.querySelector('[class*="airline"], [class*="carrier"]')?.textContent?.trim();
        const duration = card?.querySelector('[class*="duration"]')?.textContent?.trim();
        const stops = card?.querySelector('[class*="stop"]')?.textContent?.trim();

        results.push({
          price: text,
          airline: airline || 'See Aviasales',
          duration: duration || '',
          stops: stops || '',
          source: 'Aviasales'
        });
      });

      return results;
    });

    return { source: 'Aviasales', flights, bookingLink };

  } catch (error) {
    return { source: 'Aviasales', error: error.message, flights: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchAviasales };
