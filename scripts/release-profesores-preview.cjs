// Preview-only preflight and transactional application of the reviewed migration.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {parseEnv}=require('node:util'),{Client}=require('pg');
const env=parseEnv(fs.readFileSync('../director-parity/.env.local','utf8'));
const ref='eqefgwdsqabnmpnbpqbq',version='20260923010000',name='profesores_foundation';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,`https://${ref}.supabase.co`);
const url=new URL(env.SUPABASE_PREVIEW_DB_URL);url.searchParams.delete('sslmode');
assert.ok(url.hostname===`db.${ref}.supabase.co`||decodeURIComponent(url.username)===`postgres.${ref}`);
const db=new Client({connectionString:url.href,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
(async()=>{
 await db.connect();await db.query('begin read only');
 const applied=(await db.query('select version from supabase_migrations.schema_migrations')).rows.map(r=>r.version);
 const pending=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&!applied.includes(f.split('_')[0]));
 console.log(JSON.stringify({ref,pending,installed:applied.includes(version)}));
 if(applied.includes(version)){assert.equal(pending.length,0);await db.query('rollback');return;}
 assert.deepEqual(pending,[`${version}_${name}.sql`]);
 const snapshot={ref,version,functions:(await db.query("select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'")).rows,
 policies:(await db.query("select * from pg_policies where schemaname in ('public','storage')")).rows,
 triggers:(await db.query("select pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal")).rows};
 fs.mkdirSync('.tmp',{recursive:true});fs.writeFileSync(`.tmp/profesores-preview-baseline-${Date.now()}.json`,JSON.stringify(snapshot,null,2));
 await db.query('rollback');
 if(!process.argv.includes('--apply'))return;
 await db.query("begin;set local lock_timeout='5s';set local statement_timeout='90s'");
 await db.query("select pg_advisory_xact_lock(hashtext('profesores_preview_release'))");
 assert.equal((await db.query('select 1 from supabase_migrations.schema_migrations where version=$1',[version])).rowCount,0);
 const sql=fs.readFileSync(`supabase/migrations/${version}_${name}.sql`,'utf8');
 await db.query(sql);
 await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,name,[sql]]);
 assert.equal((await db.query('select count(*)::int n from invicta_account_blocks')).rows[0].n,0);
 await db.query('commit');console.log('Applied reviewed Profesores migration to Preview only. No existing coach/account changed.');
})().catch(e=>{console.error(e.message);process.exitCode=1}).finally(async()=>{await db.query('rollback').catch(()=>{});await db.end()});
