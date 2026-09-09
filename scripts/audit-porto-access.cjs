// Read-only identity and authorization audit; never print tokens or credentials.
const fs=require('node:fs');
const {parseEnv}=require('node:util');
const {Client}=require('pg');
const env=parseEnv(fs.readFileSync('.env.prod.local','utf8'));
const url=new URL(env.SUPABASE_PROD_DB_URL);url.searchParams.delete('sslmode');
if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='hjvytfaalnfcqfgbxsmj.supabase.co')throw Error('Wrong project');
const db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
async function main(){
 await db.connect();await db.query('BEGIN READ ONLY');await db.query("SET LOCAL statement_timeout='15s'");
 if(process.argv.includes('--catalog')) {
  const catalog={};
  for(const [key,sql] of [
   ['functions',`select p.oid::regprocedure::text signature,p.prosecdef,has_function_privilege('authenticated',p.oid,'EXECUTE') executable,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and p.prosecdef order by 1`],
   ['policies',`select * from pg_policies where schemaname='public'`],
   ['tables',`select c.relname,c.relkind,c.relrowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v')`],
   ['columns',`select table_name,column_name,data_type from information_schema.columns where table_schema='public' order by table_name,ordinal_position`]
  ])catalog[key]=(await db.query(sql)).rows;
  fs.mkdirSync('.tmp',{recursive:true});
  fs.writeFileSync('.tmp/porto-catalog.json',JSON.stringify(catalog,null,2));
  console.log(JSON.stringify({functions:catalog.functions.length,tables:catalog.tables.length,policies:catalog.policies.length}));
  await db.query('ROLLBACK');return;
 }
 for(const [name,sql] of [
 ['identities',`select u.id,u.email,u.created_at,u.last_sign_in_at,u.banned_until,
 (select jsonb_agg(jsonb_build_object('provider',i.provider,'created_at',i.created_at)) from auth.identities i where i.user_id=u.id) identities,
 (select jsonb_agg(jsonb_build_object('role',r.code,'campus_id',ur.campus_id)) from user_roles ur join app_roles r on r.id=ur.role_id where ur.user_id=u.id) roles
 from auth.users u where lower(u.email) like '%@gmail.com' or lower(u.email) like '%@fcporto.pt' order by u.created_at desc`],
 ['roles',`select code from app_roles order by code`],
 ['unscoped_policies',`select tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and (qual in ('true','(true)') or with_check in ('true','(true)'))`]
 ])console.log(JSON.stringify({name,rows:(await db.query(sql)).rows}));
 await db.query(`select set_config('request.jwt.claims', $1, true)`,[JSON.stringify({sub:'dc312b26-880e-44ef-be6d-e02d467a9f08',role:'authenticated'})]);
 await db.query("select set_config('request.jwt.claim.sub','dc312b26-880e-44ef-be6d-e02d467a9f08',true)");
 await db.query('SET LOCAL ROLE authenticated');
 for(const table of ['players','guardians','payments','charges','coaches','academy_events','area_map_entries']) {
  await db.query('SAVEPOINT probe');
  try {console.log(JSON.stringify({probe:table,result:(await db.query(`select count(*) from public.${table}`)).rows}));}
  catch(e){await db.query('ROLLBACK TO SAVEPOINT probe');console.log(JSON.stringify({probe:table,error:e.code}));}
 }
 await db.query('ROLLBACK');
}
main().catch(e=>{console.error(e.code,e.message);process.exitCode=1;}).finally(()=>db.end());
