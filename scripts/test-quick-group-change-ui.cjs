const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,modules={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:id=>{if(!(id in modules))throw Error(id);return modules[id];}});return m.exports;}
let context=null,debug=false,calls=[],error=null,invalidated=[];
const actions=load('src/server/actions/quick-group-change.ts',{
 zod:require('zod'),'next/cache':{revalidatePath:p=>invalidated.push(p)},
 '@/lib/auth/permissions':{getPermissionContext:async()=>context},
 '@/lib/auth/debug-view':{assertDebugWritesAllowed:async()=>{if(debug)throw Error('read only');}},
});
const dto={enrollmentId:'11111111-1111-4111-8111-111111111111',assignmentId:null,targetId:'22222222-2222-4222-8222-222222222222'};
const makeContext=overrides=>({roleCodes:[],supabase:{rpc:async(...args)=>{calls.push(args);return {data:[],error};}},...overrides});
(async()=>{
 assert.equal((await actions.quickChangeTrainingGroup(dto)).ok,false);assert.equal(calls.length,0);
 context=makeContext({isDirector:true,isDirectorReadOnly:true});assert.equal((await actions.quickChangeTrainingGroup(dto)).ok,false);assert.equal(calls.length,0);
 context=makeContext({isDirector:true,roleCodes:['porto_viewer']});await actions.getGroupChangeOptions(dto.targetId);assert.equal(calls.length,0);
 context=makeContext({isAttendanceAdmin:true});debug=true;assert.equal((await actions.quickChangeTrainingGroup(dto)).ok,false);assert.equal(calls.length,0);debug=false;
 assert.equal((await actions.quickChangeTrainingGroup({...dto,targetId:'bad'})).ok,false);assert.equal(calls.length,0);
 assert.equal((await actions.quickChangeTrainingGroup(dto)).ok,true);assert.equal(calls[0][0],'quick_change_training_group');assert.equal(calls[0][1].p_assignment,null);assert.ok(invalidated.includes('/caja'));
 error={message:'assignment_changed'};assert.match((await actions.quickChangeTrainingGroup(dto)).error,/vuelve a abrir/);
 const logic=load('src/lib/training-groups/quick-change.ts');const g={campus:'Linda Vista',name:'2014',program:'futbol_para_todos',birth_year_min:2014,birth_year_max:2014,gender:'male',professor:'Arturo',schedule:[{day:7,start:'09:00',end:'10:00'}]};
 assert.equal(logic.isSuggestedGroup(g,2015),false);assert.equal(logic.isSuggestedGroup(g,2014),true);assert.equal(logic.groupChoiceLabel(g),'Linda Vista | 2014');assert.match(logic.groupChoiceDetail(g),/Dom 09:00-10:00/);
 const page=fs.readFileSync('src/app/(protected)/players/page.tsx','utf8');assert.ok(page.indexOf('!permissionContext.hasPlayerRosterAccess && permissionContext.isAttendanceAdmin')<page.indexOf('const params = await searchParams'));
 assert.match(page,/canChangeGroups = false/);assert.match(page,/!withdrawn && canChangeGroups/);
 assert.doesNotMatch(page.slice(page.indexOf('if (isDirectorReadOnly(permissionContext))'),page.indexOf('const dropoutTo')), /canChangeGroups\s*\/>/);
 const ui=fs.readFileSync('src/components/players/quick-group-change.tsx','utf8');assert.match(ui,/group\.campus_id|g\.campus_id/);assert.match(ui,/Confirmar cambio/);assert.doesNotMatch(ui,/draggable/);
 const caja=fs.readFileSync('src/components/caja/caja-client.tsx','utf8');assert.doesNotMatch(caja,/QuickGroupChange|changedGroupLabel/);
 console.log('PASS: action role/debug/input guards, RPC contract, invalidation, stale-state messaging, labels, field-admin route, explicit confirmation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
