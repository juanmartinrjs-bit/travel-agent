const { chromium } = require('playwright');
const { getStealthContext, injectStealth, simulateHuman, randomDelay } = require('../utils/stealth');

// ── AIRLINE URL BUILDERS ──────────────────────────────────────────────────────
// Each airline has a specific URL format for deep-linking into booking

const AIRLINE_URLS = {
  // Canadian carriers
  WestJet: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.westjet.com/en-ca/book-trip/index#/air?type=${return_date ? 'roundtrip' : 'oneway'}&origin=${origin}&destination=${destination}&departDate=${departure_date}${return_date ? '&returnDate=' + return_date : ''}&adults=${travelers}`,

  AirCanada: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.aircanada.com/ca/en/aco/home/book/flights.html#/results?org0=${origin}&dest0=${destination}&departDate0=${departure_date}${return_date ? '&returnDate=' + return_date : ''}&ADT=${travelers}&lang=en-CA`,

  Flair: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://flyflair.com/search?origin=${origin}&destination=${destination}&departure=${departure_date}${return_date ? '&return=' + return_date : ''}&adults=${travelers}`,

  // US carriers
  AmericanAirlines: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.aa.com/booking/search?locale=en_US&pax=1&adult=${travelers}&type=${return_date ? 'roundTrip' : 'oneWay'}&searchType=Normal&cabin=&carriers=AA&slices=[{"orig":"${origin}","origNearby":false,"dest":"${destination}","destNearby":false,"date":"${departure_date}"}]`,

  United: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.united.com/en/us/flight-search/book-a-flight/results/rev?f=${origin}&t=${destination}&d=${departure_date}${return_date ? '&r=' + return_date : ''}&tt=${return_date ? '2' : '1'}&sc=7&px=${travelers}&taxng=1&newHP=True`,

  Delta: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.delta.com/us/en/flight-search/book-a-flight#/air-booking/select-outbound/${origin}/${destination}/${departure_date}/coach/${travelers}/0/0/LOWEST`,

  Spirit: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.spirit.com/book/search?adult=${travelers}&senior=0&children=0&infant=0&origin=${origin}&destination=${destination}&departureDate=${departure_date}${return_date ? '&returnDate=' + return_date : ''}&tripType=${return_date ? 'RT' : 'OW'}`,

  Frontier: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.flyfrontier.com/book/flights?origin=${origin}&destination=${destination}&departureDate=${departure_date}${return_date ? '&returnDate=' + return_date : ''}&adults=${travelers}&tripType=${return_date ? 'roundtrip' : 'oneway'}`,

  // Latin American carriers
  Avianca: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.avianca.com/en/booking/search/?type=${return_date ? 'RT' : 'OW'}&origin=${origin}&destination=${destination}&outboundDate=${departure_date}${return_date ? '&inboundDate=' + return_date : ''}&adults=${travelers}&children=0&infants=0`,

  LATAM: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.latamairlines.com/us/en/flight-offers?origin=${origin}&destination=${destination}&outbound=${departure_date}&adt=${travelers}&chd=0&inf=0&trip=${return_date ? 'RT' : 'OW'}${return_date ? '&inbound=' + return_date : ''}`,

  Copa: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.copaair.com/en/web/us/search-results#origin=${origin}&destination=${destination}&departureDate=${departure_date}${return_date ? '&returnDate=' + return_date : ''}&adults=${travelers}&tripType=${return_date ? 'RT' : 'OW'}`,

  Aeromexico: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://aeromexico.com/en-us/book/flights?origin=${origin}&destination=${destination}&departureDate=${departure_date}${return_date ? '&returnDate=' + return_date : ''}&adults=${travelers}&type=${return_date ? 'roundtrip' : 'oneway'}`,

  // European carriers
  Iberia: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.iberia.com/us/flights/?origin=${origin}&destination=${destination}&departure=${departure_date}${return_date ? '&return=' + return_date : ''}&adults=${travelers}&cabin=N&tripType=${return_date ? 'RT' : 'OW'}`,

  // Middle East
  Emirates: ({ origin, destination, departure_date, return_date, travelers }) =>
    `https://www.emirates.com/us/english/book/flights/?from=${origin}&to=${destination}&depDate=${departure_date}${return_date ? '&retDate=' + return_date : ''}&adult=${travelers}&type=${return_date ? 'R' : 'O'}`,

  // Default fallback — Google Flights
  Default: ({ origin, destination, departure_date, return_date }) =>
    `https://www.google.com/travel/flights?q=flights+from+${origin}+to+${destination}+${departure_date}${return_date ? '+return+' + return_date : '+one+way'}`
};

