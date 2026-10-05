// Read-only role simulation. Never creates sessions, users, or financial records.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { parseEnv } = require('node:util'), { Client } = require('pg');
const production = process.argv.includes('--production');
const ref = production ? 'hjvytfaalnfcqfgbxsmj' : 'eqefgwdsqabnmpnbpqbq';
const env = parseEnv(fs.readFileSync(production ? '../../.env.prod.local' : '../director-parity/.env.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, `https://${ref}.supabase.co`);
const url = new URL(production ? env.SUPABASE_PROD_DB_URL : env.SUPABASE_PREVIEW_DB_URL);
assert.ok(url.hostname === `db.${ref}.supabase.co` || decodeURIComponent(url.username) === `postgres.${ref}`);
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
// Keep real account identifiers in ignored local evidence, not the source repository.
const incident = JSON.parse(fs.readFileSync('.tmp/player-profile-incident.json', 'utf8'));
const users = incident.users, ids = incident.enrollmentIds;
const evidence = { ref, capturedAt: new Date().toISOString(), results: [] };
async function queryAs(actor, sql, params) {
  await db.query('begin read only');
  try {
    await db.query("set local role authenticated; set local statement_timeout='8s'");
    await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, role: 'authenticated' })]);
    const start = performance.now();
    try { const result = await db.query(sql, params); return { ms: Math.round(performance.now() - start), rows: result.rows }; }
    catch (error) { return { ms: Math.round(performance.now() - start), code: error.code, error: error.message }; }
  } finally { await db.query('rollback'); }
}
(async () => {
  await db.connect();
  if (process.argv.includes('--inventory')) {
    await db.query('begin read only');
    await db.query("set local statement_timeout='8s'");
    console.log(JSON.stringify({ roles: (await db.query('select ur.user_id,r.code,ur.campus_id from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=any($1::uuid[])', [Object.values(users)])).rows,
      profiles: (await db.query("select player_id,count(*)::int enrollments,bool_or(status='active') active,count(distinct campus_id)::int campuses from public.enrollments group by player_id having count(*) between 2 and 4 and bool_or(status='active') order by count(*) limit 5")).rows }));
    await db.query('rollback'); return;
  }
  for (const [name, actor] of Object.entries(users)) {
    const existing = await db.query('select id from auth.users where id=$1', [actor]);
    if (!existing.rowCount) { console.log(name, 'not present in this environment'); continue; }
    for (const filter of [ids, ...ids.map(id => [id])]) {
      const combined = filter.length > 1;
      const result = await queryAs(actor, `select enrollment_id,total_charges,total_payments,balance from public.v_enrollment_collection_balances where enrollment_id ${combined ? '=any($1::uuid[])' : '=$1::uuid'}`, [combined ? filter : filter[0]]);
      evidence.results.push({ name, filter, ...result });
      console.log(JSON.stringify({ name, enrollments: filter.length, ms: result.ms, code: result.code, rows: result.rows?.length }));
    }
  }
  fs.writeFileSync(`.tmp/player-profile-balance-audit-${production ? 'production' : 'preview'}.json`, JSON.stringify(evidence, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
