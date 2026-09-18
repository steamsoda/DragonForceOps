// Whole installed authenticated-definer surface, unassigned identity only.
// This complements role/campus tests; empty results do not prove staff scope.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
if(process.argv.length!==2) throw Error('Preview rollback only');
const {db,ref}=require('./test-director-readonly-db.cjs');
assert.equal(ref,'eqefgwdsqabnmpnbpqbq');
const q=async(sql,args=[]) => (await db.query(sql,args)).rows;
const empty=x=>x===null||x===false||(Array.isArray(x)&&x.length===0);
(async()=>{
 await db.connect();await db.query("begin; set local statement_timeout='15s'; set local lock_timeout='3s'");
 const functions=await q(`select p.oid::regprocedure::text signature,p.proname,
  (select coalesce(jsonb_agg(jsonb_build_object('type',format_type(t.oid,null),'category',t.typcategory,'name',t.typname,
   'enum',(select enumlabel from pg_enum where enumtypid=t.oid order by enumsortorder limit 1)) order by a.n),'[]')
   from unnest(p.proargtypes) with ordinality a(type_id,n) join pg_type t on t.oid=a.type_id) args
  from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
  and has_function_privilege('authenticated',p.oid,'execute') and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
  order by signature`);
 const id=randomUUID();await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,`no-access-${id}@example.invalid`]);
 await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",[JSON.stringify({sub:id,role:'authenticated'}),id]);
 await db.query('set local role authenticated');
 const results=[];
 for(const f of functions){
  const args=f.args.map(t=>{
   let value;
   if(t.category==='A') value='{}';
   else if(['json','jsonb'].includes(t.name)) value='[]';
   else if(t.enum!==null)value=t.enum;
   else if(t.name==='uuid')value='00000000-0000-0000-0000-000000000000';
   else if(t.category==='B')value='false';
   else if(t.category==='N')value='1';
   else if(t.category==='S')value='2026-09';
   else if(t.category==='D')value='2026-09-01';
   else throw Error(`Unsupported argument ${f.signature}`);
   return `'${value.replaceAll("'","''")}'::${t.type}`;
  }).join(',');
  await db.query('savepoint probe');let outcome;
  try{
   const rows=await q(`select * from public."${f.proname.replaceAll('"','""')}"(${args})`);
   outcome=rows.length===0||rows.every(r=>Object.values(r).every(empty))?'empty_or_false':'REVIEW_nonempty';
  }catch(e){outcome=e.code==='42501'?'denied':`REVIEW_${e.code}`;}
  finally{await db.query('rollback to savepoint probe; release savepoint probe');}
  results.push({signature:f.signature,outcome});
 }
 console.log(JSON.stringify({tested:results.length,results},null,2));
 assert.ok(results.every(r=>!r.outcome.startsWith('REVIEW')),'Unexpected responses require manual review');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{await db.query('rollback').catch(()=>{});await db.end();console.log('Rolled back all probes and identity.');});
