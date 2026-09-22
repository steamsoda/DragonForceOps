// Read-only deployment inventory, pinned to Preview. Never applies migrations.
const fs=require('node:fs');
const {parseEnv}=require('node:util');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const env=parseEnv(fs.readFileSync('../director-parity/.env.local','utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'https://eqefgwdsqabnmpnbpqbq.supabase.co');
const url=new URL(env.SUPABASE_PREVIEW_DB_URL);
assert.ok(url.hostname==='db.eqefgwdsqabnmpnbpqbq.supabase.co'||decodeURIComponent(url.username)==='postgres.eqefgwdsqabnmpnbpqbq');
url.searchParams.delete('sslmode');
const db=new Client({connectionString:url.href,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
(async()=>{
  await db.connect();await db.query('begin read only');
  const versions=(await db.query("select version from supabase_migrations.schema_migrations order by version desc limit 12")).rows;
  const tables=(await db.query("select tablename,rowsecurity from pg_tables where schemaname='public' and tablename like 'explicit_%' order by tablename")).rows;
  const automatic=(await db.query("select pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure) definition")).rows[0].definition;
  const trigger=(await db.query("select count(*)::int n from pg_trigger where tgrelid='public.charges'::regclass and tgname='trg_apply_explicit_credit_after_charge_insert'")).rows[0].n;
  await db.query('rollback');
  const report={previewRef:'eqefgwdsqabnmpnbpqbq',versions,tables,automaticTriggerCount:trigger,automaticFunction:automatic};
  fs.mkdirSync('.tmp',{recursive:true});
  fs.writeFileSync(`.tmp/explicit-credit-release-${Date.now()}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...report,automaticFunction:undefined,automaticNoop:automatic.includes('select 0::numeric,0::integer')},null,2));
  if(process.argv.includes('--installed')){
    for(let i=1;i<=7;i++)assert.ok(versions.some(row=>row.version===`202609220${i}0000`));
    assert.equal(tables.length,5);assert.ok(tables.every(row=>row.rowsecurity));
    assert.equal(trigger,0);assert.ok(automatic.includes('select 0::numeric,0::integer'));
    console.log('PASS installed Preview migrations, private-table RLS and automatic-credit retirement.');
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.end());
