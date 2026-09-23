// Explicit Preview-only migration gate. Defaults to read-only preflight.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { parseEnv } = require('node:util'), { Client } = require('pg');
const env = parseEnv(fs.readFileSync('../director-parity/.env.local','utf8'));
const ref = 'eqefgwdsqabnmpnbpqbq';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,`https://${ref}.supabase.co`);
const url = new URL(env.SUPABASE_PREVIEW_DB_URL); url.searchParams.delete('sslmode');
assert.ok(url.hostname === `db.${ref}.supabase.co` || decodeURIComponent(url.username) === `postgres.${ref}`);
const db = new Client({connectionString:url.href,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const files = ['20260923020000_compact_checkout_receipt_birth_year.sql','20260923030000_checked_checkout_acknowledgement.sql'];
const signatures = ['public.checkout_explicit_cart(uuid,uuid,uuid,uuid,jsonb)','public.acknowledge_explicit_cart(uuid,uuid)'];
const rows = async (sql,args=[]) => (await db.query(sql,args)).rows;
async function inventory() {
  const applied = (await rows('select version from supabase_migrations.schema_migrations')).map(row=>row.version);
  return fs.readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')&&!applied.includes(file.split('_')[0])).sort();
}
async function definitions() {
  return rows('select oid::regprocedure::text signature,pg_get_functiondef(oid) definition,proacl::text acl from pg_proc where oid=any($1::regprocedure[])',[signatures]);
}
async function receiptDigest() {
  return (await rows("select count(*)::int n,md5(coalesce(string_agg(id::text||receipt::text,'' order by id),'')) digest from public.explicit_cart_checkouts"))[0];
}
(async()=>{
  await db.connect(); await db.query('begin read only');
  const pending = await inventory();
  console.log(JSON.stringify({ref,pending}));
  if (!pending.length) { await db.query('rollback'); console.log('Reviewed Preview migrations already installed.'); return; }
  assert.deepEqual(pending,files,'Unexpected migration drift: stop rather than applying unrelated migrations');
  const baseline = {ref,functions:await definitions(),receipts:await receiptDigest()};
  fs.mkdirSync('.tmp',{recursive:true});fs.writeFileSync(`.tmp/checkout-preview-baseline-${Date.now()}.json`,JSON.stringify(baseline,null,2));
  await db.query('rollback');
  if (!process.argv.includes('--apply')) return;
  await db.query("begin;set local lock_timeout='5s';set local statement_timeout='60s'");
  await db.query("select pg_advisory_xact_lock(hashtext('checkout_reliability_preview_release'))");
  assert.deepEqual(await inventory(),files);
  const before = await receiptDigest();
  for (const file of files) {
    const version = file.split('_')[0], name = file.slice(version.length+1,-4), sql = fs.readFileSync(`supabase/migrations/${file}`,'utf8');
    await db.query(sql);
    await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,name,[sql]]);
  }
  assert.deepEqual(await receiptDigest(),before,'Historical snapshots must not change');
  for (const signature of signatures) {
    const permissions = (await rows("select has_function_privilege('authenticated',$1,'execute') authenticated,has_function_privilege('anon',$1,'execute') anon,has_function_privilege('service_role',$1,'execute') service",[signature]))[0];
    assert.deepEqual(permissions,{authenticated:false,anon:false,service:true});
  }
  const after = await definitions();
  assert.ok(after.find(row=>row.signature.includes('checkout_explicit_cart')).definition.includes("'birthYear'"));
  assert.ok(after.find(row=>row.signature.includes('acknowledge_explicit_cart')).definition.includes('acknowledgement_unconfirmed'));
  await db.query("notify pgrst,'reload schema'");
  await db.query('commit');
  assert.deepEqual(await inventory(),[]);
  console.log('PASS: both reviewed migrations installed on Preview; historical snapshots unchanged; RPC privileges verified.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{await db.query('rollback').catch(()=>{});await db.end();});
