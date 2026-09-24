const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve('.tmp/credit-payment-choice-ui');
let server, browser, checks = 0;
function check(ok, name) { assert.ok(ok, name); checks++; }
(async () => {
  fs.mkdirSync(output, { recursive: true });
  await new Promise((resolve, reject) => require('next/dist/compiled/webpack/webpack').webpack({
    mode: 'production', devtool: false, optimization: { minimize: false }, entry: path.resolve('scripts/fixtures/credit-payment-choice-harness.tsx'),
    output: { path: output, filename: 'fixture.js' }, resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': path.resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, use: path.resolve('scripts/fixtures/typescript-loader.cjs') }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const css = fs.readdirSync('.next/static/css').filter(name => name.endsWith('.css')).map(name => fs.readFileSync(`.next/static/css/${name}`, 'utf8')).join('\n');
  server = http.createServer((req, res) => {
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(output, 'fixture.js'))); }
    if (req.url === '/fixture.css') { res.setHeader('Content-Type', 'text/css'); return res.end(css); }
    res.setHeader('Content-Type', 'text/html');
    res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await context.routeWebSocket('**/*', socket => socket.close());
    const page = await context.newPage();
    await page.goto(origin);
    const button = page.getByRole('button', { name: 'Usar crédito', exact: true });
    await button.waitFor();
    async function set(state) { await page.evaluate(value => window.fixture.update(value), state); }
    for (const available of [null, 0, -1]) {
      await set({ available });
      await page.waitForFunction(() => document.querySelector('button').disabled);
      check(await button.isDisabled(), 'Unknown, zero or invalid availability is disabled');
      await button.evaluate(el => el.click());
      check(await page.evaluate(() => window.fixture.clicks) === 0, 'Disabled control cannot choose credit');
    }
    await set({ available: 900 });
    await page.waitForFunction(() => !document.querySelector('button').disabled);
    check((await page.locator('main').innerText()).includes('$900.00'), 'Authoritative positive amount is displayed');
    await button.click();
    check(await page.evaluate(() => window.fixture.clicks) === 1, 'Positive credit is explicitly selected once');
    await set({ available: null });
    await page.waitForFunction(() => document.querySelector('button').disabled);
    check((await page.locator('main').innerText()).includes('Por confirmar'), 'Refresh clears stale positive availability');
    await set({ available: 900, readOnly: true });
    check(await button.isDisabled(), 'Read-only role remains unable to choose credit');
    await set({ available: 900, disabled: true });
    check(await button.isDisabled(), 'Other checkout locks are preserved');
    await set({ available: 0 });
    await page.getByText('$0.00', { exact: true }).waitFor();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No desktop/mobile overflow');
    await page.screenshot({ path: path.join(output, `zero-${width}.png`) });
    await context.close();
  }
  const source = fs.readFileSync('src/components/caja/caja-client.tsx', 'utf8');
  check(source.includes('? "Cobrar"') && !source.includes('"Cobrar carrito"'), 'Selected cart command is Cobrar');
  const control = source.indexOf('<CreditPaymentChoice');
  check(control > source.indexOf('<MethodToggleGroup value={paymentMethod}') && control < source.indexOf('{allowedCampuses.length > 1'), 'Credit choice is in the Metodo area');
  check(source.includes('if (useCredit && (availableCredit === null || availableCredit <= 0)) return;'), 'Credit handler also blocks unresolved/zero balance');
  console.log(`PASS ${checks} credit-choice desktop/mobile, loading, zero, read-only and integration checks.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
