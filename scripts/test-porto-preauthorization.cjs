// All fixtures/grants are rolled back, including when testing installed production policies.
const fs=require('node:fs'),path=require('node:path'),{parseEnv}=require('node:util'),{Client}=require('pg');
const preview=process.argv.includes('--preview');
const env=parseEnv(fs.readFileSync(preview?'.env.local':'.env.prod.local','utf8'));
if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!==(preview?'eqefgwdsqabnmpnbpqbq':'hjvytfaalnfcqfgbxsmj')+'.supabase.co')throw Error('Unexpected project');
const url=new URL(preview?env.SUPABASE_PREVIEW_DB_URL:env.SUPABASE_PROD_DB_URL);url.searchParams.delete('sslmode');
const db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const uid='bd926e67-e847-44a6-836f-f51aa621b351';
let count=0;
function assert(ok,message){if(!ok)throw Error(message);count++;}
const rows=async(sql,args=[]) => (await db.query(sql,args)).rows;
async function denied(sql,args=[]){await db.query('savepoint denial');let blocked=false;try{await db.query(sql,args);}catch(e){await db.query('rollback to savepoint denial');if(e.code!=='42501')throw e;blocked=true;}assert(blocked,'Permission denial required');}
async function main(){
 await db.connect();await db.query('begin');await db.query("set local lock_timeout='5s';set local statement_timeout='20s'");
 if(process.argv.includes('--verify-live'))assert((await rows("select version from supabase_migrations.schema_migrations where version='20260913120000'")).length===1,'Migration not installed');
 else await db.query(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20260913120000_porto_preauthorized_test_account.sql'),'utf8'));
 assert(!(await rows("select id from auth.users where lower(email)='tigres.azulyoro@live.com'")).length,'Target identity exists; do not replace it with a fixture');
 await rows("insert into auth.users(id,email,created_at,updated_at) values($1,'tigres.azulyoro@live.com',now(),now())",[uid]);
 assert(!(await rows('select id from user_roles where user_id=$1',[uid])).length,'Unconfirmed identity granted');
 await rows('update auth.users set email_confirmed_at=now() where id=$1',[uid]);
 const grant=await rows('select r.code from user_roles ur join app_roles r on r.id=ur.role_id where ur.user_id=$1',[uid]);
 assert(grant.length===1&&grant[0].code==='porto_viewer','Dedicated role not granted');
 assert((await rows("select claimed_by from porto_viewer_authorizations where email='tigres.azulyoro@live.com'"))[0].claimed_by===uid,'Grant not consumed');
 assert((await rows("select id from audit_logs where request_id=$1",['porto.preapproval.'+uid])).length===1,'Missing audit');
 await rows('update auth.users set last_sign_in_at=now() where id=$1',[uid]);
 assert((await rows('select id from user_roles where user_id=$1',[uid])).length===1,'Duplicate role');
 await denied("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='superadmin'",[uid]);
 await rows("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:uid,role:'authenticated'}),uid]);await db.query('set local role authenticated');
 await denied('select * from porto_viewer_authorizations');
 await denied("insert into porto_viewer_authorizations(email,reason) values('intruder@example.com','self')");
 for(const view of ['players','guardians','groups','attendance','squads','schedules','registrations','trials']){
  const d=(await rows('select porto_operational_overview($1) data',[view]))[0].data;
  assert(Array.isArray(d.items)&&d.items.every(r=>Object.keys(r).sort().join(',')==='campus,campus_id,detail,event_date,extra,id,label,status'),'Projection mismatch '+view);
 }
 for(const table of ['payments','charges','players','guardians'])assert(+(await rows(`select count(*) n from ${table}`))[0].n===0,'Raw data leak '+table);
 await denied('select get_porto_datos_generales()');
 await denied("insert into players(first_name,last_name,birth_date,gender) values('Blocked','Viewer','2015-01-01','male')");
 await db.query('reset role');
 await rows("update porto_viewer_authorizations set enabled=false where email='tigres.azulyoro@live.com'");
 await db.query('set local role authenticated');await denied('select porto_operational_overview()');await db.query('reset role');
 await rows("update porto_viewer_authorizations set enabled=true where email='tigres.azulyoro@live.com'");
 await rows('delete from user_roles where user_id=$1',[uid]);await rows('update auth.users set last_sign_in_at=now() where id=$1',[uid]);
 assert(!(await rows('select id from user_roles where user_id=$1',[uid])).length,'Revoked access regranted');
 await rows("insert into auth.users(id,email,email_confirmed_at) values('bd926e67-e847-44a6-836f-f51aa621b352','not-approved@example.com',now())");
 assert(!(await rows("select id from user_roles where user_id='bd926e67-e847-44a6-836f-f51aa621b352'")).length,'Unapproved account granted');
 assert((await rows("select auto_grant from porto_viewer_authorizations where email='rita.cabral@fcporto.pt'"))[0].auto_grant===false,'Rita auto-grant changed');
 await db.query('rollback');console.log(JSON.stringify({passed:count,mode:process.argv.includes('--verify-live')?'installed':'rehearsal',allFixturesRolledBack:true}));
}
main().catch(async e=>{await db.query('rollback').catch(()=>{});console.error(e.message);process.exitCode=1}).finally(()=>db.end());
