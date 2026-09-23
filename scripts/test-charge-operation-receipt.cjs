const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,modules,globals={}) {
  const m={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {module:m,exports:m.exports,console,...globals,require:id=>{if(!(id in modules))throw Error(id);return modules[id];}});
  return m.exports;
}
const domain=load('src/lib/finance/charge-operation-receipt.ts',{zod:require('zod')});
const id='11111111-1111-4111-8111-111111111111',charge='22222222-2222-4222-8222-222222222222';
const receipt={operationId:id,enrollmentId:id,chargeId:charge,kind:'credit',playerName:'Test Player',campusName:'Contry',operator:'test@example.invalid',
  description:'Tournament',currency:'MXN',chargeAmount:400,cashReturned:0,creditGenerated:100,creditRestored:300,
  occurredAt:'2026-09-22T02:00:00Z',recordedAt:'2026-09-22T02:00:00Z',reason:'Test',paymentReferences:['TEST-001']};
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
let context=null,ledger=null,stored=receipt,dbError=null,reads=0;
const route=load('src/app/api/charge-operation-receipt/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,...options})}},zod:require('zod'),
  '@/lib/auth/permissions':{getPermissionContext:async()=>context},
  '@/lib/queries/billing':{getEnrollmentLedger:async()=>ledger},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>{reads++;return {select(){return this},eq(){return this},async maybeSingle(){return {data:stored?{receipt:stored}:null,error:dbError}}}}})},
  '@/lib/finance/charge-operation-receipt':domain,
},{URL});
const jobs=[];
const printer=load('src/lib/printer.ts',{
  ...require('./fixtures/reliability-modules.cjs')(),
  '@/lib/finance/checkout-receipt':load('src/lib/finance/checkout-receipt.ts',{}),
  '@/lib/perf/timing':{createPerfTimer:()=>({mark(){}})},'@/lib/finance/charge-operation-receipt':domain,
},{process:{env:{}},btoa:v=>Buffer.from(v,'binary').toString('base64'),window:{qz:{websocket:{isActive:()=>true},configs:{create:()=>({})},print:async(config,items)=>jobs.push(items)}}});
(async()=>{
  check(domain.cancellationLabel(0)==='Cancelar cargo','Unpaid label');
  check(domain.cancellationLabel(100).includes('crédito'),'Paid label');
  check(domain.operationReceiptLines(receipt).includes('No se entrego efectivo.'),'Credit not cash');
  check(domain.operationReceiptLines({...receipt,creditGenerated:0,creditRestored:0}).some(v=>v.includes('Sin movimiento')),'Unpaid receipt');
  check(domain.operationReceiptLines({...receipt,kind:'cash',cashReturned:100,creditGenerated:0})[0]==='COMPROBANTE DE REEMBOLSO','Refund title');
  const request={url:`https://test.invalid/api/charge-operation-receipt?enrollmentId=${id}&chargeId=${charge}`};
  check((await route.GET(request)).status===403 && reads===0,'Anonymous denied before privileged read');
  context={roleCodes:[],isFrontDesk:true};
  check((await route.GET(request)).status===403 && reads===0,'Out of scope denied before privileged read');
  ledger={charges:[{id:charge}]};
  let result=await route.GET(request);
  check(result.body.operationId===id && result.headers['Cache-Control']==='private, no-store','Authorized immutable result not cached');
  context={roleCodes:['porto_viewer'],isDirector:true};
  check((await route.GET(request)).status===403,'Legacy viewer denied');
  context={roleCodes:[],isDirectorReadOnly:true};
  check((await route.GET(request)).body.chargeId===charge,'Reviewed reader can inspect scoped receipt');
  stored=null;check((await route.GET(request)).status===404,'Historical receipt never reconstructed');
  stored={...receipt,enrollmentId:charge};check((await route.GET(request)).status===503,'Mismatched stored identity rejected');
  stored=receipt;dbError={message:'private error'};check((await route.GET(request)).status===503,'Database failure does not leak details');
  await printer.printChargeOperationReceipt('TEST',receipt);
  await printer.printChargeOperationReceipt('TEST',receipt);
  check(JSON.stringify(jobs[0])===JSON.stringify(jobs[1]),'Reprints use identical bytes');
  const text=jobs[0].map(i=>Buffer.from(i.data,'base64').toString('latin1')).join('');
  check(text.includes('Credito generado: $100.00') && text.includes('Credito previo restaurado: $300.00'),'Printed money buckets exact');
  check(text.includes('COPIA CLIENTE')&&text.includes('COPIA ACADEMIA'),'Both copies included');
  await printer.printChargeOperationReceipt('TEST',{...receipt,reason:'Injected\x1b\x40text'});
  check(!jobs[2].map(i=>Buffer.from(i.data,'base64').toString('latin1')).join('').includes('Injected\x1b'),'Reason cannot inject printer command');
  console.log(`PASS ${checks} receipt access/content/printing checks. QZ fully mocked.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
