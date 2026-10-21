// Read-only hosted checks; only an owned temporary Auth identity is persisted.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { execSync } = require('node:child_process');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const production = process.argv.includes('--production');
if (production) assert.ok(process.argv.includes('--confirm-production-smoke'));
const dbOnly = process.argv.includes('--db-only');
assert.ok(!production || !dbOnly, 'DB rehearsal is Preview only');
const env = parseEnv(fs.readFileSync(production ? '../../.env.prod.local' : '../director-parity/.env.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, production ? 'https://hjvytfaalnfcqfgbxsmj.supabase.co' : 'https://eqefgwdsqabnmpnbpqbq.supabase.co');
const origin = production ? 'https://dragon-force-ops.vercel.app' : 'https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app';
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const retired = ['Copa Tigres 2026','Liga Golden Septiembre','Copa LH15 Septiembre','Rosa Power Cup 13 Edicion','Superliga Regia 17 Edicion'];
const marker = `.tmp/sales-retirement-${production ? 'production' : 'preview'}-identity.json`;
const runId = randomUUID(), cookies = [];
let userId, browser, session;
async function checked(p) { const r = await p; assert.ifError(r.error); return r.data; }
async function assign(code) {
  await checked(admin.from('user_roles').delete().eq('user_id',userId));
  const role = await checked(admin.from('app_roles').select('id').eq('code',code).single());
  await checked(admin.from('user_roles').insert({user_id:userId,role_id:role.id,campus_id:null}));
}
(async () => {
  assert.ok(!fs.existsSync(marker),'Previous test identity needs cleanup');
  const products = await checked(admin.from('products').select('id,name,sales_enabled,is_active'));
  const targets = products.filter(p => retired.includes(p.name));
  assert.equal(targets.length, production ? 5 : 3);
  assert.ok(targets.every(p => !p.sales_enabled && p.is_active));
  assert.ok(products.find(p => p.name==='McAllen Cup 2026')?.sales_enabled);
  const email = `sales-retirement-${runId}@fcportodragonforcemty.com`;
  userId = (await checked(admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{runId,purpose:'sales_retirement_smoke'}}))).user.id;
  fs.writeFileSync(marker,JSON.stringify({userId,runId}));
  await assign('front_desk');
  if (dbOnly) {
    const path = require('node:path').resolve('scripts/test-product-sales-retirement-db.sql');
    execSync(`supabase db query --linked --workdir .tmp/sales-retirement-db --file "${path}"`,{stdio:'inherit',windowsHide:true});
    return;
  }
  const link = await checked(admin.auth.admin.generateLink({type:'magiclink',email}));
  session = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{
    cookies:{getAll:()=>cookies,setAll:values=>{for(const v of values){const i=cookies.findIndex(c=>c.name===v.name);if(i<0)cookies.push(v);else cookies[i]=v;}}}
  });
  await checked(session.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'}));
  const campuses = await checked(admin.from('campuses').select('id,code').in('code',['CONTRY','LINDA_VISTA']));
  assert.equal(campuses.length,2);
  const enrollments = [];
  const copaCharges = await checked(admin.from('charges').select('enrollment_id').eq('copa_tigres_installments',true).neq('status','void'));
  assert.ok(copaCharges.length<1000,'Paginate Copa fixtures before testing');
  for(const campus of campuses){
    const rows = await checked(admin.from('enrollments').select('id').eq('campus_id',campus.id).eq('status','active').limit(100));
    const row = rows.find(e=>!copaCharges.some(c=>c.enrollment_id===e.id));
    assert.ok(row,'Need an existing enrollment without Copa debt');
    enrollments.push({...row,campus});
  }
  browser = await require(process.env.PLAYWRIGHT_MODULE).chromium.launch({channel:'chrome',headless:true});
  for(const role of ['front_desk','director_admin','director_readonly']){
    await assign(role);
    const context = await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
    try {
      await context.addCookies(cookies.map(c=>({name:c.name,value:c.value,url:origin,sameSite:'Lax'})));
      await context.routeWebSocket('**/*',s=>s.close());
      const page = await context.newPage();
      for(const enrollment of enrollments){
        const response = await page.goto(`${origin}/caja?enrollmentId=${enrollment.id}`,{waitUntil:'load',timeout:90000});
        assert.equal(response.status(),200);
        const toggle = page.getByRole('button',{name:'Mostrar catálogo completo',exact:true});
        await toggle.waitFor({timeout:90000});
        await page.getByText('Preparando catálogo…',{exact:true}).waitFor({state:'hidden',timeout:60000});
        const menu = page.getByText('Menú POS',{exact:true}).locator('../..');
        for(const name of retired) assert.ok(!(await menu.innerText()).includes(name),`${role}: retired tile ${name}`);
        await toggle.click();
        await page.getByRole('button',{name:'Catálogo completo activo',exact:true}).waitFor();
        await page.getByText('Preparando catálogo…',{exact:true}).waitFor({state:'hidden',timeout:60000});
        await page.getByRole('button',{name:/McAllen Cup 2026/}).waitFor({timeout:60000});
        for(const name of retired) assert.ok(!(await menu.innerText()).includes(name),`${role}: retired full-catalog tile ${name}`);
        assert.ok((await page.locator('body').innerText()).includes(`v${require('../package.json').version}`));
        console.log(`PASS ${role} ${enrollment.campus.code}: normal/full catalog retired products absent, McAllen present`);
      }
      if(role==='director_admin'){
        for(const campus of campuses){
          for(const name of ['Rosa Power Cup 13 Edicion','Superliga Regia 17 Edicion','McAllen Cup 2026']){
            const product = products.find(p=>p.name===name);
            await page.goto(`${origin}/sports-signups?campus=${campus.id}&competition=product%3A${product.id}`,{waitUntil:'domcontentloaded',timeout:90000});
            await page.getByRole('heading',{name,exact:true}).waitFor({timeout:60000});
          }
          console.log(`PASS sports listings preserved ${campus.code}`);
        }
      }
    } finally {await context.close();}
  }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  await browser?.close();
  if(!userId)return;
  await session?.auth.signOut();
  const owner=await checked(admin.auth.admin.getUserById(userId));
  assert.equal(owner.user.app_metadata.runId,runId);
  await checked(admin.from('user_roles').delete().eq('user_id',userId));
  await checked(admin.auth.admin.deleteUser(userId));
  assert.ok(!(await admin.auth.admin.getUserById(userId)).data.user);
  fs.unlinkSync(marker);
  console.log('PASS owned test identity/roles removed; no financial writes');
});
