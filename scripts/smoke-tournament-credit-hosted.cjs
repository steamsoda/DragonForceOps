// Hosted read checks; only a temporary, owned Auth identity is created/removed.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { parseEnv } = require('node:util'), { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const ExcelJS = require('exceljs');
const production = process.argv.includes('--production');
if (production) assert.ok(process.argv.includes('--confirm-production-smoke'));
const env = parseEnv(fs.readFileSync(production ? '../../.env.prod.local' : '../director-parity/.env.local', 'utf8'));
const ref = production ? 'hjvytfaalnfcqfgbxsmj' : 'eqefgwdsqabnmpnbpqbq';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
const origin = production ? 'https://dragon-force-ops.vercel.app' : 'https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const marker = `.tmp/tournament-credit-${production ? 'production' : 'preview'}-identity.json`;
const runId = randomUUID(), cookies = [];
let userId, session;
const checked = async p => { const r = await p; assert.ifError(r.error); return r.data; };
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toLowerCase();
const expected = ['DF-0919','DF-0459','DF-0578','DF-0497','DF-0815','DF-0330','DF-0603','DF-0775','DF-0833'];
async function request(path) {
  return fetch(origin + path, { redirect: 'manual', headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') }, signal: AbortSignal.timeout(90000) });
}
(async () => {
  assert.ok(!fs.existsSync(marker), 'Previous smoke identity requires cleanup');
  const tournaments = await checked(admin.from('tournaments').select('id,name,campus_id,product_id,is_active,end_date').eq('is_active', true).not('product_id', 'is', null));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Monterrey' }).format(new Date());
  const tournament = tournaments.find(t => (!t.end_date || t.end_date >= today) && (production ? t.product_id === '1d24cd21-5820-45eb-b988-c9513b4eddf2' && t.campus_id === 'bd879be2-40c1-405f-893e-02ede605a927' : true));
  assert.ok(tournament, 'Active tournament fixture');
  const players = production ? await checked(admin.from('players').select('first_name,last_name,public_player_id').in('public_player_id', expected)) : [];
  if (production) assert.equal(players.length, 9);
  const email = `tournament-credit-${runId}@fcportodragonforcemty.com`;
  userId = (await checked(admin.auth.admin.createUser({ email, email_confirm: true, app_metadata: { runId, purpose: 'tournament_credit_smoke' } }))).user.id;
  fs.writeFileSync(marker, JSON.stringify({ userId, runId, ref }));
  const link = await checked(admin.auth.admin.generateLink({ type: 'magiclink', email }));
  session = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => cookies, setAll: values => { for (const value of values) { const index = cookies.findIndex(c => c.name === value.name); if (index < 0) cookies.push(value); else cookies[index] = value; } } },
  });
  await checked(session.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }));
  const query = `campus=${tournament.campus_id}&competition=${encodeURIComponent(`product:${tournament.product_id}`)}`;
  for (const role of ['director_admin', 'front_desk', 'director_readonly']) {
    await checked(admin.from('user_roles').delete().eq('user_id', userId));
    const roleId = (await checked(admin.from('app_roles').select('id').eq('code', role).single())).id;
    await checked(admin.from('user_roles').insert({ user_id: userId, role_id: roleId, campus_id: role === 'front_desk' ? tournament.campus_id : null }));
    const page = await request(`/sports-signups?${query}`);
    assert.equal(page.status, 200, `${role} board status`);
    const html = await page.text();
    assert.ok(html.includes(require('../package.json').version), `${role} deployed version`);
    assert.ok(!html.includes('Application error: a server-side exception'), `${role} no server exception`);
    for (const player of players) assert.ok(normalize(html).includes(normalize(`${player.first_name} ${player.last_name}`)), `${role} board includes ${player.public_player_id}`);
    const exported = await request(`/api/exports/sports-signups?${query}`);
    assert.equal(exported.status, 200, `${role} Excel status`);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(await exported.arrayBuffer()));
    const cells = [];
    book.eachSheet(sheet => sheet.eachRow(row => row.eachCell(cell => cells.push(cell.text))));
    const excel = normalize(cells.join(' '));
    for (const player of players) assert.ok(excel.includes(normalize(`${player.first_name} ${player.last_name}`)), `${role} Excel includes ${player.public_player_id}`);
    const members = [];
    for (const program of ['futbol_para_todos', 'selectivo']) {
      const teams = await request(`/api/sports-signups/teams?tournament=${tournament.id}&campus=${tournament.campus_id}&program=${program}`);
      assert.equal(teams.status, 200, `${role} teams ${program}`);
      const data = await teams.json();
      members.push(...(data.squads ?? []).flatMap(squad => squad.members));
    }
    for (const id of production ? expected : []) assert.ok(members.some(member => member.publicPlayerId === id), `${role} squad includes ${id}`);
    if (role === 'director_readonly') {
      const denied = await fetch(origin + '/sports-signups', { method: 'POST', redirect: 'manual', headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '), Origin: origin } });
      assert.equal(denied.status, 403, 'Read-only writes remain denied');
    }
    console.log(`PASS ${role}: hosted board, Excel workbook, team APIs${production ? ', all nine credit-funded players' : ''}`);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (!userId) return;
  await session?.auth.signOut();
  const owner = await checked(admin.auth.admin.getUserById(userId));
  assert.equal(owner.user.app_metadata.runId, runId);
  await checked(admin.from('user_roles').delete().eq('user_id', userId));
  await checked(admin.auth.admin.deleteUser(userId));
  fs.unlinkSync(marker);
  console.log('Temporary identity, role grants, and session removed. No financial writes.');
});
