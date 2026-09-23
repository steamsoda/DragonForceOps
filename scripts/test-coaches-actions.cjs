const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let checks=0,context,debug,events,providerFailure,rpcError,recordError;
const check=(v,m)=>{assert.ok(v,m);checks++};
const admin={
 rpc:async(name,args)=>{events.push({name,args});return {data:name==='depart_coach'?'linked-user':null,error:rpcError};},
 auth:{admin:{updateUserById:async(id,args)=>{events.push({name:'provider',id,args});if(providerFailure==='throw')throw Error('network');return {error:providerFailure?{message:'provider down'}:null};}}},
 from:()=>({update:args=>({eq:async()=>{events.push({name:'record',args});return {error:recordError}}}),select:()=>({eq:()=>({maybeSingle:async()=>({data:{user_id:'linked-user'},error:null})})})}),
};
const moduleExports={exports:{}};
const dependencies={
 'next/cache':{revalidatePath:()=>{}},
 '@/lib/auth/permissions':{getPermissionContext:async()=>context},
 '@/lib/auth/debug-view':{isDebugWriteBlocked:async()=>debug},
 '@/lib/supabase/admin':{createAdminClient:()=>admin},
 '@/lib/training-groups/shared':{formatTrainingGroupDisplayName:x=>x.name},
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/server/actions/coaches.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleExports,exports:moduleExports.exports,Date,require:id=>{assert.ok(id in dependencies,id);return dependencies[id]}});
const run=moduleExports.exports.manageCoachAction;
const depart={operation:'depart',id:'coach',expected:'version',groups:[],reason:'Approved departure'};
function reset(){context={user:{id:'actor'},isSuperAdmin:true,isDirector:true,isSportsDirector:true};debug=false;events=[];providerFailure=false;rpcError=null;recordError=null;}
(async()=>{
 reset();context=null;check(!(await run(depart)).ok&&events.length===0,'Anonymous denied before admin');
 reset();debug=true;check(!(await run(depart)).ok&&events.length===0,'Debug/read-only denied');
 reset();context.isSuperAdmin=false;check(!(await run(depart)).ok&&events.length===0,'Non-superadmin departure denied');
 reset();rpcError={message:'stale_coach'};check(!(await run(depart)).ok&&events.length===1,'Stale departure does not ban');
 reset();providerFailure=true;let result=await run(depart);
 check(result.ok&&result.providerPending,'Provider failure reported after successful local block');
 check(events[0].name==='depart_coach'&&events[1].name==='provider','Deny commits before provider request');
 check(events[2].args.provider_error===true&&events[2].args.provider_revoked_at===null,'Failure remains retryable');
 reset();providerFailure='throw';result=await run(depart);check(result.ok&&result.providerPending,'Network exception leaves local departure complete');
 reset();result=await run({operation:'retry',id:'coach'});check(result.ok&&!result.providerPending&&events[0].name==='provider','Retry does not repeat departure');
 reset();recordError={message:'unavailable'};result=await run(depart);check(result.ok&&result.providerPending,'Unrecorded provider result not reported complete');
 reset();result=await run(depart);check(result.ok&&!result.providerPending&&events[2].args.provider_revoked_at,'Successful provider confirmation recorded');
 console.log(`PASS ${checks} coach action checks`);
})().catch(e=>{console.error(e);process.exitCode=1});
