// Local app or --preview / Preview backend only. Removes its owned Auth fixture.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { parseEnv } = require('node:util'), { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js'), { createServerClient } = require('@supabase/ssr');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const ExcelJS = require('exceljs');
const env = parseEnv(fs.readFileSync('../director-parity/.env.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://eqefgwdsqabnmpnbpqbq.supabase.co');
const hosted = process.argv.includes('--preview');
const origin = hosted ? 'https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app' : 'http://127.0.0.1:3112';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const runId = randomUUID(), purpose = 'product_sales_export_preview';
const marker = '.tmp/product-sales-smoke-identity.json';
let userId, browser;
const cookies = [];
async function checked(promise) { const result = await promise; assert.ifError(result.error); return result.data; }
async function assign(role) {
  await checked(admin.from('user_roles').delete().eq('user_id', userId));
  const roles = await checked(admin.from('app_roles').select('id').eq('code', role).single());
  await checked(admin.from('user_roles').insert({ user_id: userId, role_id: roles.id, campus_id: null }));
}
(async () => {
  assert.ok(!fs.existsSync(marker), 'Previous fixture needs cleanup');
  const products = await checked(admin.from('products').select('id,name').eq('has_sizes', true).limit(1));
  assert.ok(products.length, 'A sized Preview product is required');
  const product = products[0];
  const email = `sales-smoke-${runId}@fcportodragonforcemty.com`;
  const created = await checked(admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { runId, purpose } }));
  userId = created.user.id;
  fs.writeFileSync(marker, JSON.stringify({ userId, runId, purpose }));
  const link = await checked(admin.auth.admin.generateLink({ type: 'magiclink', email }));
  const session = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => cookies, setAll: values => { for (const value of values) { const index = cookies.findIndex(c => c.name === value.name); if (index < 0) cookies.push(value); else cookies[index] = value; } } },
  });
  await checked(session.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const role of ['director_admin', 'director_readonly', 'front_desk']) {
    await assign(role);
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    try {
      await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, url: origin, sameSite: 'Lax' })));
      await context.routeWebSocket('**/*', socket => socket.close());
      const response = await context.request.get(`${origin}/api/exports/product-charge-ledger?mode=sales&productId=${product.id}`);
      if (role === 'front_desk') {
        assert.ok(!response.headers()['content-type']?.includes('spreadsheetml'));
        console.log('PASS Front Desk denied sales export');
        continue;
      }
      assert.equal(response.status(), 200, await response.text().then(t => t.slice(0, 150)));
      assert.equal(response.headers()['cache-control'], 'no-store');
      const book = new ExcelJS.Workbook(); await book.xlsx.load(await response.body());
      assert.ok(book.getWorksheet('Detalle') && book.getWorksheet('Resumen por talla'));
      const bad = await context.request.get(`${origin}/api/exports/product-charge-ledger?mode=sales&productId=${product.id}&campusId=${randomUUID()}`);
      assert.equal(bad.status(), 403);
      const dates = await context.request.get(`${origin}/api/exports/product-charge-ledger?mode=sales&productId=${product.id}&paidFrom=2026-10-19&paidTo=2026-10-01`);
      assert.equal(dates.status(), 400);
      const page = await context.newPage();
      await page.goto(`${origin}/products/${product.id}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      const section = page.getByRole('region', { name: 'Ventas pagadas por talla' });
      await section.waitFor({ timeout: 60000 });
      if (hosted) assert.ok((await page.locator('body').innerText()).includes(`v${require('../package.json').version}`), 'Hosted version matches this release');
      await section.scrollIntoViewIfNeeded();
      await section.screenshot({ path: `.tmp/product-sales-${role}-desktop.png` });
      const downloadPromise = page.waitForEvent('download');
      await section.getByRole('button', { name: 'Exportar ventas Excel' }).click();
      const download = await downloadPromise;
      assert.ok(download.suggestedFilename().endsWith('.xlsx'));
      assert.equal(await download.failure(), null);
      await page.setViewportSize({ width: 390, height: 844 });
      await section.screenshot({ path: `.tmp/product-sales-${role}-mobile.png` });
      const bounds = await section.boundingBox(); assert.ok(bounds.width <= 390);
      console.log(`PASS ${role}: real session, Excel download, campus/date denial, desktop/mobile controls`);
    } finally { await context.close(); }
  }
  const anonymous = await fetch(`${origin}/api/exports/product-charge-ledger?mode=sales&productId=${product.id}`);
  assert.ok(!anonymous.headers.get('content-type')?.includes('spreadsheetml'));
  console.log('PASS anonymous export denied');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (!userId) return;
  const owner = await checked(admin.auth.admin.getUserById(userId));
  assert.equal(owner.user.app_metadata.runId, runId);
  await checked(admin.from('user_roles').delete().eq('user_id', userId));
  await checked(admin.auth.admin.deleteUser(userId));
  const remaining = await admin.auth.admin.getUserById(userId);
  assert.ok(!remaining.data.user);
  fs.unlinkSync(marker);
  console.log('PASS temporary Preview account and roles removed');
});
