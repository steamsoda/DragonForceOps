const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { isolatePrinting } = require('./fixtures/isolated-printing.cjs');
const output = path.resolve('.tmp/checkout-reliability-ui');
let pending, requests, receipts, browser, server, checks = 0;
const check = (ok, name) => { assert.ok(ok, name); checks++; };
const traces = [];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const mock = path.resolve('scripts/fixtures/checkout-reliability-mocks.ts');
  await new Promise((resolve, reject) => require('next/dist/compiled/webpack/webpack').webpack({ mode: 'production', devtool: false, optimization: { minimize: false },
    entry: path.resolve('scripts/fixtures/checkout-reliability-harness.tsx'), output: { path: output, filename: 'fixture.js' },
    resolve: { extensions: ['.tsx','.ts','.js'], alias: { '@/server/actions/caja': mock, '@/lib/printer': mock, '@/components/auth/read-only-controls': mock, '@': path.resolve('src') } },
    module: { rules: [{ test: /\.tsx?$/, use: path.resolve('scripts/fixtures/typescript-loader.cjs') }] },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const css = fs.readdirSync('.next/static/css').filter(f => f.endsWith('.css')).map(f => fs.readFileSync(`.next/static/css/${f}`, 'utf8')).join('\n');
  server = http.createServer((req, res) => {
    if (req.url === '/recovery') { res.setHeader('Content-Type','application/json'); return res.end(JSON.stringify(pending)); }
    if (req.url === '/ack') { pending = null; return res.end('{}'); }
    if (req.url === '/checkout') {
      let text = ''; req.on('data', chunk => text += chunk); req.on('end', () => {
        const data = JSON.parse(text), command = JSON.parse(data.fields.find(([key]) => key === 'explicitCommand')[1]);
        requests.push(command.requestId); const recovered = receipts.has(command.requestId);
        if (!recovered) {
          pending = data;
          receipts.set(command.requestId, { operationId: command.requestId, enrollmentId: command.enrollmentId, actorId: '11111111-1111-4111-8111-111111111111',
            playerName: 'Prueba sintetica', birthYear: 2015, campusName: 'Contry', operatorCampusName: 'Contry', currency: 'MXN',
            occurredAt: '2026-09-23T18:00:00Z', paidAt: '2026-09-23T18:00:00Z', moneyReceived: 700, creditApplied: 0, creditRemaining: 0, pendingChargesTotal: 0,
            lines: [{ key: 'line', description: 'Mensualidad septiembre', moneyReceived: 700, creditApplied: 0, pendingAfter: 0 }],
            payments: [{ id: 'test', folio: 'SYNTHETIC-001', method: 'card', amount: 700 }] });
        }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, recovered, receipt: receipts.get(command.requestId) }));
      }); return;
    }
    if (req.url === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(output,'fixture.js'))); }
    if (req.url === '/fixture.css') { res.setHeader('Content-Type','text/css'); return res.end(css); }
    res.setHeader('Content-Type','text/html'); res.end('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>');
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const width of [1280,390]) {
    pending = null; requests = []; receipts = new Map();
    const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
    await isolatePrinting(context,origin);
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.clock.install(); await page.goto(origin);
    await page.getByRole('button',{name:'Revisar importes'}).click(); await page.getByRole('button',{name:'Confirmar cobro'}).click();
    await page.getByRole('heading',{name:'Cobro registrado'}).waitFor();
    check(await page.getByRole('button',{name:'Cerrar',exact:true}).isEnabled(), 'Saved payment closable while ack/print unresolved');
    check(await page.evaluate(() => window.fixture.saved === 1 && window.fixture.prints === 1 && sessionStorage.length === 1), 'Saved callback happens before ack and recovery retained');
    await page.clock.runFor(31000);
    await page.getByText(/Impresion sin confirmar/).waitFor();
    check(await page.getByRole('button',{name:'Imprimir comprobante'}).isDisabled(), 'Unknown still-live print cannot duplicate');
    check(requests.length === 1 && receipts.size === 1, 'Timer did not retry payment');
    await page.screenshot({path:path.join(output,`unknown-${width}.png`),fullPage:true});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No viewport overflow');
    await page.evaluate(() => window.fixture.ackMode = 'ok');
    await page.getByRole('button',{name:'Reintentar confirmacion'}).click();
    await page.waitForFunction(() => sessionStorage.length === 0);
    await page.evaluate(() => window.fixture.rejectAck());
    check(await page.getByRole('button',{name:'Reintentar confirmacion'}).count() === 0, 'Late failed ack cannot overwrite checked success');
    traces.push({ width, case: 'ack-print-stall', events: await page.evaluate(() => window.fixture.events) });
    await page.getByRole('button',{name:'Cerrar',exact:true}).click();
    await page.evaluate(() => window.fixture.resolvePrint());
    check(await page.getByRole('heading',{name:'Cuenta'}).isVisible() && await page.evaluate(() => window.fixture.prints) === 1, 'Late print completion after close creates no extra job');

    pending = null; requests = []; receipts = new Map(); await page.goto(origin);
    await page.evaluate(() => { window.fixture.ackMode = 'error'; window.fixture.printMode = 'ok'; });
    await page.getByRole('button',{name:'Revisar importes'}).click(); await page.getByRole('button',{name:'Confirmar cobro'}).click();
    await page.getByRole('button',{name:'Reintentar confirmacion'}).waitFor();
    await page.reload(); await page.getByRole('button',{name:'Reintentar mismo cobro'}).waitFor();
    await page.evaluate(() => window.fixture.ackMode = 'ok');
    await page.getByRole('button',{name:'Reintentar mismo cobro'}).click();
    await page.getByRole('heading',{name:'Cobro registrado'}).waitFor();
    await page.waitForFunction(() => sessionStorage.length === 0);
    check(await page.evaluate(() => window.fixture.prints) === 0 && receipts.size === 1 && new Set(requests).size === 1, 'Recovered saved request never auto-prints or creates money twice');
    page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button',{name:'Imprimir comprobante'}).click();
    check(await page.evaluate(() => window.fixture.prints) === 0, 'Recovered print requires explicit duplicate-paper confirmation');
    pending = null; requests = []; receipts = new Map(); await page.goto(origin);
    await page.evaluate(() => { window.fixture.checkoutMode = 'lost'; window.fixture.ackMode = 'ok'; });
    await page.getByRole('button',{name:'Revisar importes'}).click(); await page.getByRole('button',{name:'Confirmar cobro'}).click();
    await page.getByRole('button',{name:'Reintentar mismo cobro'}).waitFor();
    check(await page.getByRole('button',{name:'Cerrar',exact:true}).isDisabled(), 'Ambiguous financial outcome remains locked');
    await page.getByRole('button',{name:'Reintentar mismo cobro'}).click(); await page.getByRole('heading',{name:'Cobro registrado'}).waitFor();
    check(receipts.size === 1 && new Set(requests).size === 1 && await page.evaluate(() => window.fixture.prints) === 0, 'Lost response recovery preserves original request without automatic print');
    check(errors.length === 0, errors.join('\n')); await context.close();
  }
  fs.writeFileSync(path.join(output,'synthetic-traces.json'), JSON.stringify(traces,null,2));
  console.log(`PASS ${checks} isolated desktop/mobile reliability checks. ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); if(server) await new Promise(resolve=>server.close(resolve)); });
