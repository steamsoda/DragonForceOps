// Preview-only rehearsal: schema, identities, approvals and audit rows all roll back.
const fs = require('node:fs');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const assert = require('node:assert/strict');
const env = parseEnv(fs.readFileSync('.env.local', 'utf8'));
if (env.NEXT_PUBLIC_SUPABASE_URL !== 'https://eqefgwdsqabnmpnbpqbq.supabase.co') throw Error('Preview required');
const url = new URL(env.SUPABASE_PREVIEW_DB_URL); url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
let checks = 0;
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
function ok(value, name) { assert.ok(value, name); checks++; }
async function identity(email, confirmed = true) {
  const id = randomUUID();
  await q('insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1,$2,$3,now(),now())', [id, email, confirmed ? new Date() : null]);
  return id;
}
async function actor(id, role = 'authenticated') {
  await db.query('reset role');
  await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: id, role }), id || '']);
  if (role === 'authenticated') await db.query('set local role authenticated');
}
async function denied(sql, params, expected) {
  await db.query('savepoint denial');
  let error;
  try { await q(sql, params); } catch (e) { error = e; await db.query('rollback to savepoint denial'); }
  ok(error && (error.code === expected || error.message.includes(expected)), `expected ${expected}`);
  await db.query('release savepoint denial');
}
async function main() {
  await db.connect(); await db.query("begin; set local lock_timeout='3s'; set local statement_timeout='20s'");
  const before = (await q('select count(*) n from auth.users'))[0].n;
  await db.query(fs.readFileSync('supabase/migrations/20260914180000_manage_email_preauthorizations.sql', 'utf8'));
  const suffix = randomUUID();
  const manager = await identity(`manager-${suffix}@dragonforcemty.com`);
  await q("insert into public.user_roles(user_id,role_id) select $1,id from public.app_roles where code='superadmin'", [manager]);
  const outsider = await identity(`outsider-${suffix}@example.invalid`);
  await actor(outsider);
  await denied('select public.list_email_preauthorizations()', [], '42501');
  await denied("select public.save_email_preauthorization('x@example.invalid','director_readonly',null,-1)", [], '42501');
  await denied('select * from public.porto_viewer_authorizations', [], '42501');
  await actor(manager);
  const email = `reader-${suffix}@example.invalid`;
  const save = 'select public.save_email_preauthorization($1,$2,$3,$4)';
  await q(save, [email.toUpperCase(), 'director_readonly', null, -1]);
  let data = (await q('select public.list_email_preauthorizations($1,0) d', [email]))[0].d;
  ok(data.total === 1 && data.items[0].email === email && data.items[0].revision === 0, 'normalized pending row');
  await denied(save, [email, 'porto_viewer', null, -1], 'preauthorization_changed');
  await q(save, [email, 'director_readonly', null, 0]);
  await denied(save, [`bad-${suffix}@example.invalid`, 'superadmin', null, -1], 'staff_domain_required');
  await denied(save, [`staff-${suffix}@dragonforcemty.com`, 'front_desk', null, -1], 'invalid_campus');
  await denied(save, [email, 'coach', null, 1], 'invalid_form');
  await actor(null, 'postgres');
  const reader = await identity(email, false);
  ok((await q('select id from public.user_roles where user_id=$1', [reader])).length === 0, 'unverified denied');
  await q('update auth.users set email_confirmed_at=now() where id=$1', [reader]);
  ok((await q("select r.code from public.user_roles ur join public.app_roles r on r.id=ur.role_id where ur.user_id=$1", [reader]))[0].code === 'director_readonly', 'verified claim');
  await q('update auth.users set last_sign_in_at=now() where id=$1', [reader]);
  ok((await q('select id from public.user_roles where user_id=$1', [reader])).length === 1, 'no duplicate grant');
  await actor(reader);
  await denied('select public.list_email_preauthorizations()', [], '42501');
  await denied('select public.revoke_email_preauthorization($1,2)', [email], '42501');
  await actor(manager);
  await denied(save, [email, 'porto_viewer', null, 2], 'preauthorization_changed');
  await denied('select public.revoke_email_preauthorization($1,2)', [email], 'preauthorization_changed');
  await actor(null, 'postgres');
  await q('delete from public.user_roles where user_id=$1', [reader]);
  await q('update auth.users set last_sign_in_at=now() where id=$1', [reader]);
  ok((await q('select id from public.user_roles where user_id=$1', [reader])).length === 0, 'revoked role not restored');
  await actor(manager);
  const revoked = `revoked-${suffix}@example.invalid`;
  await q(save, [revoked, 'porto_viewer', null, -1]);
  await q('select public.revoke_email_preauthorization($1,0)', [revoked]);
  await actor(null, 'postgres');
  const revokedId = await identity(revoked);
  ok((await q('select id from public.user_roles where user_id=$1', [revokedId])).length === 0, 'pending revoked before login');
  const conflict = `conflict-${suffix}@dragonforcemty.com`;
  await actor(manager); await q(save, [conflict, 'director_readonly', null, -1]);
  await actor(null, 'postgres'); const staff = await identity(conflict, false);
  await q("insert into public.user_roles(user_id,role_id) select $1,id from public.app_roles where code='director_admin'", [staff]);
  await q('update auth.users set email_confirmed_at=now() where id=$1', [staff]);
  const issue = (await q('select enabled,last_issue from public.porto_viewer_authorizations where email=$1', [conflict]))[0];
  ok(!issue.enabled && issue.last_issue === 'existing_user_access', 'existing role disables pending claim');
  await actor(manager); await denied(save, [conflict, 'director_readonly', null, 1], 'existing_user_access');
  const campus = (await q('select id from public.campuses where is_active order by id limit 1'))[0].id;
  const staffEmail = `desk-${suffix}@fcportodragonforcemty.com`;
  await q(save, [staffEmail, 'front_desk', campus, -1]);
  await actor(null, 'postgres'); const desk = await identity(staffEmail);
  ok((await q('select campus_id from public.user_roles where user_id=$1', [desk]))[0].campus_id === campus, 'campus scoped verified grant');
  ok(Number((await q("select count(*) n from public.audit_logs where actor_user_id=$1 and action like 'user.preauthorization.%'", [manager]))[0].n) >= 8, 'audited mutations and claims');
  await db.query('rollback');
  ok((await q('select count(*) n from auth.users'))[0].n === before, 'fixtures rolled back');
  console.log(JSON.stringify({ checks, result: 'PASS; Preview schema and all fixtures rolled back' }));
}
main().catch(async e => { await db.query('rollback').catch(() => {}); console.error(e.message); process.exitCode = 1; }).finally(() => db.end());
