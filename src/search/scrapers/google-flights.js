const { chromium } = require('playwright');

// Lista de user agents para rotar
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0'
];

// Último request timestamp para throttling
let lastRequest = 0;

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function randomDelay(min = 2000, max = 5000) {
  return Math.floor(Math.random() * (max - min) + min);
}

async function searchGoogleFlights({ origin, destination, departure_date, return_date, travelers = 1 }) {
  // Throttle: esperar al menos 8 segundos entre requests a Google
  const now = Date.now();
  const timeSinceLast = now - lastRequest;
  if (timeSinceLast < 8000) {
    await new Promise(r => setTimeout(r, 8000 - timeSinceLast));
  }
  lastRequest = Date.now();

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security'
      ]
    });

    const context = await browser.newContext({
      userAgent: randomUA(),
      locale: 'en-US',
      viewport: { width: 1280 + Math.floor(Math.random() * 200), height: 800 + Math.floor(Math.random() * 100) },
      // Ocultar que es un browser automatizado
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"'
      }
    });

    // Ocultar webdriver flag
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    });

    const page = await context.newPage();

    const bookingLink = `https://www.google.com/travel/flights?hl=en&q=flights+from+${encodeURIComponent(origin)}+to+${encodeURIComponent(destination)}+${departure_date}${return_date ? '+return+' + return_date : '+one+way'}`;

    await page.goto(bookingLink, { waitUntil: 'networkidle', timeout: 45000 });

    // Delay aleatorio para simular comportamiento humano
    await page.waitForTimeout(randomDelay(3000, 6000));

    // Scroll suave para simular usuario leyendo
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(randomDelay(1000, 2000));

    const flights = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      const items = document.querySelectorAll('ul[role="list"] > li');
      items.forEach((item, i) => {
        if (i >= 6) return;
        const text = item.innerText?.replace(/\s+/g, ' ').trim();
        if (!text || text.length < 20) return;

        const priceMatch = text.match(/\$[\d,]+/);
        if (!priceMatch) return;

        const price = priceMatch[0];
        if (seen.has(price + text.substring(0, 30))) return;
        seen.add(price + text.substring(0, 30));

        const durationMatch = text.match(/\d+\s*hr\s*\d*\s*min|\d+h\s*\d*m/i);
        const stopsMatch = text.match(/Nonstop|1 stop|2 stops|\d+ stops/i);
        const airlineMatch = text.match(/^([A-Za-z\s,+]+?)(?:\d|$)/m);

        results.push({
          price,
          airline: airlineMatch?.[1]?.trim() || 'See Google Flights',
          duration: durationMatch?.[0] || '',
          stops: stopsMatch?.[0] || '',
          source: 'Google Flights'
        });
      });

      return results;
    });

    return { source: 'Google Flights', flights, bookingLink };

  } catch (error) {
    return { source: 'Google Flights', error: error.message, flights: [] };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchGoogleFlights };
