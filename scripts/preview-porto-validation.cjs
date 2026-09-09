// Preview-only authenticated validation. Never emails Rita; never targets main.
const fs=require('node:fs');
const {parseEnv}=require('node:util');
const {Client}=require('pg');
const {createClient}=require('@supabase/supabase-js');
const {createServerClient}=require('@supabase/ssr');
const env=parseEnv(fs.readFileSync('.env.local','utf8'));
if(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname!=='eqefgwdsqabnmpnbpqbq.supabase.co')throw Error('Preview required');
const url=new URL(env.SUPABASE_PREVIEW_DB_URL);url.searchParams.delete('sslmode');
const db=new Client({connectionString:url.toString(),ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const version='20260909120000';
const file='.tmp/porto-validation.json';
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
async function main(){
 await db.connect();
 if(process.argv.includes('--cleanup')){
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  await db.query('delete from user_roles where id=$1 and user_id=$2',[state.roleRowId,state.userId]);
  if(state.createdUser){const {error}=await admin.auth.admin.deleteUser(state.userId);if(error)throw error;}
  else {const {error}=await admin.auth.admin.signOut(state.accessToken,'local');if(error)throw error;}
  fs.rmSync(file);fs.rmSync('.tmp/porto-browser-state.json',{force:true});
  console.log('Preview test role/session removed; no production changes.');return;
 }
 if(!process.argv.includes('--setup'))throw Error('Use --setup or --cleanup');
 assert(!fs.existsSync(file),'Clean up previous validation before setup');
 await db.query('BEGIN');
 const applied=await db.query('select version from supabase_migrations.schema_migrations where version=$1',[version]);
 if(!applied.rowCount){
  const sql=fs.readFileSync(`supabase/migrations/${version}_porto_nonfinancial_viewer.sql`,'utf8');
  await db.query(sql);
  await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',[version,'porto_nonfinancial_viewer',[sql]]);
 }
 await db.query('COMMIT');
 let user=(await db.query("select id,email_confirmed_at from auth.users where lower(email)='rita.cabral@fcporto.pt'")).rows[0];
 let createdUser=false;
 if(!user){const {data,error}=await admin.auth.admin.createUser({email:'rita.cabral@fcporto.pt',email_confirm:true,app_metadata:{purpose:'temporary_porto_preview_validation'}});if(error)throw error;user=data.user;createdUser=true;}
 const state={userId:user.id,createdUser};
 fs.mkdirSync('.tmp',{recursive:true});fs.writeFileSync(file,JSON.stringify(state));
 assert(user.email_confirmed_at,'Preview identity is not confirmed');
 const roles=await db.query('select id from user_roles where user_id=$1',[user.id]);assert(!roles.rowCount,'Existing roles must not be changed by the test');
 const role=await db.query("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='porto_viewer' returning id",[user.id]);state.roleRowId=role.rows[0].id;
 fs.writeFileSync(file,JSON.stringify(state));
 const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email:'rita.cabral@fcporto.pt'});if(linkError)throw linkError;
 const cookies=[];
 const auth=createServerClient(env.NEXT_PUBLIC_SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>cookies,setAll:values=>{for(const cookie of values){const i=cookies.findIndex(c=>c.name===cookie.name);if(i>=0)cookies[i]=cookie;else cookies.push(cookie);}}}});
 const {data:verified,error:verifyError}=await auth.auth.verifyOtp({token_hash:link.properties.hashed_token,type:'magiclink'});if(verifyError)throw verifyError;
 state.accessToken=verified.session.access_token;fs.writeFileSync(file,JSON.stringify(state));
 const {data,error}=await auth.rpc('porto_operational_overview',{p_view:'players'});if(error)throw error;
 assert(Array.isArray(data.items),'Authenticated RPC failed');
 const denied=await auth.rpc('get_porto_datos_generales');assert(denied.error?.code==='42501','Finance RPC was not denied');
 const raw=await auth.from('payments').select('id').limit(1);assert(!raw.data?.length,'Finance raw read leaked');
 fs.writeFileSync('.tmp/porto-browser-state.json',JSON.stringify({cookies:cookies.map(c=>({name:c.name,value:c.value,domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'})),origins:[]}));
 console.log(JSON.stringify({previewMigration:'applied',realAuthenticatedRpc:'passed',financialReads:'blocked',browserState:'stored locally without printing secrets',emailsSent:0}));
}
main().catch(async e=>{await db.query('ROLLBACK').catch(()=>{});console.error(e.code||'',e.message);process.exitCode=1;}).finally(()=>db.end());
