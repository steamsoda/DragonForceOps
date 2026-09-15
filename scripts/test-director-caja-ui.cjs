const assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),ts=require("typescript");
function load(file,modules,globals={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,URL,URLSearchParams,Request,...globals,require:id=>{if(!(id in modules))throw Error(id);return modules[id];}});return m.exports;}
let readonly=true,calls=[],errors=[];
const actions={};
for(const name of ["getCajaDrilldownMetaAction","searchPlayersForCajaAction","listCajaPlayersByCampusYearAction","getEnrollmentForCajaAction","getProductsForCajaAction","getCajaCatalogExceptionAccessAction"])actions[name]=async(...args)=>{calls.push({name,args});return "staff";};
const hooks=load("src/components/caja/use-caja-reads.ts",{
 react:{useMemo:fn=>fn()},"@/components/auth/read-only-controls":{useDirectorReadOnly:()=>readonly},"@/server/actions/caja":actions,
},{fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>"reader"};}});
let ctx=null,valid=true,enabled=true,rpcCalls=[],accountCalls=0;
const id="11111111-1111-4111-8111-111111111111";
const context={isDirectorReadOnly:true,campusAccess:{campusIds:[id],campuses:[{id,name:"Contry"}]},supabase:{rpc:async(name,args)=>{
 rpcCalls.push({name,args});return {error:null,data:name==="is_director_readonly"?valid:name==="director_caja_years"?[{campus_id:id,birth_year:2015}]:[{player_id:id,player_name:"Alumno",birth_year:2015,enrollment_id:id,campus_name:"Contry",balance:"700",team_name:null,coach_name:null}]};
}}};
const api=load("src/app/api/director-readonly/caja/route.ts",{
 "next/server":{NextResponse:{json:(body,options={})=>({body,status:options.status??200,headers:options.headers})}},zod:require("zod"),
 "@/lib/auth/permissions":{getPermissionContext:async()=>ctx},
 "@/lib/auth/director-readonly-policy":{directorReadOnlyEnabled:()=>enabled},
 "@/server/actions/caja":{getEnrollmentForCajaAction:async()=>{accountCalls++;return {balance:700};},getProductsForCajaAction:async()=>[]},
});
const request=q=>new Request(`https://example.test/api/director-readonly/caja?${q}`);
(async()=>{
 let read=hooks.useCajaReads(e=>errors.push(e));
 await read.meta();await read.search("Alumno");await read.year(id,2015);await read.account(id);await read.products(id,true);assert.equal(await read.fullCatalog(),true);
 assert.equal(calls.length,5);assert.ok(calls.every(c=>c.url.startsWith("/api/director-readonly/caja?")&&c.options.cache==="no-store"&&!c.options.method));
 readonly=false;calls=[];read=hooks.useCajaReads(e=>errors.push(e));
 await read.meta();await read.search("Alumno");await read.year(id,2015);await read.account(id);await read.products(id,true);await read.fullCatalog();
 assert.equal(calls.length,6);assert.ok(calls.every(c=>c.name));
 assert.equal((await api.GET(request("mode=meta"))).status,401);
 ctx={...context,isDirectorReadOnly:false};assert.equal((await api.GET(request("mode=meta"))).status,403);
 ctx=context;enabled=false;assert.equal((await api.GET(request("mode=meta"))).status,403);enabled=true;
 for(const q of ["mode=write","mode=account&enrollmentId=bad","mode=meta&mode=meta","mode=meta&table=payments","mode=search&q=a"]){assert.equal((await api.GET(request(q))).status,400);}
 assert.equal(rpcCalls.length,0);valid=false;assert.equal((await api.GET(request("mode=meta"))).status,403);valid=true;
 const meta=await api.GET(request("mode=meta"));assert.equal(meta.body.birthYearsByCampus[id][0],2015);
 const results=await api.GET(request("mode=search&q=Alumno"));assert.equal(results.body[0].balance,700);assert.equal(results.headers["Cache-Control"],"private, no-store");
 assert.equal((await api.GET(request(`mode=account&enrollmentId=${id}`))).body.balance,700);assert.equal(accountCalls,1);
 assert.equal((await api.GET(request("mode=year&campus=22222222-2222-4222-8222-222222222222&year=2015"))).status,403);
 assert.equal(api.POST,undefined);
 const source=fs.readFileSync("src/components/caja/caja-client.tsx","utf8");
 for(const name of ["submitVoid","submitCashRefund","submitNote","handlePaymentSubmit","handleChargeSubmit","handleCheckoutSubmit","handleTuitionSubmit","handleSubmit"]){
  const start=source.indexOf(`function ${name}(`),body=source.slice(start,source.indexOf("startTransition",start));
  assert.ok(start>=0&&body.includes("if (readOnly) return;"),`${name} must block before calling a write`);
 }
 for(const button of source.matchAll(/<button\b[\s\S]*?<\/button>/g))assert.doesNotMatch(button[0],/type="submit"/);
 assert.ok(source.includes("<WriteButton"));
 console.log("PASS: Caja read-only GET transport, staff action compatibility, API validation/revocation/campus controls and write-handler guards.");
})().catch(e=>{console.error(e);process.exitCode=1;});
