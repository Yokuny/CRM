
const { chromium, firefox, webkit, devices } = require('playwright');
const helpers = require('./lib/helpers');

// Extra headers from environment variables (if configured)
const __extraHeaders = helpers.getExtraHeadersFromEnv();

/**
 * Utility to merge environment headers into context options.
 * Use when creating contexts with raw Playwright API instead of helpers.createContext().
 * @param {Object} options - Context options
 * @returns {Object} Options with extraHTTPHeaders merged in
 */
function getContextOptionsWithHeaders(options = {}) {
  if (!__extraHeaders) return options;
  return {
    ...options,
    extraHTTPHeaders: {
      ...__extraHeaders,
      ...(options.extraHTTPHeaders || {})
    }
  };
}

(async () => {
  try {
    
const browser = await chromium.launch({ headless: false, slowMo: 100 });
const page = await browser.newPage();
await page.goto('http://localhost:5173/auth', { waitUntil: 'networkidle' });
await page.getByLabel('E-mail').fill('demo@teste.local');
await page.getByLabel('Senha').fill('senha12345');
await page.getByRole('button', { name: 'Entrar' }).click();
await page.waitForURL('**/');
await page.goto('http://localhost:5173/customers/list', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/final-list-no-toggle.png', fullPage: true });
await page.goto('http://localhost:5173/customers/kanban', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/final-kanban-no-toggle.png', fullPage: true });
console.log('done');
await browser.close();

  } catch (error) {
    console.error('❌ Automation error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
