const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman, randomDelay, humanMove } = require('../utils/stealth');

// Autofill completo en Kayak:
// 1. Abre el vuelo
// 2. Crea cuenta con email del usuario
// 3. Llena todos los datos del pasajero
// 4. Se detiene justo antes del pago
async function kayakAutofill({ flightUrl, traveler }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext(getStealthContext());
    await injectStealth(context);
    const page = await context.newPage();

    console.log('🤖 Opening Kayak...');
    await page.goto(flightUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await simulateHuman(page);

    // Step 1: Click on the cheapest flight
    const flightBtn = page.locator('[class*="booking-link"], [class*="bookingLink"], button:has-text("View Deal"), a:has-text("Select")').first();
    if (await flightBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await humanMove(page, 400, 300);
      await flightBtn.click();
      await randomDelay(2000, 4000);
    }

    // Step 2: Handle new tab if opened
    const pages = context.pages();
    const activePage = pages[pages.length - 1];
    await activePage.waitForLoadState('domcontentloaded');
    await simulateHuman(activePage);

    const currentUrl = activePage.url();
    console.log('📍 Current page:', currentUrl.substring(0, 60));

    // Step 3: Try to create account or sign in
    const signUpBtn = activePage.locator('button:has-text("Sign up"), a:has-text("Sign up"), button:has-text("Create account")').first();
    const continueGuestBtn = activePage.locator('button:has-text("Continue"), button:has-text("Guest"), button:has-text("No thanks")').first();

    if (await signUpBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('📧 Creating account...');
      await signUpBtn.click();
      await randomDelay(1500, 3000);

      // Fill email
      const emailField = activePage.locator('input[type="email"], input[name="email"], input[placeholder*="email"]').first();
      if (await emailField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await emailField.fill(traveler.email);
        await randomDelay(500, 1000);
      }

      // Fill password
      const passField = activePage.locator('input[type="password"]').first();
      if (await passField.isVisible({ timeout: 3000 }).catch(() => false)) {
        await passField.fill(traveler.travelPassword);
        await randomDelay(500, 1000);
      }

      // Submit
      const submitBtn = activePage.locator('button[type="submit"], button:has-text("Continue"), button:has-text("Create")').first();
      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click();
        await randomDelay(2000, 4000);
      }
    } else if (await continueGuestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await continueGuestBtn.click();
      await randomDelay(1500, 3000);
    }

    // Step 4: Fill passenger details
    console.log('👤 Filling passenger details...');
    await fillPassengerDetails(activePage, traveler);

    // Step 5: Take screenshot of payment page
    await randomDelay(2000, 3000);
    const paymentUrl = activePage.url();
    const screenshot = await activePage.screenshot({ type: 'jpeg', quality: 80, encoding: 'base64' });

    console.log('✅ Reached payment page:', paymentUrl.substring(0, 60));

    return {
      success: true,
      paymentUrl,
      screenshot,
      credentials: {
        email: traveler.email,
        password: traveler.travelPassword
      }
    };

  } catch (error) {
    console.error('Autofill error:', error.message);
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

// Llena el formulario de datos del pasajero
async function fillPassengerDetails(page, traveler) {
  const fields = [
    { selectors: ['input[name="firstName"]', 'input[id*="first"]', 'input[placeholder*="First"]', 'input[placeholder*="first"]'], value: traveler.firstName },
    { selectors: ['input[name="lastName"]', 'input[id*="last"]', 'input[placeholder*="Last"]', 'input[placeholder*="last"]'], value: traveler.lastName },
    { selectors: ['input[name="email"]', 'input[type="email"]', 'input[placeholder*="email"]'], value: traveler.email },
    { selectors: ['input[name="phone"]', 'input[type="tel"]', 'input[placeholder*="phone"]', 'input[placeholder*="Phone"]'], value: traveler.phone || '' },
    { selectors: ['input[name="dateOfBirth"]', 'input[id*="birth"]', 'input[placeholder*="birth"]', 'input[placeholder*="Birth"]'], value: traveler.birthDate || '' },
    { selectors: ['input[name="passport"]', 'input[id*="passport"]', 'input[placeholder*="passport"]', 'input[placeholder*="Passport"]'], value: traveler.passport || '' },
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
          await randomDelay(300, 800);
          break;
        }
      } catch (e) { /* continue */ }
    }
  }
}

module.exports = { kayakAutofill };
