// Real concurrent PostgreSQL sessions against a disposable LOCAL schema clone.
// Preview is schema-only/read-only. No customer rows, password hashes or secrets
// are copied. The uniquely named local container is removed in finally.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process'), { parseEnv } = require('node:util');
const http = require('node:http');
const { randomUUID, createHmac } = require('node:crypto'), { Client } = require('pg');
const name = `invicta-credit-test-${Date.now()}`;
const password = randomUUID(); let owner, remote, localConfig, checks = 0, authVersions = [];
function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 40 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw Error((r.stderr || r.error?.message || 'Docker failed').slice(-4000));
  return r.stdout.trim();
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (value, message) => { assert.ok(value, message); checks++; };
async function connect() { const c = new Client(localConfig); await c.connect(); return c; }
async function q(sql, args = []) { return (await owner.query(sql, args)).rows; }
async function waitBlocked(pid) {
  for (let i = 0; i < 100; i++) {
    if ((await q('select cardinality(pg_blocking_pids($1))>0 blocked', [pid]))[0].blocked) return;
    await pause(30);
  }
  throw Error('Expected concurrent query to wait on row lock');
}
async function setup() {
  const env = parseEnv(fs.readFileSync('../director-parity/.env.local', 'utf8'));
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://eqefgwdsqabnmpnbpqbq.supabase.co');
  const url = new URL(env.SUPABASE_PREVIEW_DB_URL);
  assert.ok(url.hostname === 'db.eqefgwdsqabnmpnbpqbq.supabase.co' || decodeURIComponent(url.username) === 'postgres.eqefgwdsqabnmpnbpqbq');
  url.searchParams.delete('sslmode');
  remote = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await remote.connect();
  const roles = (await remote.query("select rolname from pg_roles where rolname !~ '^pg_' and rolname<>'postgres'")).rows;
  if(process.argv.includes('--browser')) authVersions=(await remote.query('select version from auth.schema_migrations')).rows.map(row=>row.version);
  console.log('Starting isolated local PostgreSQL; Preview access is schema-only.');
  docker(['run', '--rm', '-d', '--name', name, '-e', `POSTGRES_PASSWORD=${password}`, '-e', 'PGDATA=/var/lib/postgresql/data/test',
    '--tmpfs', '/var/lib/postgresql/data', '-p', '127.0.0.1::5432', '-p', '127.0.0.1::3000', '-p', '127.0.0.1::9999', 'public.ecr.aws/supabase/postgres:17.6.1.063', 'postgres', '-c', 'listen_addresses=*']);
  for (let i = 0; i < 100; i++) {
    const result = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { windowsHide: true });
    if (result.status === 0) break;
    if (i === 99) throw Error('Local PostgreSQL did not become ready'); await pause(300);
  }
  const port = Number(docker(['port', name, '5432/tcp']).split(':').at(-1));
  localConfig = { host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', connectionTimeoutMillis: 10000 };
  for (let i=0;i<40;i++) {
    try { owner = await connect(); await owner.query('select 1'); break; }
    catch (error) { await owner?.end().catch(() => {}); owner=null; if(i===39)throw error; await pause(500); }
  }
  await q('create database invicta_explicit_tests'); await owner.end();
  localConfig.database = 'invicta_explicit_tests'; owner = await connect();
  // Local clone administrator only; Supabase's image demotes postgres by default.
  docker(['exec', name, 'psql', '-U', 'supabase_admin', '-d', localConfig.database, '-c', 'alter role postgres superuser']);
  await q('drop schema public');
  for (const { rolname } of roles) {
    const quoted = '"' + rolname.replace(/"/g, '""') + '"';
    if (!(await q('select 1 from pg_roles where rolname=$1', [rolname])).length) await q(`create role ${quoted}`);
  }
  await q('alter role service_role bypassrls');
  url.searchParams.set('sslmode', 'require');
  // Supply the connection URI on stdin, not as a visible process argument.
  const cachePath='.tmp/explicit-credit-schema.sql';
  const cacheFresh=fs.existsSync(cachePath)&&Date.now()-fs.statSync(cachePath).mtimeMs<15*60*1000;
  let schema = cacheFresh ? fs.readFileSync(cachePath,'utf8') : docker(['exec', '-i', name, 'sh', '-c',
    'IFS= read -r DBURL; exec pg_dump --dbname="$DBURL" --schema-only --no-owner --schema=public --schema=auth --schema=extensions --schema="*private*"'], url.href + '\n');
  if(!cacheFresh){fs.mkdirSync('.tmp',{recursive:true});fs.writeFileSync(cachePath,schema);}
  await remote.end(); remote = null;
  assert.ok(schema.includes('CREATE SCHEMA extensions;'), 'Expected extensions schema');
  schema = schema.replace('CREATE SCHEMA extensions;', 'CREATE SCHEMA extensions;\nCREATE EXTENSION pg_trgm WITH SCHEMA extensions;\nCREATE EXTENSION unaccent WITH SCHEMA extensions;\nCREATE EXTENSION pgcrypto WITH SCHEMA extensions;');
  console.log('Restoring schema without customer data.');
  docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-d', localConfig.database, '-v', 'ON_ERROR_STOP=1'], schema);
  for (const file of ['20260922010000_explicit_credit_selection_foundation.sql', '20260922020000_explicit_cart_checkout.sql',
    '20260922030000_retire_automatic_credit.sql', '20260922040000_explicit_credit_collection_balances.sql', '20260922050000_explicit_checkout_recovery.sql', '20260922060000_standalone_credit_recovery.sql', '20260922070000_director_operation_resolution.sql']) {
    await q(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  console.log('Local schema and credit migrations ready.');
}
async function fixture() {
  // Synthetic master data only. Disable automatic enrollment setup while seeding.
  await q("set session_replication_role='replica'");
  const actor = randomUUID(), campus = randomUUID(), plan = randomUUID(), player = randomUUID(), enrollment = randomUUID();
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [actor, `test-${actor}@fcportodragonforcemty.com`]);
  await q("insert into app_roles(code,name) values('superadmin','Test admin') on conflict(code) do nothing");
  await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='superadmin'", [actor]);
  await q("insert into campuses(id,code,name) values($1,$2,'Synthetic campus')", [campus, `T${campus.slice(0, 8)}`]);
  await q("insert into pricing_plans(id,name,currency,plan_code,effective_start) values($1,'Synthetic plan','MXN',$2,'2026-01-01')", [plan, `TEST_${plan}`]);
  await q("insert into players(id,first_name,last_name,birth_date) values($1,'Synthetic','Credit test','2015-01-01')", [player]);
  await q("insert into enrollments(id,player_id,campus_id,pricing_plan_id,start_date) values($1,$2,$3,$4,'2026-01-01')", [enrollment, player, campus, plan]);
  await q("insert into charge_types(code,name) values('cup','Synthetic cup') on conflict(code) do nothing");
  const charge = (await q("insert into charges(enrollment_id,charge_type_id,description,amount,currency,status) select $1,id,'Synthetic charge',700,'MXN','pending' from charge_types where code='cup' returning id", [enrollment]))[0].id;
  const payment = (await q("insert into payments(enrollment_id,paid_at,method,amount,currency,status,operator_campus_id,created_by) values($1,now(),'card',200,'MXN','posted',$2,$3) returning id", [enrollment, campus, actor]))[0].id;
  await q("insert into enrollment_credits(enrollment_id,campus_id,source_payment_id,source_workflow,original_amount,reason,created_by) values($1,$2,$3,'eligible_payment_remainder',200,'Synthetic credit',$4)", [enrollment, campus, payment, actor]);
  await q("set session_replication_role='origin'");
  const request = randomUUID();
  return { actor, campus, enrollment, charge, payment, request, payload: { command: { requestId: request,
    enrollmentId: enrollment, currency: 'MXN', expectedAvailableCredit: 200,
    expectedLines: [{ key: charge, chargeId: charge, pending: 700, due: 700, kind: 'ordinary', creditAllowed: true }],
    creditSelection: [{ key: charge, amount: 200 }], payments: [{ method: 'cash', amount: 500 }] }, charges: [], paidAt: null, notes: 'Synthetic concurrency test' } };
}
async function execute(client, f, payload = f.payload) {
  await client.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: f.actor, role: 'service_role' })]);
  await client.query('set role service_role');
  return (await client.query('select checkout_explicit_cart($1,$2,$3,$4,$5) result', [f.actor, f.enrollment, f.campus, payload.command.requestId, payload])).rows[0].result;
}
async function race(changedRequest) {
  const f = await fixture(), a = await connect(), b = await connect();
  try {
    await a.query('begin'); const first = await execute(a, f);
    const pid = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const payload = structuredClone(f.payload); if (changedRequest) payload.command.requestId = randomUUID();
    const second = execute(b, f, payload).then(value => ({ value }), error => ({ error }));
    await waitBlocked(pid); check(true, 'Second checkout waits for enrollment lock');
    await a.query('commit'); const result = await second;
    if (changedRequest) check(result.error?.message === 'checkout_changed', 'Different request cannot spend already-used credit');
    else check(JSON.stringify(result.value) === JSON.stringify(first), 'Duplicate returns exact saved receipt');
    check(Number((await q('select count(*) n from payments where enrollment_id=$1', [f.enrollment]))[0].n) === 2, 'Only one new payment plus original source');
    check(Number((await q('select sum(amount) total from enrollment_credit_applications where charge_id=$1', [f.charge]))[0].total) === 200, 'Credit spent once');
  } finally { await a.query('rollback').catch(() => {}); await a.end(); await b.end(); }
}
async function authenticatedApiChecks() {
  const secret=randomUUID()+randomUUID();
  await q(`alter role authenticator login password '${password}'`);
  await q('grant anon,authenticated,service_role to authenticator');
  docker(['run','--rm','-d','--name',`${name}-rest`,'--network',`container:${name}`,
    '-e',`PGRST_DB_URI=postgres://authenticator:${password}@127.0.0.1:5432/${localConfig.database}`,
    '-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${secret}`,'postgrest/postgrest:v12.2.3']);
  const port=Number(docker(['port',name,'3000/tcp']).split(':').at(-1));
  const base=`http://127.0.0.1:${port}`;
  const token=(role,sub)=>{
    const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
    const p=Buffer.from(JSON.stringify({role,sub,email:`test-${sub}@fcportodragonforcemty.com`,exp:Math.floor(Date.now()/1000)+300})).toString('base64url');
    return `${h}.${p}.${createHmac('sha256',secret).update(`${h}.${p}`).digest('base64url')}`;
  };
  for(let i=0;i<100;i++){
    try{const response=await fetch(base);if(response.status!==503)break;}catch{}
    if(i===99)throw Error('Local REST schema cache did not become ready');await pause(200);
  }
  const f=await fixture(),other=await fixture();
  await q("insert into app_roles(code,name) values('front_desk','Front Desk') on conflict(code) do nothing");
  await q('delete from user_roles where user_id=$1',[f.actor]);
  await q("insert into user_roles(user_id,role_id,campus_id) select $1,id,$2 from app_roles where code='front_desk'",[f.actor,f.campus]);
  const staff=token('authenticated',f.actor);
  const get=async(path,jwt)=>fetch(base+path,{headers:{Authorization:`Bearer ${jwt}`}});
  const own=await get(`/v_enrollment_collection_balances?enrollment_id=eq.${f.enrollment}&select=balance`,staff);
  const ownData=await own.json();check(own.ok&&Number(ownData[0]?.balance)===700,`Authenticated staff sees outstanding 700 despite unused credit: ${own.status} ${JSON.stringify(ownData)}`);
  const denied=await get(`/v_enrollment_collection_balances?enrollment_id=eq.${other.enrollment}&select=balance`,staff);
  check(!denied.ok||(await denied.json()).length===0,'Authenticated staff cannot read another campus collection balance');
  const privateRead=await get('/explicit_cart_intents?select=*',staff);check(!privateRead.ok,'Pending payloads are not browser-readable');
  const args={p_actor:f.actor,p_enrollment:f.enrollment,p_campus:f.campus,p_request:f.request,p_payload:f.payload};
  const post=(fn,body,jwt)=>fetch(base+'/rpc/'+fn,{method:'POST',headers:{Authorization:`Bearer ${jwt}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  check(!(await post('checkout_explicit_cart',args,staff)).ok,'Authenticated browser cannot invoke service-only checkout');
  check(!(await get('/v_enrollment_collection_balances?select=balance',staff+'tampered')).ok,'Tampered JWT rejected');
  const service=token('service_role',f.actor);
  const stage=await post('stage_explicit_cart',{...args,p_recovery:{fields:[],snapshot:{}}},service);
  check(stage.ok,'Authenticated service stages durable intent');
  const saved=await post('checkout_explicit_cart',args,service);const result=await saved.json();
  check(saved.ok&&result.moneyReceived===500&&result.creditApplied===200,'Authenticated service checkout preserves selected credit and money');
  const repeat=await post('checkout_explicit_cart',args,service);
  check(JSON.stringify(await repeat.json())===JSON.stringify(result),'Authenticated retry returns immutable receipt');
  await q("update enrollments set status='ended' where id=$1",[f.enrollment]);
  const endedRetry=await post('checkout_explicit_cart',args,service);
  check(endedRetry.ok&&JSON.stringify(await endedRetry.json())===JSON.stringify(result),'Ended enrollment still permits authorized saved-receipt recovery');
  const newRequest=randomUUID(),newPayload=structuredClone(f.payload);newPayload.command.requestId=newRequest;
  const endedNew=await post('checkout_explicit_cart',{...args,p_request:newRequest,p_payload:newPayload},service);
  check(!endedNew.ok&&(await endedNew.json()).message==='enrollment_inactive','Ended enrollment cannot receive a new payment');
  check((await post('acknowledge_explicit_cart',{p_actor:f.actor,p_request:f.request},service)).ok,'Authenticated acknowledgement resolves recovery');
  const g=await fixture(), creditJwt=token('authenticated',g.actor);
  const command={enrollmentId:g.enrollment,requestId:g.request,expectedAvailable:200,
    selection:[{chargeId:g.charge,amount:200,expectedPending:700}]};
  const stageCredit={p_enrollment:g.enrollment,p_request:g.request,p_command:command};
  const invalidStage=await post('stage_explicit_credit',{...stageCredit,p_command:{...command,expectedAvailable:0}},creditJwt);
  check(!invalidStage.ok&&(await invalidStage.json()).message==='invalid_credit_selection','Malformed staging cannot reserve an account');
  check((await post('stage_explicit_credit',stageCredit,creditJwt)).ok,'Authenticated operator stages standalone credit');
  check(!(await post('stage_explicit_credit',stageCredit,staff)).ok,'Cross-campus operator cannot stage another account');
  check(!(await get('/explicit_credit_intents?select=*',creditJwt)).ok,'Standalone pending commands are private');
  const competing=await post('checkout_explicit_cart',{p_actor:g.actor,p_enrollment:g.enrollment,p_campus:g.campus,p_request:randomUUID(),p_payload:g.payload},service);
  check(!competing.ok&&(await competing.json()).message==='checkout_in_progress','Pending standalone application blocks Caja spending');
  const creditArgs={p_enrollment:g.enrollment,p_request:g.request,p_selection:command.selection,p_expected_available:200};
  const altered=await post('apply_explicit_credit_selection',{...creditArgs,p_selection:[{...command.selection[0],amount:100}]},creditJwt);
  check(!altered.ok&&(await altered.json()).message==='credit_request_conflict','Staged standalone selection cannot be changed at submission');
  const applied=await post('apply_explicit_credit_selection',creditArgs,creditJwt), creditReceipt=await applied.json();
  check(applied.ok&&creditReceipt.creditApplied===200&&creditReceipt.moneyReceived===0,'Standalone applies selected credit without cash');
  await post('resolve_explicit_credit_intent',{p_request:g.request,p_failed:true},creditJwt);
  check((await q('select state from explicit_credit_intents where id=$1',[g.request]))[0].state==='pending','Failure cleanup cannot discard committed credit');
  const creditReplay=await post('apply_explicit_credit_selection',creditArgs,creditJwt);
  check(creditReplay.ok&&JSON.stringify(await creditReplay.json())===JSON.stringify(creditReceipt),'Standalone retry returns the original receipt');
  check((await q('select count(*) n from payments where enrollment_id=$1',[g.enrollment]))[0].n==='1','Standalone replay creates no payment');
  await q("insert into app_roles(code,name) values('director_readonly','Read only') on conflict(code) do nothing");
  await q('delete from user_roles where user_id=$1',[g.actor]);
  await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='director_readonly'",[g.actor]);
  check(!(await post('resolve_explicit_credit_intent',{p_request:g.request,p_failed:false},creditJwt)).ok,'Read-only role cannot acknowledge or release an intent');
  check(!(await post('stage_explicit_credit',stageCredit,creditJwt)).ok,'Read-only role cannot stage an intent');
  await q("delete from user_roles where user_id=$1 and role_id in(select id from app_roles where code='director_readonly')",[g.actor]);
  await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='superadmin'",[g.actor]);
  await post('resolve_explicit_credit_intent',{p_request:g.request,p_failed:false},creditJwt);
  check((await q('select state from explicit_credit_intents where id=$1',[g.request]))[0].state==='completed','Standalone acknowledgement resolves intent');
  const director=await fixture(), stuck=await fixture(), directorJwt=token('authenticated',director.actor), stuckJwt=token('authenticated',stuck.actor);
  const stuckCommand={enrollmentId:stuck.enrollment,requestId:stuck.request,expectedAvailable:200,selection:[{chargeId:stuck.charge,amount:200,expectedPending:700}]};
  await post('stage_explicit_credit',{p_enrollment:stuck.enrollment,p_request:stuck.request,p_command:stuckCommand},stuckJwt);
  const stuckSaved=await post('apply_explicit_credit_selection',{p_enrollment:stuck.enrollment,p_request:stuck.request,p_selection:stuckCommand.selection,p_expected_available:200},stuckJwt);
  const stuckReceipt=await stuckSaved.json();check(stuckSaved.ok,'Fixture credit committed before director resolution');
  const resolution={p_enrollment:stuck.enrollment,p_kind:'credit',p_request:stuck.request,p_reason:'Verified with original operator'};
  check(!(await post('list_explicit_pending_operations',{p_enrollment:stuck.enrollment},staff)).ok,'Front Desk cannot list director recovery data');
  check(!(await post('resolve_explicit_pending_operation',resolution,staff)).ok,'Front Desk cannot resolve another operator');
  check(!(await post('resolve_explicit_pending_operation',{...resolution,p_reason:'x'},directorJwt)).ok,'Director resolution requires a reason');
  const listed=await post('list_explicit_pending_operations',{p_enrollment:stuck.enrollment},directorJwt);
  check(listed.ok&&(await listed.json()).pending[0]?.committed===true,'Director sees stored-receipt state');
  await q('delete from user_roles where user_id=$1',[director.actor]);
  await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='director_readonly'",[director.actor]);
  check((await post('list_explicit_pending_operations',{p_enrollment:stuck.enrollment},directorJwt)).ok,'Director read-only can inspect recovery');
  check(!(await post('resolve_explicit_pending_operation',resolution,directorJwt)).ok,'Director read-only cannot resolve recovery');
  await q('delete from user_roles where user_id=$1',[director.actor]);
  await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='superadmin'",[director.actor]);
  const resolved=await post('resolve_explicit_pending_operation',resolution,directorJwt), resolvedData=await resolved.json();
  check(resolved.ok&&resolvedData.outcome==='receipt_recovered'&&JSON.stringify(resolvedData.receipt)===JSON.stringify(stuckReceipt),'Director recovers exact original credit receipt');
  const repeated=await post('resolve_explicit_pending_operation',resolution,directorJwt);
  check(JSON.stringify(await repeated.json())===JSON.stringify(resolvedData),'Director resolution retry is idempotent');
  const audit=(await q('select * from explicit_recovery_resolutions where request_id=$1',[stuck.request]))[0];
  check(audit.original_actor_id===stuck.actor&&audit.resolved_by===director.actor&&audit.reason===resolution.p_reason,'Resolution records both actors and reason');
  check((await q('select count(*) n from payments where enrollment_id=$1',[stuck.enrollment]))[0].n==='1','Director resolution invents no payment');
  const unfinished=await fixture();
  await post('stage_explicit_cart',{p_actor:unfinished.actor,p_enrollment:unfinished.enrollment,p_campus:unfinished.campus,p_request:unfinished.request,p_payload:unfinished.payload,p_recovery:{}},service);
  const cancel={p_enrollment:unfinished.enrollment,p_kind:'cart',p_request:unfinished.request,p_reason:'Operator confirmed no payment received'};
  const early=await post('resolve_explicit_pending_operation',cancel,directorJwt);
  check(!early.ok&&(await early.json()).message==='operation_too_recent','Fresh unfinished attempts cannot be closed');
  await q("update explicit_cart_intents set created_at=now()-interval '3 minutes' where id=$1",[unfinished.request]);
  const cancelled=await post('resolve_explicit_pending_operation',cancel,directorJwt);
  check(cancelled.ok&&(await cancelled.json()).outcome==='cancelled_uncommitted','Director closes old uncommitted attempt');
  const late=await post('checkout_explicit_cart',{p_actor:unfinished.actor,p_enrollment:unfinished.enrollment,p_campus:unfinished.campus,p_request:unfinished.request,p_payload:unfinished.payload},service);
  check(!late.ok&&(await late.json()).message==='checkout_changed','Late original checkout cannot spend after resolution');
  check((await q('select count(*) n from payments where enrollment_id=$1',[unfinished.enrollment]))[0].n==='1','Closing uncommitted attempt moves no money');
  if(process.argv.includes('--browser')) await browserChecks({secret,token,restPort:port});
}

async function directorResolutionRace() {
  const f=await fixture(), director=await fixture(), a=await connect(), b=await connect();
  await q("insert into explicit_cart_intents(id,enrollment_id,actor_id,campus_id,payload,recovery) values($1,$2,$3,$4,$5,'{}')",[f.request,f.enrollment,f.actor,f.campus,f.payload]);
  try {
    await a.query('begin');const receipt=await execute(a,f);
    await b.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:director.actor})]);
    await b.query('set role authenticated');
    const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const pending=b.query('select resolve_explicit_pending_operation($1,$2,$3,$4) result',[f.enrollment,'cart',f.request,'Verified pending transaction with operator']).then(value=>({value}),error=>({error}));
    await waitBlocked(pid);check(true,'Director resolution waits for in-flight checkout');
    await a.query('commit');const result=await pending;
    check(!result.error&&JSON.stringify(result.value.rows[0].result.receipt)===JSON.stringify(receipt),'Concurrent resolution recovers committed receipt instead of cancelling');
    check((await q('select count(*) n from payments where enrollment_id=$1',[f.enrollment]))[0].n==='2','Resolution race does not duplicate payment');
  } finally {await a.query('rollback').catch(()=>{});await a.end();await b.end();}
}

async function browserChecks({secret,token,restPort}) {
  const {isolatePrinting}=require('./fixtures/isolated-printing.cjs');
  const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
  const f=await fixture();
  await q('delete from user_roles where user_id=$1',[f.actor]);
  await q("insert into user_roles(user_id,role_id,campus_id) select $1,id,$2 from app_roles where code='front_desk'",[f.actor,f.campus]);
  await q("insert into auth.schema_migrations(version) select unnest($1::text[]) on conflict do nothing",[authVersions]);
  // The schema-only restore is owned by local postgres. GoTrue's bootstrap
  // reapplies comments even for an up-to-date schema; this is disposable only.
  const authHelpers=(await q("select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname in ('uid','role','jwt','email')")).map(row=>row.definition);
  await q(`alter role supabase_auth_admin superuser login password '${password}'`);
  await q('alter role supabase_auth_admin set search_path=auth,extensions,public');
  await q('grant all on all tables in schema auth to supabase_auth_admin');
  await q('grant all on all sequences in schema auth to supabase_auth_admin');
  await q("update auth.users set instance_id='00000000-0000-0000-0000-000000000000',created_at=now(),updated_at=now(),email_change_token_current='',reauthentication_token='' where id=$1",[f.actor]);
  await q("update auth.users set aud='authenticated',role='authenticated',encrypted_password=extensions.crypt($2,extensions.gen_salt('bf')),raw_app_meta_data='{\"provider\":\"email\",\"providers\":[\"email\"]}',raw_user_meta_data='{}',is_sso_user=false,confirmation_token='',recovery_token='',email_change='',email_change_token_new='' where id=$1",[f.actor,password]);
  docker(['run','-d','--name',`${name}-auth`,'--network',`container:${name}`,
    '-e','GOTRUE_API_HOST=0.0.0.0','-e','PORT=9999','-e','GOTRUE_DB_DRIVER=postgres','-e','GOTRUE_DB_NAMESPACE=auth','-e','DB_NAMESPACE=auth',
    '-e',`GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${password}@127.0.0.1:5432/${localConfig.database}?sslmode=disable`,
    '-e',`GOTRUE_JWT_SECRET=${secret}`,'-e','GOTRUE_JWT_AUD=authenticated','-e','GOTRUE_JWT_ADMIN_ROLES=service_role',
    '-e','GOTRUE_SITE_URL=http://localhost','-e','API_EXTERNAL_URL=http://localhost','-e','GOTRUE_MAILER_AUTOCONFIRM=true','-e','GOTRUE_EXTERNAL_EMAIL_ENABLED=true',
    'supabase/gotrue:v2.189.0']);
  const authPort=Number(docker(['port',name,'9999/tcp']).split(':').at(-1));
  for(let i=0;i<80;i++){
    try{if((await fetch(`http://127.0.0.1:${authPort}/health`)).ok)break;}catch{}
    if(i===79){const result=spawnSync('docker',['logs',`${name}-auth`],{encoding:'utf8',windowsHide:true});throw Error('Local Auth startup failed: '+(result.stdout+result.stderr).slice(0,5000));}await pause(200);
  }
  for(const definition of authHelpers)await q(definition);
  const login=await fetch(`http://127.0.0.1:${authPort}/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`test-${f.actor}@fcportodragonforcemty.com`,password})});
  const session=await login.json();
  if(!login.ok){const authLog=spawnSync('docker',['logs','--tail','4',`${name}-auth`],{encoding:'utf8',windowsHide:true});console.error((authLog.stdout+authLog.stderr).slice(-2500));}
  check(login.ok,`Local Auth login: ${login.status} ${session.error_description??session.msg??session.error_code??''}`);
  const gateway=http.createServer(async(req,res)=>{
    const isAuth=req.url.startsWith('/auth/v1/'), prefix=isAuth?'/auth/v1':'/rest/v1';
    if(!req.url.startsWith(prefix+'/')){res.statusCode=404;return res.end();}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const headers={...req.headers};delete headers.host;delete headers.connection;
    try{
      const response=await fetch(`http://127.0.0.1:${isAuth?authPort:restPort}${req.url.slice(prefix.length)}`,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});
      const outputHeaders=Object.fromEntries(response.headers);
      delete outputHeaders['content-encoding'];delete outputHeaders['content-length'];delete outputHeaders['transfer-encoding'];
      res.writeHead(response.status,outputHeaders);res.end(Buffer.from(await response.arrayBuffer()));
    }catch{res.statusCode=502;res.end();}
  });
  await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
  const gatewayPort=gateway.address().port;
  const reservation=http.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const appPort=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${gatewayPort}`,SUPABASE_URL:`http://127.0.0.1:${gatewayPort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:token('anon',undefined),SUPABASE_SERVICE_ROLE_KEY:token('service_role',undefined),
    DIRECTOR_READONLY_ENABLED:'true',NODE_OPTIONS:'--max-old-space-size=8192'};
  let logs='';
  const app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(appPort)],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  app.stdout.on('data',chunk=>logs=(logs+chunk).slice(-10000));app.stderr.on('data',chunk=>logs=(logs+chunk).slice(-10000));
  let browser, page;
  try{
    for(let i=0;i<160;i++){try{await fetch(`http://127.0.0.1:${appPort}/login`);break;}catch{if(app.exitCode!==null||i===159)throw Error('Local app startup failed: '+logs.slice(-2500));await pause(250);}}
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    await isolatePrinting(context,`http://127.0.0.1:${appPort}`);
    context.on('requestfailed',request=>console.error('Browser request failed:',new URL(request.url()).pathname,request.failure()?.errorText));
    await context.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);
    page=await context.newPage();
    page.on('pageerror',error=>console.error('Browser script error:',error.message));
    page.on('console',message=>{if(message.type()==='error')console.error('Browser console:',message.text());});
    const response=await page.goto(`http://127.0.0.1:${appPort}/caja?enrollmentId=${f.enrollment}`,{waitUntil:'networkidle',timeout:120000});
    check(response.status()===200&&!page.url().includes('/login')&&!page.url().includes('/unauthorized'),'Authenticated Caja page loads');
    await page.getByText('Synthetic Credit test',{exact:false}).first().waitFor({timeout:60000});
    await page.screenshot({path:'.tmp/explicit-cart-ui/authenticated-caja.png',fullPage:true});
    check((await q('select count(*) n from payments where enrollment_id=$1',[f.enrollment]))[0].n==='1','Opening authenticated Caja does not move credit or create payments');
    await page.getByText('Efectivo',{exact:true}).click();
    await page.getByRole('button',{name:'Cobrar todo',exact:true}).click({timeout:60000});
    await page.getByLabel('Credito para Synthetic charge',{exact:true}).fill('200');
    await page.getByRole('button',{name:'Revisar importes',exact:true}).click();
    let dropped=false;
    await page.route('**/caja?*',async route=>{
      const request=route.request();
      if(!dropped&&request.method()==='POST'&&(request.postData()??'').includes('explicitCommand')){
        dropped=true;await route.fetch();await route.abort('failed');
      }else await route.continue();
    });
    await page.getByRole('button',{name:'Confirmar cobro',exact:true}).click();
    await page.getByRole('button',{name:'Reintentar mismo cobro',exact:true}).waitFor({timeout:60000});
    check(dropped,'Lost response simulated after the server handled checkout');
    const savedRequest=(await q('select id from explicit_cart_checkouts where enrollment_id=$1',[f.enrollment]))[0]?.id;
    check(!!savedRequest,'Payment committed before the simulated response loss');
    await context.close();
    const recoveredContext=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    await isolatePrinting(recoveredContext,`http://127.0.0.1:${appPort}`);
    await recoveredContext.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);
    page=await recoveredContext.newPage();
    await page.goto(`http://127.0.0.1:${appPort}/caja?enrollmentId=${f.enrollment}`,{waitUntil:'networkidle',timeout:120000});
    await page.getByRole('button',{name:'Reintentar mismo cobro',exact:true}).click({timeout:60000});
    await page.getByRole('heading',{name:'Cobro registrado',exact:true}).waitFor({timeout:60000});
    await page.waitForFunction(()=>window.__testPrintJobs.length===1);
    const printed=await page.evaluate(()=>window.__testPrintJobs[0].items.map(item=>item.format==='base64'?atob(item.data):item.data??'').join(''));
    check(printed.includes('DINERO RECIBIDO')&&printed.includes('CREDITO UTILIZADO')&&printed.includes('Synthetic charge'),'Auto-print captures receipt content without contacting QZ');
    check((await q('select count(*) n from explicit_cart_checkouts where enrollment_id=$1',[f.enrollment]))[0].n==='1','Fresh-browser recovery returns one original checkout');
    check((await q('select count(*) n from payments where enrollment_id=$1',[f.enrollment]))[0].n==='2','Fresh-browser recovery creates no duplicate payment');
    check((await q('select state from explicit_cart_intents where id=$1',[savedRequest]))[0].state==='completed','Recovered receipt acknowledgement releases pending intent');
    check(Number((await q("select amount from payments where enrollment_id=$1 and id<>$2",[f.enrollment,f.payment]))[0]?.amount)===500,'Authenticated browser posts exactly 500 cash');
    check(Number((await q('select sum(amount) total from enrollment_credit_applications where charge_id=$1',[f.charge]))[0]?.total)===200,'Authenticated browser applies only selected 200 credit');
    check(Number((await q('select balance from v_enrollment_collection_balances where enrollment_id=$1',[f.enrollment]))[0]?.balance)===0,'Authenticated browser fully settles the selected charge');
    await page.screenshot({path:'.tmp/explicit-cart-ui/authenticated-caja-receipt.png',fullPage:true});
    await q("set session_replication_role='replica'");
    const extraCharge=(await q("insert into charges(enrollment_id,charge_type_id,description,amount,currency,status) select $1,id,'Synthetic recovery credit',200,'MXN','pending' from charge_types where code='cup' returning id",[f.enrollment]))[0].id;
    const extraPayment=(await q("insert into payments(enrollment_id,paid_at,method,amount,currency,status,operator_campus_id,created_by) values($1,now(),'card',200,'MXN','posted',$2,$3) returning id",[f.enrollment,f.campus,f.actor]))[0].id;
    await q("insert into enrollment_credits(enrollment_id,campus_id,source_payment_id,source_workflow,original_amount,reason,created_by) values($1,$2,$3,'eligible_payment_remainder',200,'Synthetic recovery',$4)",[f.enrollment,f.campus,extraPayment,f.actor]);
    await q("set session_replication_role='origin'");
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Credito de la cuenta',exact:true}).click();
    await page.getByRole('checkbox',{name:/Synthetic recovery credit/}).check();
    await page.getByLabel('Credito para Synthetic recovery credit',{exact:true}).fill('200');
    await page.getByRole('button',{name:'Revisar aplicacion',exact:true}).click();
    let creditDropped=false;
    await page.route('**/caja?*',async route=>{
      const request=route.request();
      if(!creditDropped&&request.method()==='POST'&&(request.postData()??'').includes('expectedAvailable')){
        creditDropped=true;await route.fetch();await route.abort('failed');
      }else await route.continue();
    });
    await page.getByRole('button',{name:'Confirmar aplicacion',exact:true}).click();
    await page.getByRole('button',{name:'Reintentar misma operacion',exact:true}).waitFor({timeout:60000});
    check(creditDropped,'Standalone committed response intentionally lost');
    await recoveredContext.close();
    const finalContext=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    await isolatePrinting(finalContext,`http://127.0.0.1:${appPort}`);
    await finalContext.addCookies([{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url'),domain:'127.0.0.1',path:'/',httpOnly:false,sameSite:'Lax'}]);
    page=await finalContext.newPage();
    await page.goto(`http://127.0.0.1:${appPort}/caja?enrollmentId=${f.enrollment}`,{waitUntil:'networkidle',timeout:120000});
    await page.getByRole('button',{name:'Credito de la cuenta',exact:true}).click();
    await page.getByRole('button',{name:'Reintentar misma operacion',exact:true}).click({timeout:60000});
    await page.getByRole('heading',{name:'Comprobante de credito',exact:true}).waitFor({timeout:60000});
    await page.waitForFunction(()=>{const button=document.querySelector('button[aria-label="Imprimir comprobante"]');return button&&!button.disabled;},{},{timeout:60000});
    check(Number((await q('select sum(amount) total from enrollment_credit_applications where charge_id=$1',[extraCharge]))[0].total)===200,'Fresh browser applies standalone credit only once');
    check((await q('select count(*) n from payments where enrollment_id=$1',[f.enrollment]))[0].n==='3','Standalone browser recovery invents no cash payment');
    check((await q("select count(*) n from explicit_credit_intents where enrollment_id=$1 and state='pending'",[f.enrollment]))[0].n==='0','Standalone recovered receipt acknowledged');
    await page.screenshot({path:'.tmp/explicit-cart-ui/authenticated-credit-recovery.png',fullPage:true});
    const departed=await fixture(), pendingId=randomUUID();
    await q("insert into explicit_cart_intents(id,enrollment_id,actor_id,campus_id,payload,recovery,created_at) values($1,$2,$3,$4,$5,'{}',now()-interval '3 minutes')",[pendingId,f.enrollment,departed.actor,f.campus,{...f.payload,command:{...f.payload.command,requestId:pendingId}}]);
    await q("insert into app_roles(code,name) values('director_admin','Director') on conflict(code) do nothing");
    await q('delete from user_roles where user_id=$1',[f.actor]);
    await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='director_admin'",[f.actor]);
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:'Credito de la cuenta',exact:true}).click();
    await page.getByRole('button',{name:'Operaciones pendientes',exact:true}).click();
    await page.getByRole('radio',{name:/Cobro de Caja/}).check();
    check(await page.getByRole('button',{name:'Cerrar intento sin registro',exact:true}).isDisabled(),'Director UI requires confirmation before closing an attempt');
    await page.getByLabel('Motivo',{exact:true}).fill('Confirmed no payment with original operator');
    await page.getByRole('checkbox',{name:/Revise la operacion/}).check();
    await page.getByRole('button',{name:'Cerrar intento sin registro',exact:true}).click();
    await page.getByText('Intento sin registro cerrado. No se modificaron pagos ni credito.',{exact:true}).waitFor({timeout:60000});
    check((await q('select state from explicit_cart_intents where id=$1',[pendingId]))[0].state==='failed','Director UI closes the selected uncommitted attempt');
    check((await q('select count(*) n from payments where enrollment_id=$1',[f.enrollment]))[0].n==='3','Director UI resolution leaves money unchanged');
    check((await q('select resolved_by from explicit_recovery_resolutions where request_id=$1',[pendingId]))[0].resolved_by===f.actor,'Director UI resolution is audited');
    await page.screenshot({path:'.tmp/explicit-cart-ui/authenticated-director-resolution.png',fullPage:true});
    const readOnlyPending=randomUUID();
    await q("insert into explicit_cart_intents(id,enrollment_id,actor_id,campus_id,payload,recovery,created_at) values($1,$2,$3,$4,$5,'{}',now()-interval '3 minutes')",[readOnlyPending,f.enrollment,departed.actor,f.campus,{...f.payload,command:{...f.payload.command,requestId:readOnlyPending}}]);
    await q('delete from user_roles where user_id=$1',[f.actor]);
    await q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='director_readonly'",[f.actor]);
    const readonlyLoaded=page.waitForResponse(response=>response.url().includes('/api/director-readonly/caja?mode=products')&&response.status()===200,{timeout:120000});
    const installmentsLoaded=page.waitForResponse(response=>response.url().includes('/api/director-readonly/caja?mode=installments')&&response.status()===200,{timeout:120000});
    await page.reload({waitUntil:'domcontentloaded',timeout:120000});
    await readonlyLoaded;
    const installments=await (await installmentsLoaded).json();
    check(Array.isArray(installments),'Read-only Copa Tigres options load through protected GET');
    await page.getByRole('button',{name:'Credito de la cuenta',exact:true}).click();
    try { await page.getByRole('button',{name:'Operaciones pendientes',exact:true}).click(); }
    catch(error){console.error(await page.locator('body').innerText());await page.screenshot({path:'.tmp/explicit-cart-ui/readonly-load-failure.png',fullPage:true});throw error;}
    await page.getByRole('radio',{name:/Cobro de Caja/}).check();
    check(await page.getByRole('button',{name:'Cerrar intento sin registro',exact:true}).isDisabled(),'Read-only Director can inspect but cannot resolve in UI');
    check(await page.getByLabel('Motivo',{exact:true}).isDisabled(),'Read-only resolution inputs remain disabled');
    await page.setViewportSize({width:390,height:844});
    check(await page.evaluate(()=>{const dialog=document.querySelector('dialog[open]');return dialog&&dialog.scrollWidth<=dialog.clientWidth+1&&dialog.getBoundingClientRect().width<=innerWidth;}),'Resolution panel fits mobile viewport without horizontal overflow');
    await page.screenshot({path:'.tmp/explicit-cart-ui/authenticated-resolution-readonly-mobile.png',fullPage:true});
    console.log('Authenticated Caja page, no-spend account load, mixed checkout and fresh-browser lost-response recovery passed.');
  }catch(error){console.error('BROWSER FAILURE:',error.stack);if(page&&!page.isClosed())console.error((await page.locator('body').innerText()).slice(-12000));console.error(logs.slice(-3500));throw error;}
  finally{await browser?.close();app.kill();await new Promise(resolve=>app.exitCode!==null?resolve():app.once('exit',resolve));await new Promise(resolve=>gateway.close(resolve));}
}
(async () => {
  await setup(); await race(false); await race(true);
  const f = await fixture(), a = await connect(), b = await connect();
  try {
    await a.query('begin'); await a.query("update payments set status='void' where id=$1", [f.payment]);
    const pid = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
    const result = execute(b, f).then(value => ({ value }), error => ({ error }));
    await waitBlocked(pid); check(true, 'Checkout waits on changing credit source'); await a.query('commit');
    check((await result).error?.message === 'credit_source_requires_review', 'Voided source cannot be spent after lock releases');
    check(Number((await q('select count(*) n from payments where enrollment_id=$1', [f.enrollment]))[0].n) === 1, 'Failed source race posts no new payment');
  } finally { await a.query('rollback').catch(() => {}); await a.end(); await b.end(); }
  await directorResolutionRace();await authenticatedApiChecks();
  console.log(`PASS ${checks} real two-session concurrency and signed-JWT API checks. Synthetic local data only.`);
})().catch(error => {
  console.error(error.message);
  const logs=spawnSync('docker',['logs','--tail','15',name],{encoding:'utf8',windowsHide:true});
  console.error((logs.stderr||logs.stdout||'').slice(-2500)); process.exitCode = 1;
  const restLogs=spawnSync('docker',['logs','--tail','8',`${name}-rest`],{encoding:'utf8',windowsHide:true});
  if(restLogs.status===0)console.error((restLogs.stderr||restLogs.stdout||'').slice(-2000));
}).finally(async () => {
  await remote?.end().catch(() => {}); await owner?.end().catch(() => {});
  spawnSync('docker', ['rm', '-f', `${name}-rest`], { windowsHide: true, stdio: 'ignore' });
  spawnSync('docker', ['rm', '-f', `${name}-auth`], { windowsHide: true, stdio: 'ignore' });
  spawnSync('docker', ['rm', '-f', name], { windowsHide: true, stdio: 'ignore' });
  console.log('Disposable local test container removed.');
});
