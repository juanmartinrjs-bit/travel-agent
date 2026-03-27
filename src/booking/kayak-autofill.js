const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman, randomDelay } = require('../utils/stealth');

// Kayak autofill strategy:
// 1. Open Kayak results page
// 2. Click on cheapest/preferred flight → opens airline booking page
// 3. Fill passenger details on airline page
// 4. Stop before payment

async function kayakAutofill({ origin, destination, departure_date, return_date, travelers = 1, traveler, preferredAirline = null }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
      ...getStealthContext(),
      // Accept cookies and popups
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    await injectStealth(context);

    const page = await context.newPage();

    const tripPath = return_date
      ? `${origin}-${destination}/${departure_date}/${return_date}`
      : `${origin}-${destination}/${departure_date}`;

    const kayakUrl = `https://www.kayak.com/flights/${tripPath}/${travelers}adults?sort=price_a`;
    console.log(`🔍 Opening Kayak: ${kayakUrl.substring(0, 60)}`);

    await page.goto(kayakUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await simulateHuman(page);

    // Dismiss any cookie/overlay popups
    await dismissOverlays(page);

    // Wait for flight results to load
    console.log('⏳ Waiting for flight results...');
    await page.waitForTimeout(5000);

    // Find and click the best flight
    const flightClicked = await clickFlight(page, preferredAirline);

    if (!flightClicked) {
      console.log('⚠️ Could not click flight — returning Kayak link');
      return {
        success: false,
        bookingUrl: kayakUrl,
        credentials: { email: traveler.email, password: traveler.travelPassword },
        message: 'Could not auto-select flight. Use the link to book manually.'
      };
    }

    // Handle new tab opening (Kayak often opens airline in new tab)
    await randomDelay(3000, 5000);
    const allPages = context.pages();
    const activePage = allPages[allPages.length - 1];

    if (activePage.url() !== page.url()) {
      console.log('📄 New tab opened:', activePage.url().substring(0, 60));
      await activePage.waitForLoadState('domcontentloaded');
      await simulateHuman(activePage);
    }

    const currentUrl = activePage.url();
    console.log('📍 On page:', currentUrl.substring(0, 60));

    // Try to fill passenger form
    const formFilled = await fillPassengerForm(activePage, traveler);

    return {
      success: true,
      bookingUrl: currentUrl,
      formFilled,
      credentials: {
        email: traveler.email,
        password: traveler.travelPassword
      }
    };

  } catch (error) {
    console.error('Autofill error:', error.message);
    const tripPath = return_date
      ? `${origin}-${destination}/${departure_date}/${return_date}`
      : `${origin}-${destination}/${departure_date}`;
    return {
      success: false,
      bookingUrl: `https://www.kayak.com/flights/${tripPath}/${travelers}adults?sort=price_a`,
      credentials: { email: traveler.email, password: traveler.travelPassword },
      error: error.message
    };
  } finally {
    if (browser) await browser.close();
  }
}

async function dismissOverlays(page) {
  const dismissSelectors = [
    'button:has-text("Accept")', 'button:has-text("OK")',
    'button:has-text("Got it")', 'button:has-text("Close")',
    'button:has-text("Dismiss")', '[aria-label="Close"]',
    'button:has-text("Accept all")', 'button:has-text("I agree")'
  ];
  for (const sel of dismissSelectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 })) {
        await btn.click();
        await randomDelay(500, 1000);
      }
    } catch (e) { /* continue */ }
  }
}

async function clickFlight(page, preferredAirline = null) {
  // Strategy: find the cheapest flight card and click its booking button
  const flightSelectors = [
    '.nrc6-wrapper .booking-link',
    '[class*="ResultWrapper"] a[class*="booking"]',
    'a[class*="provider-button"]',
    'button:has-text("View Deal")',
    'a:has-text("View Deal")',
    'button:has-text("Book")',
    '[class*="flight-result"] a'
  ];

  for (const sel of flightSelectors) {
    try {
      const btns = page.locator(sel);
      const count = await btns.count();
      if (count > 0) {
        const btn = btns.first();
        await btn.scrollIntoViewIfNeeded();
        await randomDelay(500, 1000);
        await btn.click();
        console.log(`✅ Clicked: ${sel}`);
        return true;
      }
    } catch (e) { /* try next */ }
  }

  // Fallback: click anywhere on the first result card
  try {
    const card = page.locator('.nrc6-wrapper, [class*="result-item"]').first();
    if (await card.isVisible({ timeout: 3000 })) {
      await card.click();
      return true;
    }
  } catch (e) { /* failed */ }

  return false;
}

async function fillPassengerForm(page, traveler) {
  let filled = 0;
  const fields = [
    { selectors: ['input[name="firstName"]', 'input[id*="first"]', 'input[placeholder*="First"]', 'input[autocomplete="given-name"]'], value: traveler.firstName },
    { selectors: ['input[name="lastName"]', 'input[id*="last"]', 'input[placeholder*="Last"]', 'input[autocomplete="family-name"]'], value: traveler.lastName },
    { selectors: ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]'], value: traveler.email },
    { selectors: ['input[type="password"]'], value: traveler.travelPassword },
    { selectors: ['input[type="tel"]', 'input[name="phone"]', 'input[autocomplete="tel"]'], value: traveler.phone || '' },
    { selectors: ['input[name*="birth"]', 'input[id*="birth"]', 'input[placeholder*="birth"]'], value: traveler.birthDate || '' },
    { selectors: ['input[name*="passport"]', 'input[id*="passport"]'], value: traveler.passport || '' },
  ];

  for (const field of fields) {
    if (!field.value) continue;
    for (const selector of field.selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 1500 })) {
          await el.click();
          await randomDelay(200, 400);
          await el.fill(field.value);
          await randomDelay(300, 600);
          filled++;
          break;
        }
      } catch (e) { /* continue */ }
    }
  }

  console.log(`👤 Filled ${filled} passenger fields`);
  return filled > 0;
}

module.exports = { kayakAutofill };
