const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
if (process.argv.slice(2).some(arg=>arg!=='--contract-only')) throw Error('Only --contract-only supported; Preview rollback only');
const { main,db,ref } = require('./test-director-readonly-db.cjs');
if(ref!=='eqefgwdsqabnmpnbpqbq') throw Error('Preview only');
const migration = fs.readFileSync('supabase/migrations/20260918200000_least_privilege_director_projections.sql','utf8');
const q = async (sql,args=[]) => (await db.query(sql,args)).rows;
async function readerTiming() {
 const result={};
 for(const resource of ['players','training_group_assignments','attendance_records']) {
  const times=[];
  for(let i=0;i<3;i++) {
   const plan=(await q(`explain(analyze,format json,timing off) select id from public.v_director_readonly_${resource} order by id limit 25`))[0]['QUERY PLAN'][0];
   times.push(plan['Planning Time']+plan['Execution Time']);
  }
  result[resource]=times.sort((a,b)=>a-b)[1];
 }
 return result;
}
async function denied(sql) {
 await db.query('savepoint deny');
 let code;
 try {await db.query(sql);} catch(e) {code=e.code;}
 finally {await db.query('rollback to savepoint deny; release savepoint deny');}
 assert.equal(code,'42501',sql);
}
(async()=>{
 if (process.argv.includes('--contract-only')) {
  await db.connect();await db.query("begin; set local statement_timeout='15s'; set local lock_timeout='3s'");
  const timingId=randomUUID();
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[timingId,`timing-${timingId}@example.invalid`]);
  await q("insert into public.user_roles(user_id,role_id) select $1,id from public.app_roles where code='director_readonly'",[timingId]);
  await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:timingId,role:'authenticated'}),timingId]);
  await db.query('set local role authenticated');
  const before=await readerTiming();
  await db.query('reset role');
  await db.query(migration);
  await db.query('set local role authenticated');
  const after=await readerTiming();
  for(const key of Object.keys(before)) assert.ok(after[key]<=Math.max(before[key]*2,before[key]+20),`Reader query regression: ${key}`);
  console.log(JSON.stringify({readerMedianServerMs:{before,after},samples:3}));
 } else await main({installed:true,migrationSql:migration});
 await db.query('reset role');
 await q("select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true)");
 // Idempotence must not add grants or broaden the projection contract.
 await db.query(migration);
 const role = (await q("select * from pg_roles where rolname='director_projection_reader'"))[0];
 for(const key of ['rolcanlogin','rolsuper','rolinherit','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls']) assert.equal(role[key],false,key);
 const views=await q(`select c.relname,c.reloptions from pg_class c where c.relnamespace='public'::regnamespace and c.relname like 'v_director_readonly_%'`);
 assert.equal(views.length,38);
 assert.ok(views.every(v=>v.reloptions.includes('security_invoker=true')));
 assert.equal((await q("select count(*)::int n from pg_class where relnamespace='director_readonly_private'::regnamespace and relowner='director_projection_reader'::regrole"))[0].n,38);
 const unexpected=await q(`select c.relname,a.attname from pg_class c join pg_attribute a on a.attrelid=c.oid
  where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
  and has_column_privilege('director_projection_reader',c.oid,a.attnum,'SELECT') is distinct from exists(
   select 1 from pg_class v join pg_attribute va on va.attrelid=v.oid and va.attname=a.attname and va.attnum>0 and not va.attisdropped
   where v.relnamespace='director_readonly_private'::regnamespace and v.relname=c.relname)`);
 assert.deepEqual(unexpected,[],'Owner must have exactly the projected public columns, nothing more');
 const id=randomUUID();
 await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`projection-${id}@example.invalid`]);
 await q("insert into public.user_roles(user_id,role_id) select $1,id from public.app_roles where code='director_readonly'",[id]);
 await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:id,role:'authenticated'}),id]);
 await db.query('set local role director_projection_reader');
 assert.equal((await q("select has_column_privilege(current_user,'public.players','id','SELECT') allowed"))[0].allowed,true);
 assert.equal((await q("select row_security_active('public.players') enabled"))[0].enabled,true);
 await denied('select * from public.players');
 await denied('select amount from public.charges limit 1');
 await denied('select email from auth.users limit 1');
 await denied('delete from public.players where false');
 await denied('update public.players set first_name=first_name where false');
 await denied('create table director_readonly_private.forbidden(id int)');
 await db.query('reset role');
 await q('update auth.users set banned_until=now()+interval \'1 day\' where id=$1',[id]);
 await db.query('set local role authenticated');
 assert.equal((await q('select id from director_readonly_private.players limit 1')).length,0,'RLS must revoke private projection reads too');
 await db.query('reset role');
 // SET ROLE permission uses session_user, which is postgres in this harness.
 // Check the actual API session/claim roles, not this privileged connection.
 for(const clientRole of ['authenticator','authenticated','anon']) {
  assert.equal((await q("select pg_has_role($1,'director_projection_reader','MEMBER') member",[clientRole]))[0].member,false);
 }
 await db.query('reset role');
 await db.query('set local role anon');
 await denied('select * from public.v_director_readonly_players limit 1');
 await denied('select * from director_readonly_private.players limit 1');
 console.log('PASS: all 38 public views invoker; restricted non-login owner, column permissions, active RLS, revocation, no writes/finance/auth access, no API role assumption, idempotence.');
})().catch(e=>{console.error(e.code||'',e.message);process.exitCode=1;}).finally(async()=>{
 await db.query('rollback').catch(()=>{});await db.end();console.log('Rolled back all DDL, role creation and fixtures.');
});
