// Full-page reads. Production requires explicit confirmation; only owned Auth fixtures change.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { parseEnv } = require('node:util'), { randomUUID } = require('node:crypto'), { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js'), { createServerClient } = require('@supabase/ssr');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const production = process.argv.includes('--production'), local = process.argv.includes('--local');
if (production) assert.ok(process.argv.includes('--confirm-production-smoke') && !local, 'Explicit production read/denial smoke confirmation required');
const env = parseEnv(fs.readFileSync(production ? '../../.env.prod.local' : '../director-parity/.env.local', 'utf8'));
const ref = production ? 'hjvytfaalnfcqfgbxsmj' : 'eqefgwdsqabnmpnbpqbq';
const origin = production ? 'https://dragon-force-ops.vercel.app' : local ? 'http://127.0.0.1:3112' : 'https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
const url = new URL(production ? env.SUPABASE_PROD_DB_URL : env.SUPABASE_PREVIEW_DB_URL); url.searchParams.delete('sslmode');
assert.ok(url.hostname === `db.${ref}.supabase.co` || decodeURIComponent(url.username) === `postgres.${ref}`);
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const purpose = production ? 'player_profile_timeout_production' : 'player_profile_timeout_preview', runId = randomUUID();
const marker = `.tmp/player-profile-${production ? 'production' : 'preview'}-smoke-identity.json`;
const evidence = { origin, version: require('../package.json').version, checks: [], pages: [] };
const incidentPlayerId = production ? JSON.parse(fs.readFileSync('.tmp/player-profile-incident.json', 'utf8')).playerId : null;
const cookies = []; let userId, browser;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const check = (ok, label) => { assert.ok(ok, label); evidence.checks.push(label); console.log('PASS', label); };
async function assign(roles) {
  await q('delete from user_roles where user_id=$1', [userId]);
  for (const [role, campus] of roles) {
    const result = await q('insert into user_roles(user_id,role_id,campus_id) select $1,id,$3 from app_roles where code=$2 returning id', [userId, role, campus]);
    assert.equal(result.length, 1);
  }
}
async function pageCheck(label, player, denied = false) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, url: origin, httpOnly: false, secure: !local, sameSite: 'Lax' })));
  await context.routeWebSocket('**/*', socket => socket.close());
  const page = await context.newPage();
  const start = Date.now();
  try {
    const response = await page.goto(`${origin}/players/${player.player_id}`, { waitUntil: 'networkidle', timeout: 60000 });
    const text = await page.locator('body').innerText();
    evidence.pages.push({ label, ms: Date.now() - start, status: response.status(), finalPath: new URL(page.url()).pathname });
    if (denied) {
      fs.writeFileSync('.tmp/player-profile-denied-body.txt', text);
      const responseBody = await response.text();
      fs.writeFileSync('.tmp/player-profile-denied-response.html', responseBody);
      // Next can return a streamed shell with a 200 status before its redirect.
      const streamedDenial = responseBody.includes('NEXT_REDIRECT;replace;/unauthorized;') || responseBody.includes('NEXT_REDIRECT;replace;/login;');
      check([403, 404].includes(response.status()) || page.url().includes('/unauthorized') || page.url().includes('/login') || streamedDenial, `${label}: profile denied`);
      check(!text.includes(player.first_name + ' ' + player.last_name), `${label}: name not exposed`);
    } else {
      check(response.status() === 200 && !/Application error|profile_balance_unavailable|server-side exception/.test(text), `${label}: whole profile loads`);
      check(text.includes(player.first_name + ' ' + player.last_name), `${label}: expected player rendered`);
      check(text.includes(`v${evidence.version}`), `${label}: expected release rendered`);
      check(text.includes('Cargos') && text.includes('Pagos'), `${label}: financial account sections rendered`);
    }
    if (label === 'Patricia multi') await page.screenshot({ path: `.tmp/player-profile-${production ? 'production' : 'preview'}.png`, fullPage: false });
  } finally { await context.close(); }
}
(async () => {
  assert.ok(!fs.existsSync(marker), 'Previous synthetic identity requires cleanup');
  await db.connect();
  const multi = (await q("select e.player_id,p.first_name,p.last_name from enrollments e join players p on p.id=e.player_id where ($1::uuid is null or e.player_id=$1) group by e.player_id,p.first_name,p.last_name having count(*) between 2 and 4 and count(*) filter(where e.status='active')=1 and bool_or(e.status='ended') order by e.player_id limit 1", [incidentPlayerId]))[0];
  assert.ok(multi, 'Existing active+historical Preview profile required');
  const enrollments = await q('select id,campus_id,status from enrollments where player_id=$1', [multi.player_id]);
  const campus = enrollments.find(e => e.status === 'active').campus_id;
  const single = (await q("select e.player_id,p.first_name,p.last_name from enrollments e join players p on p.id=e.player_id where e.status='active' and e.campus_id=$1 and (select count(*) from enrollments x where x.player_id=e.player_id)=1 order by e.id limit 1", [campus]))[0];
  const denied = (await q("select e.player_id,p.first_name,p.last_name from enrollments e join players p on p.id=e.player_id where e.status='active' and e.campus_id<>$1 and not exists(select 1 from enrollments x where x.player_id=e.player_id and x.campus_id=$1) order by e.id limit 1", [campus]))[0];
  assert.ok(single && denied, 'Single and denied-campus profiles required');
  const email = `profile-smoke-${runId}@fcportodragonforcemty.com`;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { purpose, runId } });
  assert.ifError(created.error); userId = created.data.user.id;
  fs.writeFileSync(marker, JSON.stringify({ ref, purpose, runId, userId }));
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email }); assert.ifError(link.error);
  const session = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => cookies, setAll: items => { for (const item of items) { const index = cookies.findIndex(c => c.name === item.name); if (index < 0) cookies.push(item); else cookies[index] = item; } } },
  });
  const auth = await session.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' }); assert.ifError(auth.error);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [label, roles] of [
    ['Patricia', [['director_admin', null], ['front_desk', campus]]],
    ['Lorena', [['director_admin', null], ['front_desk', null]]],
    ['FrontDesk', [['front_desk', campus]]],
    ['Superadmin', [['superadmin', null]]],
    ['ReadOnly', [['director_readonly', null]]],
  ]) {
    if (process.argv.includes('--readonly-only') && label !== 'ReadOnly') continue;
    await assign(roles);
    for (const enrollment of enrollments) {
      const result = await session.from('v_enrollment_collection_balances').select('enrollment_id,total_charges,total_payments,balance').eq('enrollment_id', enrollment.id).maybeSingle();
      // Read-only uses the existing authorized facade, not direct legacy balance access.
      if (label === 'ReadOnly') continue;
      assert.ifError(result.error);
      if (label === 'FrontDesk' && enrollment.campus_id !== campus) check(!result.data, 'FrontDesk historical campus denied by RLS');
      else {
        const expected = (await q('select enrollment_id,total_charges,total_payments,balance from v_enrollment_collection_balances where enrollment_id=$1', [enrollment.id]))[0];
        check(result.data?.enrollment_id === expected.enrollment_id && ['total_charges', 'total_payments', 'balance'].every(key => Number(result.data[key]) === Number(expected[key])), `${label}: canonical balance matches authorized data`);
      }
    }
    await pageCheck(`${label} multi`, multi);
    await pageCheck(`${label} single`, single);
    if (label === 'FrontDesk') await pageCheck('FrontDesk cross-campus', denied, true);
    if (label === 'ReadOnly') {
      const response = await fetch(`${origin}/players/${multi.player_id}`, { method: 'POST', redirect: 'manual', headers: { Origin: origin, Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') } });
      check(response.status === 403, 'Read-only profile POST denied');
    }
  }
  if (production) return; // Block mutation is tested only on the owned Preview fixture.
  await assign([['front_desk', campus]]);
  const coach = (await q('select id from coaches order by id limit 1'))[0]; assert.ok(coach);
  await q('insert into invicta_account_blocks(user_id,coach_id,blocked_by,reason) values($1,$2,$1,$3)', [userId, coach.id, 'Synthetic profile denial check']);
  const blocked = await session.from('v_enrollment_collection_balances').select('balance').eq('enrollment_id', enrollments.find(e => e.status === 'active').id);
  check(!!blocked.error || !blocked.data?.length, 'Blocked synthetic account denied at DB');
  await pageCheck('Blocked account', multi, true);
})().catch(error => { evidence.error = error.message; console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (userId) {
    try {
      const owner = await admin.auth.admin.getUserById(userId);
      assert.equal(owner.data.user?.app_metadata?.runId, runId); assert.equal(owner.data.user?.app_metadata?.purpose, purpose);
      await q('delete from invicta_account_blocks where user_id=$1', [userId]);
      await q('delete from user_roles where user_id=$1', [userId]);
      const deleted = await admin.auth.admin.deleteUser(userId); assert.ifError(deleted.error);
      assert.equal((await q('select id from auth.users where id=$1', [userId])).length, 0);
      fs.unlinkSync(marker); check(true, 'Synthetic identity, roles and block removed');
    } catch (error) { evidence.cleanupError = error.message; console.error('CLEANUP REQUIRED', error.message); process.exitCode = 1; }
  }
  fs.writeFileSync(`.tmp/player-profile-${production ? 'production' : local ? 'local' : 'hosted'}-evidence.json`, JSON.stringify(evidence, null, 2));
  await db.end();
});
