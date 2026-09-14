// Production preflight ONLY. No commit mode exists; all DDL and fixtures roll back.
const fs = require('node:fs');
const { parseEnv } = require('node:util');
const { createHash } = require('node:crypto');
const { Client } = require('pg');
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
if (require.main === module && (args.length !== 2 || !args.includes('--production') || !args.some(a => ['--inventory', '--rehearse'].includes(a)))) {
  throw Error('Use --production --inventory or --production --rehearse. No commit mode.');
}
const { main: rehearse, db, ref } = require('./test-director-readonly-db.cjs');
if (ref !== 'hjvytfaalnfcqfgbxsmj') throw Error('Production target required');
const hash = value => createHash('sha256').update(value).digest('hex');
const migrations = [
  { version: '20260914120000', name: 'porto_manual_role_authorization', sha256: '79fc5e2dd8682221792c8b2499f44345bd6f7670b2f33a0654864ee5925b8397' },
  { version: '20260914160000', name: 'director_readonly', sha256: '048cbbadbbb9220ff98442234b1c92dbc2da8377470cc953dba914ffb29fd88d' },
];
for (const m of migrations) {
  m.path = `supabase/migrations/${m.version}_${m.name}.sql`;
  m.sql = fs.readFileSync(m.path, 'utf8');
  if (hash(fs.readFileSync(m.path)) !== m.sha256) throw Error(`Unreviewed migration bytes: ${m.version}`);
}
const q = async (client, sql, params = []) => (await client.query(sql, params)).rows;
async function inventory(client) {
  const history = await q(client, 'select version,name,statements from supabase_migrations.schema_migrations order by version');
  const objects = await q(client, `select 'function:'||p.oid::regprocedure::text key,
      md5(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')) digest
    from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'
    union all select 'policy:'||schemaname||'.'||tablename||'.'||policyname,
      md5(jsonb_build_array(permissive,roles,cmd,qual,with_check)::text) from pg_policies where schemaname in ('public','storage')
    union all select 'relation:'||n.nspname||'.'||c.relname,
      md5(jsonb_build_array(c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,c.relacl,
        (select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
         from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
        case when c.relkind='v' then pg_get_viewdef(c.oid) else null end)::text)
      from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m')
    union all select 'trigger:'||n.nspname||'.'||c.relname||'.'||t.tgname,md5(pg_get_triggerdef(t.oid))
      from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','auth','storage') and not t.tgisinternal order by key`);
  return {
    history: history.map(({ version, name, statements }) => ({ version, name, sha256: hash((statements || []).join('')) })),
    objects,
    extensions: await q(client, 'select extname,extversion from pg_extension order by extname'),
    roleCounts: await q(client, 'select r.code,count(ur.id)::integer assignments from public.app_roles r left join public.user_roles ur on ur.role_id=r.id group by r.code order by r.code'),
    authTriggers: await q(client, `select t.tgname,p.oid::regprocedure::text function,
      p.prosrc ~* '(http_|net\\.|dblink|pg_net)' potential_external_effect
      from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid='auth.users'::regclass and not t.tgisinternal order by t.tgname`),
  };
}
function drift(from, to) {
  const a = new Map(from.objects.map(o => [o.key,o.digest]));
  const b = new Map(to.objects.map(o => [o.key,o.digest]));
  return { onlyProduction: [...a.keys()].filter(k => !b.has(k)), onlyPreview: [...b.keys()].filter(k => !a.has(k)),
    changed: [...a.keys()].filter(k => b.has(k) && a.get(k) !== b.get(k)) };
}
async function identities() {
  return (await q(db, `select
    md5(coalesce((select string_agg(to_jsonb(u)::text,',' order by id) from auth.users u),'')) users,
    md5(coalesce((select string_agg(to_jsonb(r)::text,',' order by id) from public.user_roles r),'')) assignments`))[0];
}
async function schemaBackup() {
  const snapshot = {
    target: ref, capturedAt:new Date().toISOString(), purpose:'Pre-change review evidence; not an automatic undo script',
    functions:await q(db, `select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,
      pg_get_userbyid(p.proowner) owner,p.proacl,md5(pg_get_functiondef(p.oid)) definition_hash
      from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by signature`),
    policies:await q(db, "select * from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname"),
    relations:await q(db, `select n.nspname schema,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
      pg_get_userbyid(c.relowner) owner,c.relacl,obj_description(c.oid,'pg_class') comment,
      case when c.relkind='v' then pg_get_viewdef(c.oid) else null end view_definition
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m') order by n.nspname,c.relname`),
    columnAcls:await q(db, `select c.oid::regclass::text relation,a.attname,a.attacl from pg_attribute a join pg_class c on c.oid=a.attrelid
      where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped order by relation,a.attnum`),
    triggers:await q(db, `select c.oid::regclass::text relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition
      from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace in ('public'::regnamespace,'auth'::regnamespace)
      and not t.tgisinternal order by relation,t.tgname`),
    schemaAcls:await q(db, "select nspname,pg_get_userbyid(nspowner) owner,nspacl from pg_namespace where nspname in ('public','storage','graphql_public') order by nspname"),
    defaultAcls:await q(db, "select pg_get_userbyid(defaclrole) owner,defaclnamespace::regnamespace::text schema,defaclobjtype,defaclacl from pg_default_acl order by owner,schema,defaclobjtype"),
  };
  const content=JSON.stringify(snapshot,null,2)+'\n';
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(content) || /(?:sb_secret_|eyJhbGciOi|-----BEGIN [A-Z ]*PRIVATE KEY)/.test(content)) {
    throw Error('Schema snapshot contains possible identity/secret literal; requires private review before saving');
  }
  const folder='.tmp/director-readonly-production-backup/'+new Date().toISOString().replaceAll(':','-');
  fs.mkdirSync(folder,{ recursive:true });
  const path=folder+'/schema.json';
  execFileSync('git',['check-ignore','--quiet',path]);
  fs.writeFileSync(path,content,{ flag:'wx' });
  return { path,sha256:hash(content),functions:snapshot.functions.length,policies:snapshot.policies.length,
    relations:snapshot.relations.length,triggers:snapshot.triggers.length,gitIgnored:true,noRowData:true };
}
async function main() {
  await db.connect();
  await db.query('begin isolation level repeatable read');
  await db.query("set local lock_timeout='3s'; set local statement_timeout='20s'; set local idle_in_transaction_session_timeout='60s'");
  const production = await inventory(db);
  const pEnv = parseEnv(fs.readFileSync('.env.local', 'utf8'));
  const pRef = 'eqefgwdsqabnmpnbpqbq', pUrl = new URL(pEnv.SUPABASE_PREVIEW_DB_URL);
  if (new URL(pEnv.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${pRef}.supabase.co` ||
      !(pUrl.hostname === `db.${pRef}.supabase.co` || (pUrl.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(pUrl.username) === `postgres.${pRef}`))) throw Error('Preview comparison target mismatch');
  pUrl.searchParams.delete('sslmode');
  const previewDb = new Client({ connectionString: pUrl.href, ssl: { rejectUnauthorized:false }, connectionTimeoutMillis:15000 });
  let preview;
  try {
    await previewDb.connect();
    await previewDb.query('begin read only');
    preview = await inventory(previewDb);
  } finally { await previewDb.query('rollback').catch(() => {}); await previewDb.end(); }
  const pending = migrations.filter(m => !production.history.some(h => h.version === m.version));
  for (const m of migrations.filter(m => !pending.includes(m))) {
    if (production.history.find(h => h.version === m.version).sha256 !== m.sha256) throw Error(`Existing approved migration history checksum differs: ${m.version}`);
  }
  const evidence = { target:ref, preview:pRef, mode:args.includes('--rehearse') ? 'rollback_rehearsal' : 'inventory',
    approvedMigrations: migrations.map(({ version, name, sha256 }) => ({ version, name, sha256 })),
    pending:pending.map(m => m.version),
    historyOnlyPreview:preview.history.filter(h => !production.history.some(p => p.version===h.version)),
    historyOnlyProduction:production.history.filter(h => !preview.history.some(p => p.version===h.version)),
    historyHashDifferences:production.history.filter(h => preview.history.some(p => p.version===h.version && p.sha256!==h.sha256)).map(h => h.version),
    production, preview, drift:drift(production,preview) };
  console.log(JSON.stringify({ target:ref, pending:evidence.pending, historyOnlyPreview:evidence.historyOnlyPreview,
    historyOnlyProduction:evidence.historyOnlyProduction, historyHashDifferences:evidence.historyHashDifferences,
    drift:evidence.drift, extensions:production.extensions, roleCounts:production.roleCounts, authTriggers:production.authTriggers }));
  fs.writeFileSync('docs/support/director-readonly-production-preflight.json', JSON.stringify(evidence,null,2)+'\n');
  if (!args.includes('--rehearse')) return;
  if (production.authTriggers.some(t => t.potential_external_effect)) throw Error('Review potential external auth trigger before fixtures');
  if (production.history.some(h => h.version > migrations.at(-1).version)) throw Error('Later production migration exists; re-review pending set');
  if (!pending.some(m => m.name==='director_readonly')) throw Error('Readonly already installed; use installed rollback harness');
  evidence.schemaBackup=await schemaBackup();
  console.log(JSON.stringify({ schemaBackup:evidence.schemaBackup }));
  const initialIdentities = await identities();
  await db.query('savepoint all_rehearsal_changes');
  await rehearse({ connected:true, transaction:true, beforeMigrationSql:pending.filter(m => m.name!=='director_readonly').map(m => m.sql) });
  const rehearsed = await inventory(db);
  evidence.rehearsedDrift = drift(rehearsed,preview);
  await db.query('rollback to savepoint all_rehearsal_changes; release savepoint all_rehearsal_changes');
  if (JSON.stringify(await identities()) !== JSON.stringify(initialIdentities)) throw Error('Auth/role fixtures not restored');
  const restored = await inventory(db);
  if (JSON.stringify(restored)!==JSON.stringify(production)) throw Error('Catalog/history not restored after savepoint rollback');
  evidence.result='PASS; all DDL and fixtures rolled back; no production commit';
  evidence.authUsersAndRoles='unchanged within consistent snapshot after fixture rollback';
  console.log(JSON.stringify({ result:evidence.result, authUsersAndRoles:evidence.authUsersAndRoles, rehearsedDrift:evidence.rehearsedDrift }));
  fs.writeFileSync('docs/support/director-readonly-production-preflight.json', JSON.stringify(evidence,null,2)+'\n');
}
module.exports = { db, ref, migrations, hash, inventory, identities, schemaBackup, rehearse };
if (require.main === module) main().catch(e => { console.error(e.code || '',e.message); process.exitCode=1; }).finally(async () => {
  await db.query('rollback').catch(() => {});
  await db.end();
  console.log('Production preflight connection closed. No commit or user grant performed.');
});
