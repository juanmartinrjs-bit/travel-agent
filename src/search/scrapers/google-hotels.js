const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

let lastRequest = 0;

async function searchGoogleHotels({ destination, checkin, checkout, travelers = 1 }) {
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
      userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
      locale: 'en-US',
      viewport: { width: 1280, height: 800 }
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    const url = `https://www.google.com/travel/hotels?hl=en&q=hotels+in+${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&adults=${travelers}`;
    const bookingLink = url;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(5000 + Math.floor(Math.random() * 2000));

    const hotels = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      document.querySelectorAll('*').forEach(el => {
        if (results.length >= 5) return;
        const text = el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent.trim() : '';
        if (!text || !/\$[\d,]+/.test(text) || seen.has(text)) return;
        seen.add(text);

        const card = el.closest('[data-hveid], [class*="hotel"], li');
        if (!card) return;
        const name = card.querySelector('[class*="name"], h2, h3')?.textContent?.trim();
        const rating = card.querySelector('[class*="rating"], [aria-label*="stars"]')?.textContent?.trim();

        if (name) {
          results.push({ name, price: text, rating: rating || 'N/A', source: 'Google Hotels' });
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
