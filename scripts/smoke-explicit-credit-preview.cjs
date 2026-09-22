// Hosted Preview reads and denied writes only. Creates/deletes one synthetic Auth identity.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {parseEnv}=require('node:util'),{randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {createClient}=require('@supabase/supabase-js');
const {createServerClient}=require('@supabase/ssr');
const env=parseEnv(fs.readFileSync('../director-parity/.env.local','utf8'));
const ref='eqefgwdsqabnmpnbpqbq',origin='https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app';
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL,`https://${ref}.supabase.co`);
const url=new URL(env.SUPABASE_PREVIEW_DB_URL);
assert.ok(url.hostname===`db.${ref}.supabase.co`||decodeURIComponent(url.username)===`postgres.${ref}`);
url.searchParams.delete('sslmode');
const db=new Client({connectionString:url.href,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const purpose='explicit_credit_preview_smoke',runId=randomUUID(),stateFile='.tmp/explicit-credit-hosted-smoke.json';
let userId,checks=0;const cookies=[];
const check=(value,message)=>{assert.ok(value,message);checks++;};
async function request(route,method='GET') {
  return fetch(origin+route,{method,redirect:'manual',headers:{Cookie:cookies.map(c=>`${c.name}=${c.value}`).join('; '),Origin:origin},signal:AbortSignal.timeout(90000)});
}
(async()=>{
  assert.ok(!fs.existsSync(stateFile),'Previous synthetic identity needs cleanup');
  await db.connect();
  const e=(await db.query("select id,campus_id from enrollments where status='active' order by id limit 1")).rows[0];
  check(!!e,'Preview enrollment for read checks');
  const email=`credit-preview-${runId}@fcportodragonforcemty.com`;
  const created=await admin.auth.admin.createUser({email,email_confirm:true,app_metadata:{purpose,runId}});
  check(!created.error&&created.data.user?.id,'Synthetic identity created without email');userId=created.data.user.id;
  fs.writeFileSync(stateFile,JSON.stringify({ref,purpose,runId,userId,email}));
  const link=await admin.auth.admin.generateLink({type:'magiclink',email});
  check(!link.error&&link.data.user.id===userId,'Synthetic proof generated locally, not emailed');
  const session=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>cookies,setAll:items=>{for(const item of items){const i=cookies.findIndex(c=>c.name===item.name);if(i<0)cookies.push(item);else cookies[i]=item;}}}});
  const auth=await session.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});
  check(!auth.error&&auth.data.user.id===userId,'Authenticated session created');
  for(const role of ['director_admin','front_desk','director_readonly']) {
    await db.query('delete from user_roles where user_id=$1',[userId]);
    const assigned=await db.query('insert into user_roles(user_id,role_id,campus_id) select $1,id,$3 from app_roles where code=$2 returning id',[userId,role,role==='front_desk'?e.campus_id:null]);
    check(assigned.rowCount===1,`${role} assigned`);
    for(const path of ['/caja','/players','/sports-signups',`/enrollments/${e.id}/charges`]) {
      const response=await request(path);const body=await response.text();
      check(response.status===200&&!body.includes('NEXT_REDIRECT')&&!body.includes('Application error: a server-side exception'),`${role} ${path.replace(e.id,':id')} loads`);
      check(body.includes('1.17.78'),`${role} sees deployed version`);
    }
    if(role==='director_readonly') {
      for(const mode of ['credit','operations','installments']) {
        const response=await request(`/api/director-readonly/caja?mode=${mode}&enrollmentId=${e.id}`);
        const data=await response.json();check(response.status===200&&(mode==='installments'?Array.isArray(data):data.ok===true),`${mode} protected reader loads`);
        if(mode==='credit')check(data.workspace.readOnly===true,'Credit workspace remains read-only');
      }
      check((await request('/caja','POST')).status===403,'Hosted read-only POST denied');
    }
    if(role!=='director_admin') {
      const result=await session.rpc('resolve_explicit_pending_operation',{p_enrollment:e.id,p_kind:'cart',p_request:randomUUID(),p_reason:'Synthetic denial probe'});
      check(result.error?.message==='forbidden',`${role} resolution denied at DB`);
    }
    console.log(`PASS hosted ${role} read/permission checks`);
  }
  console.log(`PASS ${checks} hosted Preview smoke checks. No financial writes or emails.`);
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(userId){
    try{
      const owner=await admin.auth.admin.getUserById(userId);
      assert.equal(owner.data.user?.app_metadata?.runId,runId);
      assert.equal(owner.data.user?.app_metadata?.purpose,purpose);
      await db.query('delete from user_roles where user_id=$1',[userId]);
      const removed=await admin.auth.admin.deleteUser(userId);if(removed.error)throw removed.error;
      assert.equal((await db.query('select count(*)::int n from auth.users where id=$1',[userId])).rows[0].n,0);
      fs.unlinkSync(stateFile);console.log('Synthetic Preview identity and roles removed.');
    }catch(error){console.error('Synthetic cleanup requires follow-up:',error.message);process.exitCode=1;}
  }
  await db.end();
});
