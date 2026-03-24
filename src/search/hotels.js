const { chromium } = require('playwright');

// Busca hoteles en Booking.com usando Playwright
async function searchHotels({ destination, checkin, checkout, travelers = 1 }) {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Construir URL de búsqueda de Booking.com
    const url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&group_adults=${travelers}&no_rooms=1&order=price`;

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Extraer hoteles listados
    const hotels = await page.evaluate(() => {
      const results = [];
      const cards = document.querySelectorAll('[data-testid="property-card"]');

      cards.forEach((card, i) => {
        if (i >= 5) return; // Solo los primeros 5

        const name = card.querySelector('[data-testid="title"]')?.textContent?.trim();
        const price = card.querySelector('[data-testid="price-and-discounted-price"]')?.textContent?.trim();
        const rating = card.querySelector('[data-testid="review-score"]')?.textContent?.trim();
        const link = card.querySelector('a[data-testid="title-link"]')?.href;

        if (name && price) {
          results.push({ name, price, rating: rating || 'N/A', link });
        }
      });

      return results;
    });

    return { hotels };
  } catch (error) {
    return { error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { searchHotels };
