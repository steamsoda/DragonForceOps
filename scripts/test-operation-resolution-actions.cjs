const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const enrollment='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222';
let context=null,debug=false,scope=true,calls=[],rpcError=null,badData=false,cacheFails=false,checks=0;
const result={kind:'cart',requestId:request,outcome:'cancelled_uncommitted',receipt:null};
const modules={zod:require('zod'),'next/cache':{revalidatePath:()=>{if(cacheFails)throw Error('cache failure');}},
  '@/lib/auth/permissions':{getPermissionContext:async()=>context,canAccessEnrollmentRecord:async()=>scope},
  '@/lib/auth/campuses':{canAccessCampus:()=>scope},
  '@/lib/auth/director-readonly-policy':{directorReadOnlyEnabled:()=>true},
  '@/lib/auth/debug-view':{isDebugWriteBlocked:async()=>debug}};
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/server/actions/operation-resolution.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
{module:m,exports:m.exports,require:id=>{if(!(id in modules))throw Error(id);return modules[id];}});
const actions=m.exports,command={enrollmentId:enrollment,requestId:request,kind:'cart',reason:'Verified with operator',confirmed:true};
const check=(value,message)=>{assert.ok(value,message);checks++;};
function role(flags){context={roleCodes:[],...flags,supabase:{from:table=>{assert.equal(table,'v_director_readonly_enrollments');return{select:()=>({eq:()=>({maybeSingle:async()=>({data:{campus_id:'campus'},error:null})})})};},rpc:async(name,args)=>{calls.push({name,args});return{error:rpcError,data:badData?{}:name==='list_explicit_pending_operations'?{pending:[],history:[]}:result};}}};}
(async()=>{
  check(!(await actions.loadPendingOperations(enrollment)).ok,'Anonymous list denied');
  check(!(await actions.resolvePendingOperation(command)).ok,'Anonymous resolve denied');
  role({isFrontDesk:true});
  check(!(await actions.loadPendingOperations(enrollment)).ok,'Front Desk list denied');
  check(!(await actions.resolvePendingOperation(command)).ok,'Front Desk resolve denied');
  check(calls.length===0,'Unauthorized paths never call database');
  role({isDirectorReadOnly:true});
  check((await actions.loadPendingOperations(enrollment)).readOnly,'Read-only Director can inspect');
  scope=false;check(!(await actions.loadPendingOperations(enrollment)).ok,'Read-only enrollment campus scope enforced');scope=true;
  check(!(await actions.resolvePendingOperation(command)).ok,'Read-only Director cannot resolve');
  role({isDirector:true,roleCodes:['porto_viewer']});check(!(await actions.resolvePendingOperation(command)).ok,'Porto veto retained');
  role({isDirector:true});debug=true;check(!(await actions.resolvePendingOperation(command)).ok,'Debug view blocked');debug=false;
  scope=false;check(!(await actions.resolvePendingOperation(command)).ok,'Enrollment scope enforced');scope=true;
  check(!(await actions.resolvePendingOperation({...command,confirmed:false})).ok,'Explicit confirmation required');
  check(!(await actions.resolvePendingOperation({...command,reason:'x'})).ok,'Meaningful reason required');
  check(!(await actions.resolvePendingOperation({...command,actorId:request})).ok,'Client cannot supply actor');
  check((await actions.resolvePendingOperation(command)).ok,'Director resolution succeeds');
  check(calls.at(-1).args.p_request===request&&!('p_actor'in calls.at(-1).args),'Identity comes from authenticated session');
  rpcError={message:'operation_too_recent'};check((await actions.resolvePendingOperation(command)).code==='operation_too_recent','Waiting-period error explained');
  rpcError={message:'secret internal host'};const hidden=await actions.resolvePendingOperation(command);
  check(hidden.code==='unavailable'&&!JSON.stringify(hidden).includes('secret'),'Internal errors not exposed');rpcError=null;
  cacheFails=true;check((await actions.resolvePendingOperation(command)).ok,'Cache failure cannot undo recorded resolution');cacheFails=false;
  badData=true;check(!(await actions.loadPendingOperations(enrollment)).ok,'Malformed list fails closed');
  check(!(await actions.resolvePendingOperation(command)).ok,'Wrong response identity rejected');
  console.log(`PASS ${checks} Director resolution action checks.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
