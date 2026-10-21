const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { randomUUID } = require('node:crypto');
function load(file, modules = {}) {
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module: m, exports: m.exports, FormData, console, require: id => {
    if (id in modules) return modules[id];
    return new Proxy({}, { get: (_, key) => () => { throw Error(`Unexpected call ${id}.${String(key)}`); } });
  } });
  return m.exports;
}
const retired = ['Copa Tigres 2026','Liga Golden Septiembre','Copa LH15 Septiembre',
  'Rosa Power Cup 13 Edicion','Superliga Regia 17 Edicion'];
const products = [...retired, 'McAllen Cup 2026', 'Superliga Regia 18 Edicion'].map((name,i) => ({
  id:randomUUID(), name, is_active:true, sales_enabled:i>=5, copa_tigres_installments:i===0,
  charge_type_id:randomUUID(), default_amount:1995, requires_pricing_rule_match:false,
  has_sizes:false, sort_order:i, charge_types:{code:'cup'},
}));
const enrollment = randomUUID(), user = {id:randomUUID()};
let ledger, storedCharges = [], context, calls = 0;
function resetLedger() { ledger={ enrollment:{id:enrollment,status:'active',currency:'MXN'},
  accountCredit:{explicitAvailableAmount:0}, charges:[] }; storedCharges=[]; }
function query(table) {
  let single=false, filters=[];
  const q={ select:()=>q, eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},
    neq:(k,v)=>{filters.push(r=>r[k]!==v);return q;},
    in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;}, order:()=>q,returns:()=>q,
    maybeSingle:()=>{single=true;return q;},single:()=>{single=true;return q;},
    then:(resolve,reject)=>{
      const rows=table==='products'?products:table==='charges'?storedCharges:[];
      const data=rows.filter(r=>filters.every(f=>f(r)));
      return Promise.resolve({data:single?data[0]??null:data,error:null}).then(resolve,reject);
    }, insert:()=>{throw Error('Test must not create charges/payments');},update:()=>{throw Error('Unexpected write');} };
  return q;
}
const db={from:query,auth:{getUser:async()=>({data:{user}})}};
const domain=load('src/lib/finance/explicit-checkout.ts',{zod:require('zod')});
const modules={
  'next/cache':{revalidatePath(){}},'node:crypto':require('node:crypto'),
  '@/lib/auth/permissions':{getPermissionContext:async()=>context,canAccessEnrollmentRecord:async()=>true},
  '@/lib/auth/debug-view':{isDebugWriteBlocked:async()=>false},
  '@/lib/auth/director-account-reader':{directorAccountReader:async()=>true},
  '@/lib/supabase/server':{createClient:async()=>db},'@/lib/supabase/admin':{createAdminClient:()=>db},
  '@/lib/queries/billing':{getEnrollmentLedger:async()=>ledger},
  '@/lib/time':{getMonterreyDateString:()=> '2026-10-20'},
  '@/lib/product-groups':load('src/lib/product-groups.ts'),
  '@/lib/products/pricing-rules':load('src/lib/products/pricing-rules.ts'),
  '@/lib/finance/explicit-checkout':domain,
  '@/lib/payments/explicit-cart-server':{reviewExplicitCart:async(e,f,resolve)=>resolve(e,f,context)},
};
const caja=load('src/server/actions/caja.ts',modules);
const copa=load('src/server/actions/copa-tigres.ts',modules);
function check(value,label){assert.ok(value,label);calls++;}
(async()=>{
  for(const role of ['front_desk','director_admin']){
    context={user,isFrontDesk:role==='front_desk',isDirector:role==='director_admin',hasOperationalReadAccess:true,supabase:db};
    resetLedger();
    for(const full of [false,true]){
      const catalog=await caja.getProductsForCajaAction(undefined,full);
      const ids=catalog.flatMap(c=>c.products.map(p=>p.id));
      check(ids.length===2 && products.slice(5).every(p=>ids.includes(p.id)),`${role} normal/full catalog excludes only retired products`);
    }
    for(const p of products.slice(1,5)){
      for(const full of [false,true]){
        const form=new FormData();form.set('productId',p.id);form.set('amount','1995');
        if(full){form.set('catalogException','1');form.set('exceptionConfirmed','1');}
        const result=await caja.postCajaChargeAction(enrollment,form);
        check(!result.ok && result.error==='product_not_found',`${role} forged normal/full-catalog sale denied`);
      }
    }
    check((await copa.getCopaTigresOptionsAction(enrollment)).length===0,`${role} no new Copa sale`);
    const form=new FormData();form.set('cartItems',JSON.stringify([{kind:'copa_tigres',productId:products[0].id,amount:600}]));
    form.set('cartKeys',JSON.stringify([randomUUID()]));
    await assert.rejects(caja.reviewExplicitCajaCartAction(enrollment,form),/checkout_changed/);calls++;
    const chargeId=randomUUID();
    storedCharges=[{id:chargeId,product_id:products[0].id,enrollment_id:enrollment,copa_tigres_installments:true,status:'pending'}];
    ledger.charges=[{id:chargeId,allocatedAmount:600,pendingAmount:650,status:'pending',copaTigresInstallments:true}];
    const options=await copa.getCopaTigresOptionsAction(enrollment);
    check(options.length===1&&options[0].pending===650,`${role} existing Copa balance retained`);
    form.set('cartItems',JSON.stringify([{kind:'copa_tigres',productId:products[0].id,amount:650}]));
    const plan=await caja.reviewExplicitCajaCartAction(enrollment,form);
    check(plan.charges.length===0&&plan.snapshot.lines[0].chargeId===chargeId,`${role} existing settlement creates no new charge`);
    ledger.charges[0].pendingAmount=0;ledger.charges[0].allocatedAmount=1250;
    check((await copa.getCopaTigresOptionsAction(enrollment)).length===0,`${role} retired fully paid Copa not offered again`);
  }
  const sql=fs.readFileSync('supabase/migrations/20261021044249_product_sales_availability.sql','utf8');
  check(sql.includes('security invoker')&&sql.includes('before insert or update of product_id'),'DB guard covers new and reassigned product charges');
  check(sql.includes('new.product_id is not distinct from old.product_id'),'Existing charge operations preserved');
  check(sql.includes('with recursive included')&&sql.includes('where e.is_active'),'Bundle guard cannot bypass retired target');
  check(!/update public\.(tournaments|charges|payments)/i.test(sql),'Migration never rewrites history/tournaments');
  check(!/set is_active/i.test(sql),'Global activity untouched');
  console.log(`PASS ${calls} product sales-retirement action/source checks (DB integration still required).`);
})().catch(e=>{console.error(e);process.exitCode=1;});
