// Synthetic Preview identities/records only. Never sends email or touches real coaches.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {parseEnv}=require('node:util'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
const {createClient}=require('@supabase/supabase-js'),{createServerClient}=require('@supabase/ssr');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const env=parseEnv(fs.readFileSync('../director-parity/.env.local','utf8'));
const ref='eqefgwdsqabnmpnbpqbq',origin='https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,`https://${ref}.supabase.co`);
const url=new URL(env.SUPABASE_PREVIEW_DB_URL);url.searchParams.delete('sslmode');
assert.ok(url.hostname===`db.${ref}.supabase.co`||decodeURIComponent(url.username)===`postgres.${ref}`);
const db=new Client({connectionString:url.href,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const stateFile='.tmp/profesores-smoke.json',purpose='profesores_preview_smoke';
const state={ref,purpose,runId:randomUUID(),users:[],coaches:[],group:null};
let browser,activePage,started=false,checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;};
const persist=()=>fs.writeFileSync(stateFile,JSON.stringify(state));
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
async function identity(role){
 const email=`coach-test-${randomUUID()}@fcportodragonforcemty.com`;
 const created=await admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{purpose,runId:state.runId}});
 assert.ifError(created.error);const id=created.data.user.id;state.users.push(id);persist();
 await q('insert into user_roles(user_id,role_id) select $1,id from app_roles where code=$2',[id,role]);
 const link=await admin.auth.admin.generateLink({type:'magiclink',email});assert.ifError(link.error);
 const cookies=[];
 const session=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY??env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>cookies,setAll:items=>{for(const c of items){const i=cookies.findIndex(x=>x.name===c.name);if(i<0)cookies.push(c);else cookies[i]=c;}}}});
 assert.ifError((await session.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'})).error);
 return {id,session,cookies};
}
async function browserFor(account){
 const context=await browser.newContext({serviceWorkers:'block'});
 await context.routeWebSocket('**/*',socket=>socket.close());
 await context.route('**/qz-tray.js',route=>route.abort());
 await context.addCookies(account.cookies.map(c=>({name:c.name,value:c.value,domain:new URL(origin).hostname,path:'/',secure:true,sameSite:'Lax'})));
 const page=await context.newPage();activePage=page;page.setDefaultTimeout(30000);
 page.on('pageerror',e=>console.error('Browser runtime:',e.message));
 const response=await page.goto(origin+'/profesores',{waitUntil:'domcontentloaded'});
 check(response.status()===200,'Hosted Profesores loads');
 await page.getByRole('heading',{name:'Profesores',exact:true}).waitFor();
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Nuevo profesor')&&Object.keys(b).some(k=>k.startsWith('__reactProps')&&typeof b[k]?.onClick==='function')));
 return {context,page};
}
(async()=>{
 assert.ok(!fs.existsSync(stateFile),'Previous fixture requires cleanup');await db.connect();started=true;persist();
 const actor=await identity('superadmin'),departing=await identity('coach'),reader=await identity('director_readonly');
 const campus=(await q('select id from campuses where is_active order by id limit 1'))[0].id;
 const label=`SMOKE ${state.runId.slice(0,8)}`;
 state.group=(await q("insert into training_groups(campus_id,name,program,gender,status,start_time,end_time) values($1,$2,'futbol_para_todos','mixed','active','16:00','17:00') returning id",[campus,label]))[0].id;persist();
 browser=await chromium.launch({channel:'chrome',headless:true});
 const {page}=await browserFor(actor);
 await page.getByRole('button',{name:'Nuevo profesor',exact:true}).click();
 await page.getByLabel('Nombre',{exact:true}).fill(label);
 await page.getByLabel('Apellidos',{exact:true}).fill('Temporal');
 await page.getByLabel('Campus base').selectOption(campus);
 await page.getByRole('button',{name:'Revisar cambios',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar cambios',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.getByRole('heading',{name:`${label} Temporal`,exact:true}).waitFor();
 const coach=(await q('select id from coaches where first_name=$1 and last_name=$2',[label,'Temporal']))[0].id;
 state.coaches.push(coach);persist();check(true,'Created coach immediately visible after save');
 await q('update coaches set user_id=$1 where id=$2',[departing.id,coach]);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Nuevo profesor')&&Object.keys(b).some(k=>k.startsWith('__reactProps')&&typeof b[k]?.onClick==='function')));
 await page.getByRole('button',{name:`Asignar grupos a ${label} Temporal`,exact:true}).click();
 const groupRow=page.getByRole('dialog').locator('.divide-y > div').filter({has:page.getByText(label,{exact:true})});
 await groupRow.getByRole('checkbox').check();
 await page.getByLabel('Motivo',{exact:true}).fill('Synthetic Preview assignment');
 await page.getByRole('button',{name:'Revisar cambios',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar cambios',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.locator('article').filter({has:page.getByRole('heading',{name:`${label} Temporal`,exact:true})}).locator('li').filter({hasText:label}).waitFor();
 check((await q('select 1 from training_group_coaches where training_group_id=$1 and coach_id=$2',[state.group,coach])).length===1,'Assignment persisted and refreshed');
 const ro=await browserFor(reader);
 check(await ro.page.getByRole('button',{name:'Nuevo profesor',exact:true}).isDisabled(),'Reader create disabled');
 check(await ro.page.getByRole('button',{name:`Dar de baja a ${label} Temporal`,exact:true}).isDisabled(),'Reader departure disabled');
 check((await reader.session.rpc('depart_coach',{p_actor:actor.id,p_id:coach,p_expected:'forged',p_commands:[],p_reason:'Denied synthetic probe'})).error,'Reader cannot forge service RPC');
 check((await departing.session.rpc('invicta_account_access_allowed')).data===true,'Coach session initially allowed');
 await page.getByRole('button',{name:`Dar de baja a ${label} Temporal`,exact:true}).click();
 await page.getByLabel('Motivo',{exact:true}).fill('Synthetic Preview departure');
 await page.getByRole('button',{name:'Revisar cambios',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar baja y bloqueo',exact:true}).click();
 await page.getByRole('dialog').waitFor({state:'hidden'});
 check((await q('select is_active from coaches where id=$1',[coach]))[0].is_active===false,'Departure persisted');
 check((await q('select 1 from training_group_coaches where coach_id=$1',[coach])).length===0,'Departure removed group link');
 check((await departing.session.rpc('invicta_account_access_allowed')).data===false,'Already-issued JWT denied');
 check((await departing.session.rpc('is_coach')).error,'Old JWT denied definer access');
 const revoked=await admin.auth.admin.getUserById(departing.id);assert.ifError(revoked.error);
 check(Date.parse(revoked.data.user.banned_until)>Date.now(),'Provider ban confirmed');
 const oldRequest=await fetch(origin+'/profesores',{headers:{Cookie:departing.cookies.map(c=>`${c.name}=${c.value}`).join('; ')},redirect:'manual',signal:AbortSignal.timeout(30000)});
 check(oldRequest.status!==200,'Old hosted session denied');
 console.log(`PASS ${checks} hosted Profesores persistence/read-only/revocation checks`);
})().catch(async e=>{console.error(e.message);if(started){console.error('Synthetic links:',await q('select coach_id,training_group_id from training_group_coaches where training_group_id=$1',[state.group]));console.error('Synthetic visible rows:',await activePage?.locator('article').filter({hasText:`SMOKE ${state.runId.slice(0,8)}`}).allTextContents());}await activePage?.screenshot({path:'.tmp/profesores-hosted-failure.png'}).catch(()=>{});process.exitCode=1}).finally(async()=>{
 await browser?.close();
 if(!started){await db.end();return;}
 try{
  for(const id of state.users){const user=await admin.auth.admin.getUserById(id);assert.equal(user.data.user?.app_metadata?.runId,state.runId);}
  // Recover a coach created successfully just before a browser failure.
  const created=await q("select id from coaches where first_name=$1 and last_name='Temporal'",[`SMOKE ${state.runId.slice(0,8)}`]);
  state.coaches=[...new Set([...state.coaches,...created.map(c=>c.id)])];
  await q('begin');
  await q('delete from coach_management_events where actor_id=any($1::uuid[])',[state.users]);
  await q('delete from invicta_account_blocks where user_id=any($1::uuid[]) and blocked_by=any($1::uuid[])',[state.users]);
  await q('delete from training_group_coaches where coach_id=any($1::uuid[])',[state.coaches]);
  await q('delete from coaches where id=any($1::uuid[])',[state.coaches]);
  if(state.group)await q('delete from training_groups where id=$1',[state.group]);
  await q('delete from user_roles where user_id=any($1::uuid[])',[state.users]);
  await q('commit');
  for(const id of state.users)assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  check((await q('select 1 from auth.users where id=any($1::uuid[])',[state.users])).length===0,'Synthetic accounts removed');
  if(fs.existsSync(stateFile))fs.unlinkSync(stateFile);console.log('All synthetic Preview records and accounts removed.');
 }catch(e){await db.query('rollback').catch(()=>{});persist();console.error('Cleanup requires follow-up:',e.message);process.exitCode=1;}
 await db.end();
});
