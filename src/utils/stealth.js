// Stealth utilities — make the browser look as human as possible

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36 Edg/118.0.2088.76'
];

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 }
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'America/Toronto', 'America/Vancouver', 'America/Edmonton'
];

const LOCALES = ['en-US', 'en-CA', 'en-GB'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min) + min);
}

function randomDelay(min = 1000, max = 4000) {
  return new Promise(r => setTimeout(r, randomInt(min, max)));
}

// Get stealth browser context options
function getStealthContext() {
  return {
    userAgent: randomItem(USER_AGENTS),
    viewport: randomItem(VIEWPORTS),
    locale: randomItem(LOCALES),
    timezoneId: randomItem(TIMEZONES),
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0'
    }
  };
}

// Inject all stealth scripts into page
async function injectStealth(context) {
  await context.addInitScript(() => {
    // 1. Hide webdriver
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // 2. Fake plugins (real browsers have plugins)
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        plugins.refresh = () => {};
        plugins.item = (i) => plugins[i];
        plugins.namedItem = (n) => plugins.find(p => p.name === n);
        plugins.length = plugins.length;
        return plugins;
      }
    });

    // 3. Fake languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });

    // 4. Fix chrome object (headless doesn't have it)
    window.chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {}
    };

    // 5. Fix permissions
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters)
      );
    }

    // 6. Fix iframe contentWindow
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      get: function() {
        return window;
      }
    });

    // 7. Fix screen dimensions
    Object.defineProperty(screen, 'availWidth', { get: () => window.innerWidth });
    Object.defineProperty(screen, 'availHeight', { get: () => window.innerHeight });

    // 8. Spoof hardware concurrency
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });

    // 9. Spoof device memory
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  });
}

// Simulate human mouse movement
async function humanMove(page, x, y) {
  const steps = randomInt(5, 15);
  const startX = randomInt(0, 500);
  const startY = randomInt(0, 400);

  for (let i = 0; i <= steps; i++) {
    const progress = i / steps;
    const currentX = startX + (x - startX) * progress + randomInt(-3, 3);
    const currentY = startY + (y - startY) * progress + randomInt(-3, 3);
    await page.mouse.move(currentX, currentY);
    await randomDelay(20, 80);
  }
}

// Simulate human scroll
async function humanScroll(page, distance = 300) {
  const steps = randomInt(3, 8);
  const stepSize = distance / steps;

  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, stepSize + randomInt(-20, 20));
    await randomDelay(100, 400);
  }
}

// Full human simulation after page load
async function simulateHuman(page) {
  await randomDelay(1500, 3500);

  // Random mouse movement
  await humanMove(page, randomInt(200, 800), randomInt(200, 600));
  await randomDelay(500, 1500);

  // Scroll down slowly
  await humanScroll(page, randomInt(200, 500));
  await randomDelay(1000, 2500);

  // Maybe scroll back up a bit
  if (Math.random() > 0.5) {
    await humanScroll(page, -randomInt(50, 150));
    await randomDelay(500, 1000);
  }
}

module.exports = {
  getStealthContext,
  injectStealth,
  simulateHuman,
  humanMove,
  humanScroll,
  randomDelay,
  randomInt
};
