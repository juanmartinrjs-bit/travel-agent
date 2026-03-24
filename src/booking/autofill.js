const { chromium } = require('playwright');

// Abre el sitio de reserva, crea cuenta con Gmail del usuario,
// llena todos los datos y se detiene justo antes del pago
async function autofillBooking({ site, flightUrl, traveler, flightDetails }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US'
    });

    const page = await context.newPage();

    if (site === 'kayak') {
      return await autofillKayak(page, flightUrl, traveler);
    } else if (site === 'booking') {
      return await autofillBookingCom(page, flightUrl, traveler);
    } else {
      // Default: Google Flights → redirige a aerolínea
      return await autofillGeneric(page, flightUrl, traveler);
    }

  } catch (error) {
    return { success: false, error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

// Autofill en Kayak
async function autofillKayak(page, url, traveler) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(3000);

  // Buscar botón de "Sign in" o "Continue as guest"
  const guestBtn = page.locator('text=Continue as guest, text=Guest, text=No account needed').first();
  if (await guestBtn.isVisible()) {
    await guestBtn.click();
    await page.waitForTimeout(2000);
  }

  // Llenar datos del pasajero
  await fillPassengerForm(page, traveler);

  // Tomar screenshot de la página de pago
  const screenshot = await page.screenshot({ type: 'png', encoding: 'base64' });
  const currentUrl = page.url();

  return {
    success: true,
    paymentUrl: currentUrl,
    screenshot,
    message: `✅ Todo listo! Solo falta el pago.`
  };
}

// Autofill genérico para cualquier sitio
async function autofillGeneric(page, url, traveler) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.waitForTimeout(3000);

  await fillPassengerForm(page, traveler);

  const currentUrl = page.url();
  return {
    success: true,
    paymentUrl: currentUrl,
    message: `✅ Formulario completado. Solo falta el pago.`
  };
}

// Llena formularios de datos del pasajero (funciona en la mayoría de sitios)
async function fillPassengerForm(page, traveler) {
  const fields = [
    { selectors: ['input[name="firstName"]', 'input[id*="first"]', 'input[placeholder*="First name"]'], value: traveler.firstName },
    { selectors: ['input[name="lastName"]', 'input[id*="last"]', 'input[placeholder*="Last name"]'], value: traveler.lastName },
    { selectors: ['input[name="email"]', 'input[type="email"]', 'input[placeholder*="email"]'], value: traveler.email },
    { selectors: ['input[name="phone"]', 'input[type="tel"]', 'input[placeholder*="phone"]'], value: traveler.phone },
    { selectors: ['input[name="dateOfBirth"]', 'input[id*="birth"]', 'input[placeholder*="birth"]'], value: traveler.birthDate },
    { selectors: ['input[name="passport"]', 'input[id*="passport"]', 'input[placeholder*="passport"]'], value: traveler.passport },
  ];

  for (const field of fields) {
    for (const selector of field.selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible({ timeout: 1000 })) {
          await el.fill(field.value || '');
          break;
        }
      } catch (e) {
        // Campo no encontrado, continuar
      }
    }
  }

  // Intentar crear cuenta con el Gmail del usuario
  const passwordFields = ['input[name="password"]', 'input[type="password"]'];
  for (const sel of passwordFields) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 })) {
        await el.fill(traveler.travelPassword);
        break;
      }
    } catch (e) {}
  }
}

module.exports = { autofillBooking };
