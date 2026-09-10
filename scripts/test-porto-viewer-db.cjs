// Production-shape validation in a transaction which ALWAYS rolls back.
const fs=require('node:fs');
const {parseEnv}=require('node:util');
const {Client}=require('pg');
const env=parseEnv(fs.readFileSync('.env.prod.local','utf8'));
const url=new URL(env.SUPABASE_PROD_DB_URL);url.searchParams.delete('sslmode');
const db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const assert=(v,msg)=>{if(!v)throw Error(msg);};
const migration=fs.readFileSync('supabase/migrations/20260909120000_porto_nonfinancial_viewer.sql','utf8');
let viewer='bd926e67-e847-44a6-836f-f51aa621b350';
let checks=0;
async function query(sql,params=[]) {return (await db.query(sql,params)).rows;}
async function asUser(id) {await db.query('RESET ROLE');await query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:id,role:'authenticated'}),id]);await db.query('SET LOCAL ROLE authenticated');}
async function denied(sql,params=[]) {
 await db.query('SAVEPOINT probe');
 let denied=false;
 try{await db.query(sql,params);}catch(e){await db.query('ROLLBACK TO SAVEPOINT probe');denied=e.code==='42501';if(!denied)throw e;}
 assert(denied,'Expected permission denial: '+sql);checks++;
}
async function main(){
 await db.connect();await db.query('BEGIN');await db.query("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='5s'");
 if(process.argv.includes('--verify-live')) {
  assert((await query("select version from supabase_migrations.schema_migrations where version='20260909120000'")).length===1,'Production migration is not recorded');
 } else await db.query(migration);
 const existing=(await query("select id,email_confirmed_at from auth.users where lower(email)='rita.cabral@fcporto.pt'"))[0];
 if(existing){
  assert(existing.email_confirmed_at,'Rita identity is not confirmed');
  viewer=existing.id;
  assert(!(await query('select id from user_roles where user_id=$1',[viewer])).length,'Existing Rita permissions must not be changed by this test');
 } else await query("insert into auth.users(id,email,email_confirmed_at,created_at,updated_at) values($1,'rita.cabral@fcporto.pt',now(),now(),now())",[viewer]);
 await query("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='porto_viewer'",[viewer]);
 const roleId=(await query("select id from app_roles where code='porto_viewer'"))[0].id;
 const tables=await query("select tablename from pg_tables where schemaname='public' and tablename not in ('app_roles','user_roles') order by tablename");
 await asUser(viewer);
 for(const {tablename} of tables){
  await db.query('SAVEPOINT raw_read');
  try { assert(+(await query(`select count(*) n from public.${tablename}`))[0].n===0,'Raw data leak: '+tablename); }
  catch(e){await db.query('ROLLBACK TO SAVEPOINT raw_read');if(e.code!=='42501')throw e;}
  checks++;
 }
 for(const view of ['players','guardians','groups','attendance','squads','schedules','registrations','trials']){
  const payload=(await query('select porto_operational_overview($1,null,\'\',\'2026-08-01\',\'2026-09-09\',0) data',[view]))[0].data;
  assert(Array.isArray(payload.items)&&payload.items.length<=100,'Invalid projection '+view);
  assert(payload.items.every(r=>Object.keys(r).sort().join(',')==='campus,campus_id,detail,event_date,extra,id,label,status'),'Unexpected projected fields '+view);checks++;
  console.log(JSON.stringify({view,total:payload.total,returned:payload.items.length}));
 }
 await denied("select get_porto_datos_generales('2026-09-01')");
 for(const sql of ['select * from finance_charge_facts()','select * from finance_payment_facts()','select * from finance_refund_facts()','select * from get_latest_finance_reconciliation_snapshot()','select * from list_pending_enrollments_full()','select * from search_receipts(null,null,null,5,0)','select * from list_teams_with_counts()','select * from list_auth_users()']){assert((await query(sql)).length===0,'RPC leaked rows '+sql);checks++;}
 await denied("insert into players(first_name,last_name,birth_date,gender) values('Blocked','Viewer','2015-01-01','male')");
 await denied("insert into user_roles(user_id,role_id) values($1,$2)",[viewer,roleId]);
 for(const table of ['players','guardians','payments','charges','attendance_records','training_groups']){
  const r=await db.query(`delete from ${table}`);assert(r.rowCount===0,'Viewer deleted data '+table);checks++;
 }
 for(const sql of ["select nuke_player('00000000-0000-0000-0000-000000000000')","select merge_players('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000001',$1,'probe')"]){
  await db.query('SAVEPOINT rpc');let blocked=false;
  try{await db.query(sql,sql.includes('$1')?[viewer]:[]);}catch(e){await db.query('ROLLBACK TO SAVEPOINT rpc');blocked=/unauthorized|permission|denied/i.test(e.message);}
  assert(blocked,'Write RPC not blocked');checks++;
 }
 await db.query('RESET ROLE');
 await denied("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='front_desk'",[viewer]);
 await asUser('dc312b26-880e-44ef-be6d-e02d467a9f08');
 for(const table of ['coaches','academy_events','area_map_entries','who_growth_reference']){assert(+(await query(`select count(*) n from ${table}`))[0].n===0,'Unassigned user leak');checks++;}
 await denied('select porto_operational_overview()');await denied('select get_porto_datos_generales()');
 await db.query('RESET ROLE');
 const staff=await query("select distinct on(r.code) ur.user_id,r.code from user_roles ur join app_roles r on r.id=ur.role_id where r.code<>'porto_viewer' order by r.code,ur.user_id");
 for(const s of staff){await asUser(s.user_id);assert((await query('select has_internal_staff_role() ok'))[0].ok,'Staff regression '+s.code);await denied('select porto_operational_overview()');checks++;}
 await db.query('ROLLBACK');console.log(JSON.stringify({checks,result:'PASS - all migration, fixtures and probes rolled back'}));
}
main().catch(async e=>{await db.query('ROLLBACK').catch(()=>{});console.error(e.code||'',e.message);process.exitCode=1;}).finally(()=>db.end());
