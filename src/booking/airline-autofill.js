const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman, randomDelay, humanMove } = require('../utils/stealth');

// Generic airline autofill — works on most airline booking pages
// Strategy: go to airline site directly, search the flight, fill passenger info
async function airlineAutofill({ origin, destination, departure_date, return_date, travelers = 1, traveler }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext(getStealthContext());
    await injectStealth(context);
    const page = await context.newPage();

    // Detect best airline for route and go direct
    const airlineUrl = getBestAirlineUrl({ origin, destination, departure_date, return_date, travelers });
    console.log('✈️ Going to airline:', airlineUrl.substring(0, 60));

    await page.goto(airlineUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await simulateHuman(page);

    // Fill search form if on search page
    await tryFillSearchForm(page, { origin, destination, departure_date, return_date, travelers });

    // Wait for results and select cheapest
    await randomDelay(3000, 5000);
    await selectCheapestFlight(page);

    // Fill passenger details
    await randomDelay(2000, 3000);
    await fillPassengerDetails(page, traveler);

    const paymentUrl = page.url();
    console.log('✅ At payment page:', paymentUrl.substring(0, 60));

    return {
      success: true,
      paymentUrl,
      credentials: {
        email: traveler.email,
        password: traveler.travelPassword
      }
    };

  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

// Pick best airline URL based on route
function getBestAirlineUrl({ origin, destination, departure_date, return_date, travelers }) {
  const dep = departure_date;
  const ret = return_date;

  // Canada routes → WestJet or Air Canada
  if (['YEG', 'YYC', 'YVR', 'YYZ', 'YUL'].includes(origin)) {
    return `https://www.westjet.com/en-ca/book-trip/index#/air?type=${ret ? 'roundtrip' : 'oneway'}&origin=${origin}&destination=${destination}&departDate=${dep}${ret ? '&returnDate=' + ret : ''}&adults=${travelers}`;
  }

  // Latin America routes → Avianca
  if (['BOG', 'MDE', 'CLO', 'CTG', 'LIM', 'GYE', 'UIO'].includes(destination)) {
    return `https://www.avianca.com/en/booking/search/?type=${ret ? 'RT' : 'OW'}&origin=${origin}&destination=${destination}&outboundDate=${dep}${ret ? '&inboundDate=' + ret : ''}&adults=${travelers}`;
  }

  // Default → Google Flights direct link
  return `https://www.google.com/travel/flights?q=flights+from+${origin}+to+${destination}+${dep}${ret ? '+return+' + ret : '+one+way'}`;
}

async function tryFillSearchForm(page, { origin, destination, departure_date, return_date, travelers }) {
  try {
    // Try origin field
    const originField = page.locator('input[placeholder*="From"], input[placeholder*="Origin"], input[name*="origin"], input[id*="origin"]').first();
    if (await originField.isVisible({ timeout: 3000 })) {
      await originField.fill(origin);
      await randomDelay(500, 1000);
    }

    // Try destination field
    const destField = page.locator('input[placeholder*="To"], input[placeholder*="Destination"], input[name*="destination"], input[id*="destination"]').first();
    if (await destField.isVisible({ timeout: 2000 })) {
      await destField.fill(destination);
      await randomDelay(500, 1000);
    }

    // Try search button
    const searchBtn = page.locator('button[type="submit"], button:has-text("Search"), button:has-text("Find flights")').first();
    if (await searchBtn.isVisible({ timeout: 2000 })) {
      await searchBtn.click();
      await randomDelay(3000, 5000);
    }
  } catch (e) { /* form may not exist */ }
}

async function selectCheapestFlight(page) {
  const selectors = [
    'button:has-text("Select")',
    'button:has-text("Choose")',
    'button:has-text("Book")',
    'a:has-text("Select")',
    '[class*="select-btn"]',
    '[class*="choose"]'
  ];

  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.scrollIntoViewIfNeeded();
        await randomDelay(500, 1000);
        await btn.click();
        await randomDelay(2000, 4000);
        console.log('✅ Selected flight');
        return;
      }
    } catch (e) { /* try next */ }
  }
}

async function fillPassengerDetails(page, traveler) {
  const fields = [
    { selectors: ['input[name="firstName"]', 'input[id*="first"]', 'input[placeholder*="First name"]'], value: traveler.firstName },
    { selectors: ['input[name="lastName"]', 'input[id*="last"]', 'input[placeholder*="Last name"]'], value: traveler.lastName },
    { selectors: ['input[name="email"]', 'input[type="email"]'], value: traveler.email },
    { selectors: ['input[type="password"]'], value: traveler.travelPassword },
    { selectors: ['input[name="phone"]', 'input[type="tel"]'], value: traveler.phone || '' },
    { selectors: ['input[id*="birth"], input[name*="birth"]'], value: traveler.birthDate || '' },
    { selectors: ['input[id*="passport"], input[name*="passport"]'], value: traveler.passport || '' },
  ];

  for (const field of fields) {
    if (!field.value) continue;
    for (const selector of field.selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 1500 })) {
          await el.click();
          await randomDelay(200, 500);
          await el.fill(field.value);
          await randomDelay(300, 700);
          break;
        }
      } catch (e) { /* continue */ }
    }
  }
  console.log('👤 Passenger details filled');
}

module.exports = { airlineAutofill };