// Detect which airline to use based on route
function detectAirline(origin, destination) {
  const canadianOrigins = ['YEG', 'YYC', 'YVR', 'YYZ', 'YUL', 'YOW', 'YHZ'];
  const latinDests = ['BOG', 'MDE', 'CLO', 'CTG', 'GYE', 'UIO', 'LIM', 'SCL', 'EZE', 'GRU', 'PTY'];
  const usOrigins = ['MIA', 'JFK', 'LAX', 'ORD', 'DFW', 'ATL', 'IAH', 'MCO'];

  // Canada → Latin America → Avianca (best connectivity)
  if (canadianOrigins.includes(origin) && latinDests.includes(destination)) return 'Avianca';
  // Canada → Canada/US → WestJet
  if (canadianOrigins.includes(origin)) return 'WestJet';
  // US → Latin → Copa or LATAM
  if (usOrigins.includes(origin) && latinDests.includes(destination)) return 'Copa';
  // Puerto Rico routes → American
  if (destination === 'SJU' || origin === 'SJU') return 'AmericanAirlines';
  // Dubai routes → Emirates
  if (destination === 'DXB' || origin === 'DXB') return 'Emirates';
  // Spain routes → Iberia
  if (destination === 'MAD' || origin === 'MAD') return 'Iberia';
  // Mexico → Aeromexico
  if (destination === 'MEX' || origin === 'MEX') return 'Aeromexico';
  // Default
  return 'Default';
}

// Main autofill function
async function airlineAutofill({ origin, destination, departure_date, return_date, travelers = 1, traveler, preferredAirline = null }) {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext(getStealthContext());
    await injectStealth(context);
    const page = await context.newPage();

    // Pick airline
    const airlineName = preferredAirline || detectAirline(origin, destination);
    const urlBuilder = AIRLINE_URLS[airlineName] || AIRLINE_URLS.Default;
    const airlineUrl = urlBuilder({ origin, destination, departure_date, return_date, travelers });

    console.log(`✈️ Opening ${airlineName}: ${airlineUrl.substring(0, 70)}...`);
    await page.goto(airlineUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await simulateHuman(page);

    // Try to select cheapest flight
    await selectCheapestFlight(page);

    // Fill passenger details
    await fillPassengerDetails(page, traveler);

    const paymentUrl = page.url();
    console.log(`✅ Done! Payment page: ${paymentUrl.substring(0, 70)}`);

    return {
      success: true,
      airline: airlineName,
      paymentUrl,
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

async function selectCheapestFlight(page) {
  const selectors = [
    'button:has-text("Select")', 'button:has-text("Choose")',
    'button:has-text("Book")', 'a:has-text("Select")',
    '[class*="select-btn"]', '[class*="book-btn"]',
    'button:has-text("Ver vuelo")', 'button:has-text("Seleccionar")'
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.scrollIntoViewIfNeeded();
        await randomDelay(500, 1000);
        await btn.click();
        await randomDelay(2000, 4000);
        console.log(`✅ Selected flight`);
        return;
      }
    } catch (e) { /* try next */ }
  }
}

async function fillPassengerDetails(page, traveler) {
  const fields = [
    { selectors: ['input[name="firstName"]', 'input[id*="first"]', 'input[placeholder*="First name"]', 'input[placeholder*="Nombre"]'], value: traveler.firstName },
    { selectors: ['input[name="lastName"]', 'input[id*="last"]', 'input[placeholder*="Last name"]', 'input[placeholder*="Apellido"]'], value: traveler.lastName },
    { selectors: ['input[name="email"]', 'input[type="email"]', 'input[placeholder*="email"]'], value: traveler.email },
    { selectors: ['input[type="password"]'], value: traveler.travelPassword },
    { selectors: ['input[name="phone"]', 'input[type="tel"]', 'input[placeholder*="phone"]', 'input[placeholder*="teléfono"]'], value: traveler.phone || '' },
    { selectors: ['input[id*="birth"]', 'input[name*="birth"]', 'input[placeholder*="nacimiento"]'], value: traveler.birthDate || '' },
    { selectors: ['input[id*="passport"]', 'input[name*="passport"]', 'input[placeholder*="pasaporte"]'], value: traveler.passport || '' },
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

// Get list of supported airlines for a route
function getSupportedAirlines(origin, destination) {
  return Object.keys(AIRLINE_URLS).filter(a => a !== 'Default');
}

module.exports = { airlineAutofill, detectAirline, getSupportedAirlines, AIRLINE_URLS };
