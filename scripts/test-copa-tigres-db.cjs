// Preview-only rollback rehearsal. No emails, real roles or persistent data changes.
const fs=require('node:fs'),assert=require('node:assert/strict'),{parseEnv}=require('node:util');
const {randomUUID}=require('node:crypto'),{Client}=require('pg');
const env=parseEnv(fs.readFileSync('../director-parity/.env.local','utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,'https://eqefgwdsqabnmpnbpqbq.supabase.co');
const url=new URL(env.SUPABASE_PREVIEW_DB_URL);
assert.ok(url.hostname==='db.eqefgwdsqabnmpnbpqbq.supabase.co'||decodeURIComponent(url.username)==='postgres.eqefgwdsqabnmpnbpqbq');
url.searchParams.delete('sslmode');
const db=new Client({connectionString:url.href,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
async function denied(sql,args=[],message){
 await db.query('savepoint denied');let error;
 try{await q(sql,args);}catch(e){error=e;}
 finally{await db.query('rollback to savepoint denied; release savepoint denied');}
 check(error && (!message || error.message.includes(message)),message||'Expected denial');
}
async function identity(id){await db.query('reset role');await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:id,role:'authenticated'}),id]);await db.query('set local role authenticated');}
(async()=>{
 await db.connect();await db.query("begin;set local lock_timeout='3s';set local statement_timeout='20s'");
 if (process.argv.includes('--installed')) {
  check((await q("select 1 from supabase_migrations.schema_migrations where version='20260921180000'")).length===1,'Installed migration exists');
 } else {
  await db.query(fs.readFileSync('supabase/migrations/20260921180000_copa_tigres_installments.sql','utf8'));
 }
 const product=(await q("select id from products where copa_tigres_installments"))[0].id;
 const enrollments=await q("select e.id,e.campus_id from enrollments e where e.status='active' and exists(select 1 from training_group_assignments a where a.enrollment_id=e.id and a.end_date is null) order by e.id limit 2");
 assert.equal(enrollments.length,2);
 const e=enrollments[0],e2=enrollments[1],actor=randomUUID();
 await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[actor,`copa-test-${actor}@example.invalid`]);
 await identity(actor);
 const call='select public.pay_copa_tigres_installment($1,$2,$3,$4,$5,$6) result';
 await denied(call,[e.id,product,600,'card',e.campus_id,randomUUID()],'forbidden');
 await db.query('reset role');
 await q("select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true)");
 await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='superadmin'",[actor]);
 const credit=(await q("insert into enrollment_credits(enrollment_id,campus_id,source_workflow,original_amount,reason,created_by) values($1,$2,'manual_admin_credit',200,'test',$3) returning id",[e.id,e.campus_id,actor]))[0].id;
 await identity(actor);
 await denied(call,[e.id,product,599,'card',e.campus_id,randomUUID()],'invalid_installment');
 await denied(call,[e.id,product,650,'card',e.campus_id,randomUUID()],'invalid_installment');
 await denied(call,[e.id,product,601,'card',e.campus_id,randomUUID()],'invalid_installment');
 const request=randomUUID();
 const first=(await q(call,[e.id,product,600,'card',e.campus_id,request]))[0].result;
 const retry=(await q(call,[e.id,product,600,'card',e.campus_id,request]))[0].result;
 check(first.payment_id===retry.payment_id,'Idempotent retry');
 await denied(call,[e.id,product,1250,'card',e.campus_id,request],'request_conflict');
 await denied(call,[e.id,product,600,'cash',e.campus_id,request],'request_conflict');
 await denied(call,[e.id,product,600,'card',e.campus_id,randomUUID()],'invalid_installment');
 await denied(call,[e.id,product,649,'card',e.campus_id,randomUUID()],'invalid_installment');
 await db.query('reset role');
 const charge=(await q('select id,amount from charges where product_id=$1 and enrollment_id=$2',[product,e.id]))[0];
 check(Number(charge.amount)===1250,'One full-price charge');
 check((await q('select notes from payments where id=$1',[first.payment_id]))[0].notes.includes('saldo $650'),'Persisted receipt installment breakdown');
 check((await q("select 1 from tournament_player_entries where enrollment_id=$1 and charge_id=$2 and entry_status='confirmed'",[e.id,charge.id])).length===1,'Deposit reserves tournament entry');
 const tournament=(await q('select tournament_id from tournament_player_entries where enrollment_id=$1 and charge_id=$2',[e.id,charge.id]))[0].tournament_id;
 await q('select public.sync_paid_tournament_entries_for_charges($1,$2::uuid[])',[e.id,[charge.id]]);
 await q('select public.refresh_competition_roster_teams($1)',[tournament]);
 check((await q("select 1 from tournament_player_entries where enrollment_id=$1 and charge_id=$2 and entry_status='confirmed'",[e.id,charge.id])).length===1,'Deposit survives reconciliation and refresh');
 check((await q('select 1 from competition_roster_squad_members m join competition_roster_squads s on s.id=m.squad_id where m.enrollment_id=$1 and s.tournament_id=$2',[e.id,tournament])).length===1,'Deposit player routed to exactly one squad');
 check((await q('select count(*)::int n from enrollment_credit_applications where credit_id=$1',[credit]))[0].n===0,'Existing credit untouched by installment');
 await denied('insert into enrollment_credit_applications(credit_id,charge_id,amount,applied_by) values($1,$2,1,$3)',[credit,charge.id,actor],'no_credit');
 await denied('insert into payment_allocations(payment_id,charge_id,amount) values($1,$2,1)',[first.payment_id,charge.id],'use_installment');
 await identity(actor);
 await q(call,[e.id,product,650,'cash',e.campus_id,randomUUID()]);
 await denied(call,[e.id,product,650,'card',e.campus_id,randomUUID()],'invalid_installment');
 await q(call,[e2.id,product,1250,'card',e2.campus_id,randomUUID()]);
 await db.query('reset role');
 check((await q('select count(*)::int n from charges where product_id=$1 and enrollment_id=$2',[product,e.id]))[0].n===1,'No duplicate charge');
 check(Number((await q('select sum(amount) n from payment_allocations where charge_id=$1',[charge.id]))[0].n)===1250,'Settled exactly');
 await denied('insert into enrollment_credit_applications(credit_id,charge_id,amount,applied_by) values($1,$2,1,$3)',[credit,charge.id,actor],'no_credit');
 await q("select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true)");
 await q('delete from user_roles where user_id=$1',[actor]);
 await q("insert into user_roles(user_id,role_id,campus_id) select $1,id,$2 from app_roles where code='front_desk'",[actor,e.campus_id]);
 await identity(actor);
 check((await q(call,[e.id,product,600,'card',e.campus_id,request]))[0].result.payment_id===first.payment_id,'Front Desk own-campus retry');
 await db.query('reset role');
 const otherCampus=(await q('select id from campuses where is_active and id<>$1 limit 1',[e.campus_id]))[0].id;
 await identity(actor);
 await denied(call,[e.id,product,600,'card',otherCampus,randomUUID()],'forbidden');
 await db.query('reset role');
 await q('update auth.users set email_confirmed_at=null where id=$1',[actor]);
 await identity(actor);
 await denied(call,[e.id,product,600,'card',e.campus_id,request],'forbidden');
 await db.query('reset role');
 await q('update auth.users set email_confirmed_at=now() where id=$1',[actor]);
 await q("select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true)");
 await q('delete from user_roles where user_id=$1',[actor]);
 await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='director_readonly'",[actor]);
 await identity(actor);
 await denied(call,[e.id,product,600,'card',e.campus_id,randomUUID()],'forbidden');
 await db.query('reset role');
 check(!(await q("select has_function_privilege('anon','public.pay_copa_tigres_installment(uuid,uuid,numeric,payment_method,uuid,uuid)','execute') allowed"))[0].allowed,'Anonymous denied');
 console.log(`PASS ${checks} Copa Tigres DB checks; rollback follows.`);
})().catch(e=>{console.error(e.code||'',e.message,e.where||'');process.exitCode=1}).finally(async()=>{await db.query('rollback').catch(()=>{});await db.end();console.log('Preview transaction rolled back.');});
