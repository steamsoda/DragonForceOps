// Preview-only synthetic checkout. Never connects to a physical printer.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const ref = 'eqefgwdsqabnmpnbpqbq';
const localFast = process.argv.includes('--local-fast');
const fastFlow = localFast || process.argv.includes('--hosted-fast');
const origin = localFast ? 'http://127.0.0.1:3112' : 'https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app';
const prefix = localFast ? process.argv.includes('--split-only') ? '.tmp/fast-pos-split' : '.tmp/fast-pos'
  : fastFlow ? '.tmp/fast-pos-hosted' : '.tmp/checkout-hosted';
const savedHeading = fastFlow ? 'Pago registrado' : 'Cobro registrado';
const env = parseEnv(fs.readFileSync('../director-parity/.env.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
const url = new URL(env.SUPABASE_PREVIEW_DB_URL);
assert.ok(url.hostname === `db.${ref}.supabase.co` || decodeURIComponent(url.username) === `postgres.${ref}`);
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const manifestPath = '.tmp/checkout-hosted-fixture.json';
const purpose = 'checkout_reliability_hosted_preview';
const f = { ref, purpose, runId: randomUUID(), campus: randomUUID(), plan: randomUUID(), player: randomUUID(), enrollment: randomUUID() };
const evidence = { origin, version: require('../package.json').version, checks: [], clientTraces: [], requests: [], signing: [] };
const cookies = [];
let browser, seeded = false, ownsManifest = false, releaseAck;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const check = (value, name) => { assert.ok(value, name); evidence.checks.push(name); console.log('PASS', name); };
const saveManifest = () => fs.writeFileSync(manifestPath, JSON.stringify(f, null, 2));
async function poll(fn, name) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await new Promise(r => setTimeout(r, 200)); }
  throw Error(name);
}
async function splitPayment(page, expectedPayments) {
  await page.getByRole('button', { name: /Dividir pago en dos/ }).click();
  await page.getByRole('spinbutton').nth(0).fill('300');
  await page.getByText('Efectivo', { exact: true }).last().click();
  check(await page.getByRole('spinbutton').nth(1).inputValue() === '400.00', 'Split tender remainder matches displayed total');
  await page.getByRole('button', { name: 'Cobrar todo', exact: true }).click();
  await page.getByRole('heading', { name: savedHeading, exact: true }).waitFor();
  check((await q('select count(*)::int n from payments where enrollment_id=$1', [f.enrollment]))[0].n === expectedPayments, 'One-click split checkout creates exactly two tender payments');
  await poll(async () => (await q("select count(*)::int n from explicit_cart_intents where enrollment_id=$1 and state='pending'", [f.enrollment]))[0].n === 0, 'Split acknowledgement incomplete');
}
async function context(width = 1280) {
  const c = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: 'block' });
  await c.routeWebSocket('**/*', socket => {
    const target = new URL(socket.url());
    if (localFast && target.host === '127.0.0.1:3112' && ['/_next/webpack-hmr', '/_next/hmr'].includes(target.pathname)) socket.connectToServer();
    else socket.close({ code: 1008, reason: 'Test blocks all printer sockets' });
  });
  await c.route('**/qz-tray.js', route => route.abort('blockedbyclient'));
  await c.addInitScript(() => {
    window.__testPrintJobs = [];
    Object.defineProperty(window, 'qz', { writable: false, configurable: false, value: Object.freeze({
      websocket: Object.freeze({ isActive: () => true, connect: async () => { throw Error('Physical printers blocked'); } }),
      configs: Object.freeze({ create: (printer, options) => ({ printer, options }) }),
      print: async (config, items) => {
        window.__testPrintJobs.push(JSON.parse(JSON.stringify({ config, items })));
        if (window.__holdPrint) await new Promise(resolve => { window.__releasePrint = resolve; });
      },
    }) });
  });
  await c.addCookies(cookies.map(({ name, value }) => ({ name, value, domain: new URL(origin).hostname, path: '/', secure: !localFast, sameSite: 'Lax' })));
  const page = await c.newPage();
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => console.error('Browser script:', error.message));
  page.on('requestfailed', request => console.error('Request failed:', new URL(request.url()).pathname, request.failure()?.errorText));
  page.on('response', response => { if (response.request().method() === 'POST' && response.url().startsWith(origin)) console.log('POST response', response.status(), new URL(response.url()).pathname); });
  page.on('console', async msg => {
    if (msg.text().startsWith('[checkout-preparation]')) console.error(msg.text());
    if (!msg.text().startsWith('[checkout-perf]')) return;
    const values = await Promise.all(msg.args().map(arg => arg.jsonValue().catch(() => null)));
    evidence.clientTraces.push(values);
  });
  const starts = new Map();
  page.on('request', request => { if (request.method() === 'POST') starts.set(request, Date.now()); });
  page.on('requestfinished', request => {
    if (starts.has(request) && request.url().startsWith(origin)) evidence.requests.push({ path: new URL(request.url()).pathname, ms: Date.now() - starts.get(request) });
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${origin}/caja?enrollmentId=${f.enrollment}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  try { await page.getByText('Synthetic Hosted checkout', { exact: true }).first().waitFor(); }
  catch (error) { fs.writeFileSync('.tmp/checkout-hosted-failure.txt', await page.locator('body').innerText()); throw error; }
  check(!page.url().includes('/login'), 'Real authenticated Front Desk Caja loads');
  check((await page.locator('body').innerText()).includes(`v${evidence.version}`), 'Hosted page serves the expected release version');
  await page.getByRole('button', { name: 'Mostrar catalogo completo', exact: true })
    .or(page.getByRole('button', { name: 'Mostrar catálogo completo', exact: true }))
    .or(page.getByRole('button', { name: 'Reintentar mismo cobro', exact: true })).waitFor();
  return { c, page };
}
async function seed() {
  await q('begin');
  try {
    // Only fixture seeding suppresses enrollment automation; actual checkout uses normal triggers.
    await q("set local session_replication_role='replica'");
    await q("insert into campuses(id,code,name) values($1,$2,'Synthetic hosted checkout')", [f.campus, `T${f.runId.slice(0, 8)}`]);
    await q("insert into pricing_plans(id,name,plan_code,effective_start) values($1,'Synthetic hosted plan',$2,'2026-01-01')", [f.plan, `TEST_${f.runId}`]);
    await q('insert into pricing_plan_tuition_rules(pricing_plan_id,day_from,day_to,amount) values($1,1,31,700)', [f.plan]);
    await q("insert into pricing_plan_items(pricing_plan_id,charge_type_id,amount) select $1,id,700 from charge_types where code='monthly_tuition'", [f.plan]);
    await q("insert into players(id,first_name,last_name,birth_date) values($1,'Synthetic','Hosted checkout','2015-01-01')", [f.player]);
    await q("insert into enrollments(id,player_id,campus_id,pricing_plan_id,start_date) values($1,$2,$3,$4,'2026-09-01')", [f.enrollment, f.player, f.campus, f.plan]);
    const rows = await q("insert into charges(enrollment_id,charge_type_id,description,amount,currency,status,period_month) select $1,id,'Synthetic September tuition',700,'MXN','pending','2026-09-01' from charge_types where code='monthly_tuition' returning id", [f.enrollment]);
    assert.equal(rows.length, 1); f.charge = rows[0].id;
    await q("insert into user_roles(user_id,role_id,campus_id) select $1,id,$2 from app_roles where code='front_desk'", [f.user, f.campus]);
    if (fastFlow) {
      const payment = (await q("insert into payments(enrollment_id,paid_at,method,amount,currency,status,operator_campus_id,created_by) values($1,now(),'card',900,'MXN','posted',$2,$3) returning id", [f.enrollment, f.campus, f.user]))[0].id;
      await q("insert into enrollment_credits(enrollment_id,campus_id,source_payment_id,source_workflow,original_amount,reason,created_by) values($1,$2,$3,'eligible_payment_remainder',900,'Synthetic fast POS credit',$4)", [f.enrollment, f.campus, payment, f.user]);
    }
    await q('commit'); seeded = true; saveManifest();
  } catch (error) { await q('rollback'); throw error; }
}
async function cleanup() {
  if (!ownsManifest) return;
  releaseAck?.();
  await browser?.close();
  if (seeded) {
    assert.equal((await q('select plan_code from pricing_plans where id=$1', [f.plan]))[0]?.plan_code, `TEST_${f.runId}`);
    await q('begin');
    try {
      await q('delete from explicit_cart_intents where enrollment_id=$1', [f.enrollment]);
      await q('delete from explicit_cart_checkouts where enrollment_id=$1', [f.enrollment]);
      await q('delete from payment_allocations where payment_id in(select id from payments where enrollment_id=$1)', [f.enrollment]);
      await q('delete from enrollment_credit_applications where charge_id in(select id from charges where enrollment_id=$1)', [f.enrollment]);
      await q('delete from enrollment_credits where enrollment_id=$1', [f.enrollment]);
      await q('delete from cash_session_entries where payment_id in(select id from payments where enrollment_id=$1)', [f.enrollment]);
      await q('delete from payments where enrollment_id=$1', [f.enrollment]);
      await q('delete from charges where enrollment_id=$1', [f.enrollment]);
      await q('delete from enrollments where id=$1', [f.enrollment]);
      await q('delete from players where id=$1', [f.player]);
      await q('delete from pricing_plans where id=$1', [f.plan]);
      await q('delete from user_roles where user_id=$1', [f.user]);
      await q('delete from campus_folio_counters where campus_id=$1', [f.campus]);
      await q('delete from campuses where id=$1', [f.campus]);
      await q('delete from audit_logs where actor_user_id=$1', [f.user]);
      await q('commit');
    } catch (error) { await q('rollback'); throw error; }
  }
  if (f.user) {
    const owner = await admin.auth.admin.getUserById(f.user);
    assert.equal(owner.data.user?.app_metadata?.runId, f.runId);
    const result = await admin.auth.admin.deleteUser(f.user); if (result.error) throw result.error;
    assert.equal((await q('select count(*)::int n from auth.users where id=$1', [f.user]))[0].n, 0);
  }
  check((await q('select count(*)::int n from enrollments where id=$1', [f.enrollment]))[0].n === 0, 'Synthetic enrollment and identity removed');
  fs.unlinkSync(manifestPath);
}
(async () => {
  assert.ok(!fs.existsSync(manifestPath), 'Previous fixture requires cleanup before rerun');
  await db.connect(); saveManifest(); ownsManifest = true;
  const email = `hosted-checkout-${f.runId}@fcportodragonforcemty.com`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { purpose, runId: f.runId } });
  assert.ok(!created.error && created.data.user?.id, 'Create temporary identity'); f.user = created.data.user.id; saveManifest();
  await seed(); console.log('Synthetic fixture seeded');
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email }); assert.ok(!link.error);
  const session = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: {
    getAll: () => cookies, setAll: items => { for (const item of items) { const i = cookies.findIndex(c => c.name === item.name); if (i < 0) cookies.push(item); else cookies[i] = item; } },
  } });
  const auth = await session.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' }); assert.ok(!auth.error); console.log('Synthetic Front Desk authenticated');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  let { c, page } = await context();
  await page.getByText('Tarjeta', { exact: true }).click();
  check(await page.getByRole('radio', { name: 'Tarjeta', exact: true }).isChecked(), 'Card payment selected after hydration');
  if (localFast && process.argv.includes('--split-only')) {
    await splitPayment(page, 3);
    return;
  }
  if (fastFlow) {
    check(await page.getByRole('spinbutton').inputValue() === '700.00', 'Fixed amount matches displayed cart on first render');
    await q('update charges set amount=710 where id=$1', [f.charge]);
    await page.getByRole('button', { name: 'Cobrar todo', exact: true }).click();
    await page.getByRole('heading', { name: 'Revisa el cobro', exact: true }).waitFor();
    check((await q('select count(*)::int n from payments where enrollment_id=$1', [f.enrollment]))[0].n === 1, 'Stale displayed amount rejected without payment');
    await q('update charges set amount=700 where id=$1', [f.charge]);
    await page.getByRole('button', { name: 'Regresar al alumno', exact: true }).click();
    await page.getByRole('button', { name: 'Mostrar catálogo completo', exact: true }).waitFor();
    await page.getByText('Tarjeta', { exact: true }).click();
  }
  if (!fastFlow) {
    await page.getByRole('button', { name: 'Cobrar todo', exact: true }).first().click();
    await page.getByRole('button', { name: 'Revisar importes', exact: true }).click();
  }
  await page.evaluate(() => { window.__holdPrint = true; });
  const gate = new Promise(resolve => { releaseAck = resolve; });
  let held = false;
  await page.route('**/caja?*', async route => {
    let body; try { body = JSON.parse(route.request().postData() ?? 'null'); } catch { }
    if (Array.isArray(body) && body.length === 3 && body[0] === f.enrollment) { held = true; await gate; }
    await route.continue();
  });
  const clickStarted = Date.now();
  await page.getByRole('button', { name: fastFlow ? 'Cobrar todo' : 'Confirmar cobro', exact: true }).click();
  await page.getByRole('heading', { name: savedHeading, exact: true }).waitFor();
  evidence.firstClickToSavedMs = Date.now() - clickStarted;
  await page.waitForFunction(() => window.__testPrintJobs.length === 1);
  check(held, 'Acknowledgement held after authoritative financial success');
  check(await page.getByRole('button', { name: fastFlow ? 'Regresar al alumno' : 'Cerrar', exact: true }).isEnabled(), 'Saved payment navigable while acknowledgement and printing remain pending');
  if (fastFlow) {
    check(await page.getByRole('button', { name: 'Revisar importes', exact: true }).count() === 0, 'One submit click; no review or repeated confirmation');
    check(Number((await q('select available_credit_total from v_enrollment_credit_balances where enrollment_id=$1', [f.enrollment]))[0]?.available_credit_total) === 900, 'Unused available credit remains untouched');
    await page.getByRole('button', { name: 'Siguiente alumno', exact: true }).click();
    await page.getByRole('button', { name: /Ultimo comprobante/ }).waitFor();
    await page.getByRole('button', { name: /Ultimo comprobante/ }).click();
    check(await page.evaluate(() => window.__testPrintJobs.length === 1), 'Navigation preserves prior pending print without automatic duplicate');
  }
  const jobs = await page.evaluate(() => window.__testPrintJobs);
  fs.writeFileSync(`${prefix}-print-capture.json`, JSON.stringify(jobs, null, 2));
  const raw = jobs[0].items.map(item => item.format === 'base64' ? Buffer.from(item.data, 'base64').toString('utf8') : item.data ?? '').join('');
  check(raw.includes('2015') && raw.includes('Synthetic September tuition') && raw.includes('DINERO RECIBIDO'), 'Hosted compact receipt includes category, concept and money');
  check(raw.includes('COPIA ACADEMIA') && raw.includes('COPIA CLIENTE'), 'Both compact receipt copies captured');
  await page.screenshot({ path: `${prefix}-saved.png`, fullPage: true });
  releaseAck(); await page.evaluate(() => window.__releasePrint?.());
  await poll(async () => (await q("select count(*)::int n from explicit_cart_intents where enrollment_id=$1 and state='completed'", [f.enrollment]))[0].n === 1, 'Acknowledgement did not complete');
  check((await q('select count(*)::int n from payments where enrollment_id=$1', [f.enrollment]))[0].n === (fastFlow ? 2 : 1), 'First checkout creates exactly one payment');
  await c.close();
  ({ c, page } = await context());
  await page.getByRole('button', { name: 'Agregar al cobro', exact: true }).click();
  await page.getByText('Tarjeta', { exact: true }).click();
  if (!fastFlow) {
    await page.getByRole('button', { name: /^(Cobrar carrito|Cobro actual)$/ }).first().click();
    await page.getByRole('button', { name: 'Revisar importes', exact: true }).click();
  }
  let dropped = false;
  await page.route('**/caja?*', async route => {
    if (!dropped && route.request().method() === 'POST' && (route.request().postData() ?? '').includes('explicitCommand')) {
      dropped = true;
      // Concurrent identical requests must resolve to one durable financial operation.
      await Promise.all([route.fetch(), route.fetch()]);
      await route.abort('failed');
    } else await route.continue();
  });
  await page.getByRole('button', { name: fastFlow ? 'Cobrar' : 'Confirmar cobro', exact: true }).click();
  await page.getByRole('button', { name: 'Reintentar mismo cobro', exact: true }).waitFor();
  check(dropped, 'Committed new-tuition response lost with concurrent identical request');
  check((await q('select count(*)::int n from payments where enrollment_id=$1', [f.enrollment]))[0].n === (fastFlow ? 3 : 2), 'Concurrent new-tuition checkout adds one payment only');
  await c.close();
  ({ c, page } = await context(390));
  await page.getByRole('button', { name: 'Reintentar mismo cobro', exact: true }).click();
  await page.getByRole('heading', { name: savedHeading, exact: true }).waitFor();
  check(await page.evaluate(() => window.__testPrintJobs.length === 0), 'Fresh-browser recovery does not automatically reprint');
  check((await q('select count(*)::int n from payments where enrollment_id=$1', [f.enrollment]))[0].n === (fastFlow ? 3 : 2), 'Recovery creates no additional payment');
  await page.getByRole('button', { name: 'Imprimir comprobante', exact: true }).click();
  await page.waitForFunction(() => window.__testPrintJobs.length === 1);
  check(true, 'Recovered receipt prints only on explicit confirmed request');
  await page.screenshot({ path: `${prefix}-recovered-mobile.png`, fullPage: true });
  if (fastFlow) {
    for (const credit of [200, 700]) {
      await page.getByRole('button', { name: 'Regresar al alumno', exact: true }).click();
      await page.getByRole('button', { name: 'Agregar al cobro', exact: true }).click();
      await page.getByText('Tarjeta', { exact: true }).click();
      await page.getByRole('button', { name: 'Usar crédito', exact: true }).click();
      await page.locator('input[aria-label^="Credito para"]').first().fill(String(credit));
      await page.getByRole('button', { name: 'Revisar importes', exact: true }).click();
      const creditStarted = Date.now();
      await page.getByRole('button', { name: 'Confirmar cobro', exact: true }).click();
      await page.getByRole('heading', { name: savedHeading, exact: true }).waitFor();
      (evidence.creditClickToSaved ??= []).push({ credit, ms: Date.now() - creditStarted });
      await poll(async () => (await q("select count(*)::int n from explicit_cart_intents where enrollment_id=$1 and state='pending'", [f.enrollment]))[0].n === 0, 'Credit acknowledgement incomplete');
      check(Number((await q('select sum(amount) n from enrollment_credit_applications where charge_id in(select id from charges where enrollment_id=$1)', [f.enrollment]))[0].n) === (credit === 200 ? 200 : 900), 'Explicit selected credit applied correctly');
      check((await q('select count(*)::int n from payments where enrollment_id=$1', [f.enrollment]))[0].n === 4, 'Mixed credit creates 500 payment; credit-only creates no payment');
    }
    await q("insert into charges(enrollment_id,charge_type_id,description,amount,currency,status) select $1,id,'Synthetic split tuition',700,'MXN','pending' from charge_types where code='monthly_tuition'", [f.enrollment]);
    await page.getByRole('button', { name: 'Regresar al alumno', exact: true }).click();
    await page.getByText('Tarjeta', { exact: true }).click();
    check(await page.getByRole('button', { name: 'Usar crédito', exact: true }).isDisabled(), 'Zero available credit cannot enter the credit flow');
    await splitPayment(page, 6);
    return;
  }
  const trace = randomUUID();
  evidence.signing.push(await page.evaluate(async ({ trace }) => {
    const start = performance.now();
    const response = await fetch('/api/sign-qz', { method: 'POST', headers: { 'content-type': 'application/json', 'x-checkout-trace': trace }, body: JSON.stringify({ message: 'synthetic-preview-signing-probe-not-a-printer-command' }) });
    await response.text(); return { trace, status: response.status, ms: Math.round(performance.now() - start) };
  }, { trace }));
  check(evidence.signing[0].status === 200, 'Authenticated signing endpoint responds without printer contact');
})().catch(async error => {
  evidence.error = error.message; console.error(error.message); process.exitCode = 1;
  for (const c of browser?.contexts() ?? []) for (const p of c.pages()) {
    fs.writeFileSync('.tmp/checkout-hosted-failure.txt', await p.locator('body').innerText().catch(() => 'Page unavailable'));
  }
}).finally(async () => {
  try { await cleanup(); } catch (error) { evidence.cleanupError = error.message; console.error('Cleanup requires follow-up:', error.message); process.exitCode = 1; }
  fs.writeFileSync(`${prefix}-evidence.json`, JSON.stringify(evidence, null, 2));
  await db.end();
});
