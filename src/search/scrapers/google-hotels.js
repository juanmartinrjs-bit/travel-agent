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

      // Google Hotels renders hotel name in h2/h3, price nearby in text
      const headings = document.querySelectorAll('h2, h3');

      headings.forEach(h => {
        if (results.length >= 6) return;
        const name = h.textContent?.trim();
        if (!name || name.length > 100 || name.length < 3) return;
        if (seen.has(name)) return;
        if (name.toLowerCase().includes('sponsored') || name.toLowerCase().includes('filter')) return;

        // Look for price in surrounding text
        const parent = h.closest('li, [role="listitem"], div[data-hveid]') || h.parentElement?.parentElement;
        if (!parent) return;

        const parentText = parent.innerText || '';
        const priceMatch = parentText.match(/\$[\d,]+/);
        const ratingMatch = parentText.match(/(\d+\.\d+)\/5|(\d+\.\d+)\s*\(/);
        const starsMatch = parentText.match(/(\d+)-star/);

        if (priceMatch || results.length < 3) {
          seen.add(name);
          results.push({
            name,
            price: priceMatch ? priceMatch[0] + ' per night' : 'Check on site',
            rating: ratingMatch ? ratingMatch[1] || ratingMatch[2] : 'N/A',
            stars: starsMatch ? starsMatch[1] + ' stars' : '',
            source: 'Google Hotels'
          });
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
