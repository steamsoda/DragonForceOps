// Prepared for a separately reviewed production commit. Never invoked by preflight.
const fs = require('node:fs');
const { db, ref, migrations, hash, inventory, identities, schemaBackup, rehearse } = require('./preflight-director-readonly-production.cjs');
const args=process.argv.slice(2);
const approvedBaseline='3ac0eda0c639a44de38b8193af4550c12c405e32ac4d4e26f476b23c191c5f38';
if (args.length!==5 || args[0]!=='--production' || args[1]!=='--apply-reviewed' || args[2]!==approvedBaseline
    || args[3]!==migrations[0].sha256 || args[4]!==migrations[1].sha256) {
  throw Error('Requires --production --apply-reviewed, the exact reviewed production baseline, and both approved migration hashes');
}
const q=async (sql,params=[]) => (await db.query(sql,params)).rows;
const digest=i => hash(JSON.stringify({ objects:i.objects,history:i.history,extensions:i.extensions }));
async function main() {
  const evidence=JSON.parse(fs.readFileSync('docs/support/director-readonly-production-preflight.json','utf8'));
  if (evidence.result!=='PASS; all DDL and fixtures rolled back; no production commit' || digest(evidence.production)!==approvedBaseline) {
    throw Error('Matching successful rollback rehearsal evidence required');
  }
  if (!evidence.schemaBackup?.gitIgnored || hash(fs.readFileSync(evidence.schemaBackup.path))!==evidence.schemaBackup.sha256) {
    throw Error('Reviewed pre-change schema evidence missing or checksum mismatch');
  }
  await db.connect();
  await db.query('begin isolation level repeatable read');
  await db.query("set local lock_timeout='3s'; set local statement_timeout='20s'; set local idle_in_transaction_session_timeout='60s'");
  await db.query("select pg_advisory_xact_lock(hashtext('director_readonly_production_install'))");
  await db.query('lock table supabase_migrations.schema_migrations in exclusive mode');
  const initial=await inventory(db);
  if (digest(initial)!==approvedBaseline) throw Error('Production schema/history/extension drift: re-review and rehearse');
  if (initial.history.some(h=>h.version>=migrations[0].version)) throw Error('Pending history changed or installation already exists');
  if ((await q("select to_regprocedure('public.is_director_readonly()') detector"))[0].detector) throw Error('Partial installation');
  const actors=await identities();
  const backup=await schemaBackup();
  console.log(JSON.stringify({ phase:'production_install_transaction',ref,baseline:approvedBaseline,
    migrations:migrations.map(({version,sha256})=>({version,sha256})),backup }));
  for (const m of migrations) {
    if (hash(fs.readFileSync(m.path))!==m.sha256) throw Error('Migration bytes changed');
    if (/^\s*(begin|commit|rollback)\s*;/im.test(m.sql)) throw Error('Migration must not control transactions');
    await db.query(m.sql);
  }
  const installed=await inventory(db);
  await db.query('savepoint installed_fixtures');
  await rehearse({ connected:true,transaction:true,installed:true });
  await db.query('rollback to savepoint installed_fixtures; release savepoint installed_fixtures');
  if (digest(await inventory(db))!==digest(installed)) throw Error('Installed schema drift or fixture DDL leaked');
  if (JSON.stringify(await identities())!==JSON.stringify(actors)) throw Error('Auth users or assignments changed');
  const counts=(await q(`select
    (select count(*)::integer from pg_views where schemaname='public' and viewname like 'v_director_readonly_%') views,
    (select count(*)::integer from pg_proc p where pronamespace='public'::regnamespace and prosecdef and prokind='f'
      and prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
      and position('public.director_readonly_deny_legacy_rpc()' in prosrc)>0
      and has_function_privilege('authenticated',p.oid,'execute')) guarded_rpcs,
    (select count(*)::integer from public.user_roles ur join public.app_roles r on r.id=ur.role_id where r.code='director_readonly') reader_assignments`))[0];
  if (counts.views!==38 || counts.guarded_rpcs!==28 || counts.reader_assignments!==0) throw Error('Unexpected installed inventory or reader assignment');
  for (const m of migrations) {
    if (hash(fs.readFileSync(m.path))!==m.sha256) throw Error('Migration file changed before commit');
    await q('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[m.version,m.name,[m.sql]]);
    const recorded=(await q('select statements from supabase_migrations.schema_migrations where version=$1',[m.version]))[0];
    if (hash(recorded.statements.join(''))!==m.sha256) throw Error('Recorded history checksum mismatch');
  }
  console.log(JSON.stringify({ phase:'ready_to_commit_reviewed_production',ref,counts,fixtures:'rolled back',authUsersAndRoles:'unchanged' }));
  await db.query("notify pgrst, 'reload schema'");
  await db.query('commit');
  console.log(JSON.stringify({ result:'PRODUCTION COMMIT SUCCEEDED',ref,versions:migrations.map(m=>m.version) }));
  await db.query('begin read only');
  const history=await q('select version,name,statements from supabase_migrations.schema_migrations where version=any($1::text[]) order by version',[migrations.map(m=>m.version)]);
  if (history.length!==2 || history.some((h,i)=>h.name!==migrations[i].name || hash(h.statements.join(''))!==migrations[i].sha256)) {
    throw Error('Post-commit readback mismatch: stop release; do not retry apply');
  }
  await db.query('rollback');
  console.log('Production history readback passed. No real user grants.');
}
main().catch(e=>{ console.error(e.code||'',e.message);process.exitCode=1; }).finally(async()=>{
  await db.query('rollback').catch(()=>{});await db.end();
});
