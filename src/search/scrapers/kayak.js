const { chromium } = require('playwright');

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
];

let lastRequest = 0;

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function searchKayak({ origin, destination, departure_date, return_date, travelers = 1 }) {
  // Throttle 10s entre requests a Kayak
  const now = Date.now();
  const wait = 10000 - (now - lastRequest);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequest = Date.now();

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      userAgent: randomUA(),
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    const tripPath = return_date
      ? `${origin}-${destination}/${departure_date}/${return_date}`
      : `${origin}-${destination}/${departure_date}`;
    const bookingLink = `https://www.kayak.com/flights/${tripPath}/${travelers}adults?sort=price_a`;

    await page.goto(bookingLink, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(7000 + Math.floor(Math.random() * 3000));

    // Scroll suave
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(2000);

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
        const airline = card.querySelector('[class*="carrier-text"], .codeshares-airline-names')?.textContent?.trim();
        const duration = card.querySelector('[class*="duration"], .vmXl')?.textContent?.trim();
        const stops = card.querySelector('[class*="stops-text"]')?.textContent?.trim();

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
