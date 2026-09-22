const fs = require('node:fs'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const root = '.tmp/explicit-cart-ui';
let pending = null, calls = [];
const server = http.createServer((req, res) => {
  if(req.url==='/test-recovery') { res.setHeader('Content-Type','application/json'); if(req.method==='DELETE')pending=null; return res.end(JSON.stringify(pending)); }
  if(req.url==='/test-checkout') {
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      pending=JSON.parse(body); calls.push(pending.fields.find(([key])=>key==='explicitCommand')[1]);
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({calls,uncertain:calls.length===1}));
    });return;
  }
  const file = req.url === '/fixture.js' ? 'fixture.js' : req.url === '/fixture.css' ? 'fixture.css' : null;
  if (!file) { res.setHeader('Content-Type', 'text/html'); return res.end('<link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>'); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css'); res.end(fs.readFileSync(`${root}/${file}`));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1280, 390]) {
      pending=null;calls=[];
      let page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByLabel('Primer pago').waitFor();
      assert.equal(await page.getByLabel('Primer pago').inputValue(), '1300.00');
      assert.equal(await page.getByLabel('Credito para Copa Tigres anticipo').isDisabled(), true);
      await page.getByLabel('Credito para Mensualidad septiembre').fill('200');
      await page.waitForFunction(() => document.querySelector('[aria-label="Primer pago"]').value === '1100.00');
      await page.getByRole('button', { name: 'Revisar importes' }).click();
      await page.screenshot({ path: `${root}/review-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Confirmar cobro' }).click();
      await page.getByRole('button', { name: 'Reintentar mismo cobro' }).waitFor();
      assert.equal(await page.getByLabel('Cerrar', { exact: true }).isDisabled(), true);
      assert.equal(await page.getByLabel('Primer pago').isDisabled(), true);
      await page.reload();
      await page.getByRole('button', { name: 'Reintentar mismo cobro' }).waitFor();
      assert.equal(await page.getByLabel('Primer pago').inputValue(), '1100');
      assert.equal(await page.getByLabel('Primer pago').isDisabled(), true);
      assert.equal(await page.getByLabel('Cerrar', { exact: true }).isDisabled(), true);
      await page.close();
      page = await browser.newPage({viewport:{width,height:900}});
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.getByRole('button', { name: 'Reintentar mismo cobro' }).waitFor();
      assert.equal(await page.evaluate(()=>sessionStorage.length),0);
      await page.getByRole('button', { name: 'Reintentar mismo cobro' }).click();
      await page.getByRole('heading', { name: 'Cobro registrado' }).waitFor();
      const state = await page.evaluate(() => window.fixture);
      assert.equal(state.calls.length, 2); assert.equal(state.calls[0], state.calls[1]);
      assert.equal(JSON.parse(state.calls[0]).payments[0].amount, 1100);
      assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('invicta:explicit-cart:'))), false);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.close();
    }
    console.log('PASS desktop/mobile cart review, explicit credit, Copa denial, reload and fresh-browser recovery, identical retry and saved receipt checks.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
