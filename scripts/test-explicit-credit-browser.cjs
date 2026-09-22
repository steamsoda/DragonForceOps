const assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = path.resolve('.tmp/explicit-credit-ui');
const files = { '/': ['scripts/fixtures/explicit-credit-harness.html', 'text/html'],
  '/fixture.js': [path.join(output, 'fixture.js'), 'text/javascript'], '/fixture.css': [path.join(output, 'fixture.css'), 'text/css'] };
let checks = 0, browser;
const check = (v, label) => { assert.ok(v, label); checks++; };
const server = http.createServer((req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': file[1] }); res.end(fs.readFileSync(file[0]));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const url = `http://127.0.0.1:${server.address().port}/`;
  async function open(suffix = '') {
    await page.goto(url + suffix); await page.getByRole('button', { name: 'Credito de la cuenta', exact: true }).click();
    await page.getByText('Alumno de prueba', { exact: true }).waitFor();
  }
  async function choose(amount = '200') {
    await page.getByRole('checkbox').first().check();
    await page.getByLabel('Credito para Mensualidad septiembre').fill(amount);
  }
  async function fit() {
    check(await page.evaluate(() => {
      const dialog = document.querySelector('dialog'), r = dialog.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth + 1;
    }), 'Dialog fits viewport without horizontal overflow');
  }
  await open();
  check(await page.getByRole('checkbox').first().isChecked() === false, 'Default no selection');
  check(await page.getByRole('button', { name: 'Revisar aplicacion' }).isDisabled(), 'No implicit credit');
  check(await page.getByRole('checkbox').nth(2).isDisabled(), 'Copa cannot be selected');
  await fit(); await page.screenshot({ path: path.join(output, 'desktop.png') });
  await choose('301'); check(await page.getByRole('button', { name: 'Revisar aplicacion' }).isDisabled(), 'Cannot exceed available');
  await page.getByLabel('Credito para Mensualidad septiembre').fill('200');
  await page.getByLabel('Credito para Mensualidad septiembre').press('Enter');
  check(await page.evaluate(() => window.creditTest.calls.length) === 0, 'Enter does not apply credit');
  await page.getByRole('button', { name: 'Revisar aplicacion' }).click();
  check(await page.evaluate(() => window.creditTest.calls.length) === 0, 'Review is not submission');
  await page.evaluate(() => window.creditTest.mode = 'uncertain');
  await page.getByRole('button', { name: 'Confirmar aplicacion', exact: true }).click();
  await page.getByRole('button', { name: 'Reintentar misma operacion' }).waitFor();
  check(await page.getByRole('button', { name: 'Volver', exact: true }).isDisabled(), 'Uncertain command cannot be edited');
  check(await page.getByRole('button', { name: 'Cerrar', exact: true }).isDisabled(), 'Uncertain command not silently dismissed');
  await page.keyboard.press('Escape'); check(await page.locator('dialog').isVisible(), 'Escape preserves uncertain command');
  await page.evaluate(() => window.creditTest.mode = 'success');
  await page.getByRole('button', { name: 'Reintentar misma operacion' }).click();
  await page.getByText('Comprobante de credito', { exact: true }).waitFor();
  check(await page.evaluate(() => JSON.stringify(window.creditTest.calls[0]) === JSON.stringify(window.creditTest.calls[1])), 'Identical retry ID and amounts');
  await page.evaluate(() => window.creditTest.mode = 'print_error');
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
  await page.getByRole('alert').waitFor();
  check(await page.evaluate(() => window.creditTest.calls.length) === 2, 'Print failure does not reapply credit');
  await page.evaluate(() => window.creditTest.mode = 'success');
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
  check(await page.evaluate(() => window.creditTest.printed.length) === 1, 'Print retry works');
  await page.getByRole('button', { name: 'Actualizar cuenta' }).click();
  await page.getByText('Aplicaciones anteriores', { exact: true }).click();
  await page.locator('details li button').first().click();
  await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
  check(await page.evaluate(() => JSON.stringify(window.creditTest.printed[0]) === JSON.stringify(window.creditTest.printed[1])), 'History reprint uses same receipt');

  await open(); await choose(); await page.getByRole('button', { name: 'Revisar aplicacion' }).click();
  await page.evaluate(() => window.creditTest.mode = 'stale');
  await page.getByRole('button', { name: 'Confirmar aplicacion', exact: true }).click();
  await page.getByRole('alert').waitFor();
  check(await page.getByRole('button', { name: 'Confirmar aplicacion', exact: true }).isDisabled(), 'Stale requires new review');
  await page.getByRole('button', { name: 'Actualizar cuenta' }).click();
  check(await page.getByRole('checkbox').first().isChecked() === false, 'Refresh clears old selection');

  await page.setViewportSize({ width: 390, height: 844 }); await open(); await fit();
  await page.screenshot({ path: path.join(output, 'mobile.png') });
  await choose(); await page.getByRole('button', { name: 'Revisar aplicacion' }).click(); await fit();
  await page.screenshot({ path: path.join(output, 'mobile-confirm.png') });
  await open('?readonly'); await choose(); await page.getByRole('button', { name: 'Revisar aplicacion' }).click();
  check(await page.getByRole('button', { name: 'Confirmar aplicacion', exact: true }).isDisabled(), 'Reader explores but cannot confirm');
  check(await page.evaluate(() => window.creditTest.calls.length) === 0, 'Reader sent no mutations');
  check(errors.length === 0, `No browser errors: ${errors.join(',')}`);
  console.log(`PASS ${checks} browser checks. Screenshots: ${output}`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
});
