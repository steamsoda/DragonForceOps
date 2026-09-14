// Preview only. Rehearse all changes with rollback; --commit applies only the migration.
const fs = require('node:fs');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== 'eqefgwdsqabnmpnbpqbq.supabase.co') throw Error('Preview required');
const url = new URL(env.SUPABASE_PREVIEW_DB_URL);
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.toString(), ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const version = '20260914120000';
const sql = fs.readFileSync(`supabase/migrations/${version}_porto_manual_role_authorization.sql`, 'utf8');
let passed = 0;
const rows = async (q, p = []) => (await db.query(q, p)).rows;
function check(value, message) { if (!value) throw Error(message); passed++; }
async function denied(q, p = []) {
  await db.query('savepoint denial');
  let blocked = false;
  try { await db.query(q, p); } catch (e) {
    await db.query('rollback to savepoint denial');
    if (e.code !== '42501') throw e;
    blocked = true;
  }
  check(blocked, `Expected denial: ${q}`);
}
async function identity(id) {
  await db.query('reset role');
  await rows("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
  await db.query('set local role authenticated');
}
async function main() {
  await db.connect();
  await db.query('begin');
  await db.query("set local lock_timeout='5s'; set local statement_timeout='20s'");
  const installed = (await rows('select version from supabase_migrations.schema_migrations where version=$1', [version])).length > 0;
  if (!installed) await db.query(sql);
  const owner = (await rows("select u.id from auth.users u join public.user_roles ur on ur.user_id=u.id join public.app_roles r on r.id=ur.role_id where lower(u.email)='javierg@dragonforcemty.com' and r.code='superadmin'"))[0];
  check(owner, 'Superadmin fixture actor unavailable');
  const verified = randomUUID(), unverified = randomUUID();
  for (const [id, confirmed] of [[verified, true], [unverified, false]]) {
    await rows('insert into auth.users(id,email,email_confirmed_at) values($1,$2,case when $3 then now() else null end)', [id, `manual-${id}@example.com`, confirmed]);
  }
  check(!(await rows('select 1 from user_roles where user_id=$1', [verified])).length, 'Signup must not auto-grant');
  const role = (await rows("select id from public.app_roles where code='porto_viewer'"))[0];
  const grant = `insert into public.user_roles(user_id,role_id) values($1,'${role.id}')`;
  await identity(verified);
  await denied(grant, [verified]);
  await denied('select public.porto_operational_overview()');
  await identity(owner.id);
  await denied(grant, [unverified]);
  await db.query(grant, [verified]);
  check((await rows('select 1 from public.user_roles where user_id=$1', [verified])).length === 1, 'Superadmin manual grant failed');
  await denied("insert into public.user_roles(user_id,role_id) select $1,id from public.app_roles where code='front_desk'", [verified]);
  await identity(verified);
  for (const view of ['players', 'guardians', 'groups', 'attendance', 'squads', 'schedules', 'registrations', 'trials']) {
    const data = (await rows('select public.porto_operational_overview($1) data', [view]))[0].data;
    check(Array.isArray(data.items) && data.items.every(r => Object.keys(r).sort().join(',') === 'campus,campus_id,detail,event_date,extra,id,label,status'), `Projection failed: ${view}`);
  }
  for (const table of ['payments', 'charges', 'players', 'guardians']) {
    check(+(await rows(`select count(*) n from public.${table}`))[0].n === 0, `Raw access leak: ${table}`);
  }
  await denied('select public.get_porto_datos_generales()');
  await denied("insert into public.players(first_name,last_name,birth_date,gender) values('Blocked','Viewer','2015-01-01','male')");
  await denied(grant, [unverified]);
  await identity(owner.id);
  await rows('delete from public.user_roles where user_id=$1', [verified]);
  await identity(verified);
  await denied('select public.porto_operational_overview()');
  await db.query('rollback');
  if (process.argv.includes('--commit') && !installed) {
    await db.query('begin');
    await db.query("set local lock_timeout='5s'; set local statement_timeout='20s'");
    await db.query(sql);
    await rows('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)', [version, 'porto_manual_role_authorization', [sql]]);
    await db.query('commit');
  }
  console.log(JSON.stringify({ passed, fixturesRolledBack: true, migration: installed ? 'already installed' : process.argv.includes('--commit') ? 'applied to Preview' : 'rehearsed only' }));
}
main().catch(async e => { await db.query('rollback').catch(() => {}); console.error(e.message); process.exitCode = 1; }).finally(() => db.end());
