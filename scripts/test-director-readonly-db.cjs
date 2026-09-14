// Explicitly pinned target. No commit mode. Every fixture, DDL change and probe rolls back.
const fs = require('node:fs');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
if (require.main === module && process.argv.slice(2).some(a => !['--audit', '--installed', '--production'].includes(a))) throw Error('Only --audit, --installed, --production are supported; no persistent mode');
const production = process.argv.includes('--production');
const env = parseEnv(fs.readFileSync(production ? '.env.prod.local' : '.env.local', 'utf8'));
const ref = production ? 'hjvytfaalnfcqfgbxsmj' : 'eqefgwdsqabnmpnbpqbq';
const url = new URL(production ? env.SUPABASE_PROD_DB_URL : env.SUPABASE_PREVIEW_DB_URL);
if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co`
 || !(url.hostname === `db.${ref}.supabase.co` ||
   (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`))) {
  throw Error('Both API and DB must identify the explicitly selected allowlisted project');
}
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const migrationPath = 'supabase/migrations/20260914160000_director_readonly.sql';
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const quote = s => '"' + s.replaceAll('"', '""') + '"';
let checks = 0;
function check(ok, message) { if (!ok) throw Error(message); checks++; }
async function owner() {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true)");
}
async function identity(id) {
  await db.query('reset role');
  await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
  await db.query('set local role authenticated');
}
async function snapshot(sql) {
  await db.query('savepoint snapshot');
  try {
    const rows = await q(sql);
    return { rows: rows.map(row => JSON.stringify(row)).sort() };
  } catch (e) {
    if (e.code === '57014') throw e;
    return { code: e.code, message: e.message };
  } finally { await db.query('rollback to savepoint snapshot; release savepoint snapshot'); }
}
async function serverTiming(sql) {
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const plan = (await q(`explain (analyze,format json,timing off) ${sql}`))[0]['QUERY PLAN'][0];
    samples.push(plan['Planning Time'] + plan['Execution Time']);
  }
  return samples.sort((a, b) => a - b)[1];
}
async function graphqlProbe(query) {
  await db.query('savepoint graphql_probe');
  try {
    return (await q('select graphql_public.graphql(query := $1) result', [query]))[0].result;
  } finally { await db.query('rollback to savepoint graphql_probe; release savepoint graphql_probe'); }
}
function graphqlPermissionDenied(result) {
  return Array.isArray(result?.errors) && result.errors.length > 0
    && result.errors.every(error => /director_readonly_operation_denied|assigned_role_required|permission denied|row-level security/i.test(error.message || ''));
}
async function blocked(sql, args = [], allowEmpty = false, codes = ['42501']) {
  if (!args.length) {
    const literal = value => "'" + value.replaceAll("'", "''") + "'";
    // One round trip; the inner exception block rolls back even unexpectedly successful writes.
    await db.query(`do $probe$ declare safe boolean := false; affected bigint; begin
      begin
        execute ${literal(sql)};
        get diagnostics affected = row_count;
        safe := ${allowEmpty ? 'true' : 'false'} and affected=0;
        raise exception using errcode='PZ001';
      exception when sqlstate 'PZ001' then null;
        ${codes.map(code => `when sqlstate '${code}' then safe := true;`).join('\n')}
      end;
      if not safe then raise exception '%',${literal('Access not blocked: ' + sql)}; end if;
    end $probe$`);
    checks++;
    return;
  }
  await db.query('savepoint probe');
  let safe = false;
  try { const result = await db.query(sql, args); safe = allowEmpty && result.rowCount === 0; }
  catch (e) { if (!codes.includes(e.code)) throw e; safe = true; }
  finally { await db.query('rollback to savepoint probe; release savepoint probe'); }
  check(safe, `Access not blocked: ${sql}`);
}
async function main({ connected = false, transaction = false, installed = false, beforeMigrationSql = [] } = {}) {
  checks = 0;
  if (!connected) await db.connect();
  if (!transaction) await db.query('begin');
  await db.query("set local statement_timeout='20s'; set local lock_timeout='3s'; set local idle_in_transaction_session_timeout='60s'");
  if (process.argv.includes('--audit')) {
    await db.query('set transaction read only');
    console.log(JSON.stringify({ storagePolicies: await q("select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='storage' order by tablename,policyname") }));
    console.log(JSON.stringify({ storageRls: await q("select c.relname,c.relrowsecurity,has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,has_table_privilege('authenticated',c.oid,'INSERT') authenticated_insert from pg_class c where c.relnamespace=to_regnamespace('storage') and c.relname in ('objects','buckets') order by c.relname") }));
    if ((await q("select to_regclass('storage.buckets') relation"))[0].relation) {
      console.log(JSON.stringify({ storageBuckets: await q('select id,name,public from storage.buckets order by id') }));
      console.log(JSON.stringify({ storageObjectCounts: await q("select bucket_id,count(*) objects,count(*) filter(where name ~* '(receipt|recibo|factura|export|payment|pago|finance|\\.pdf$)') possibleDocumentObjects from storage.objects group by bucket_id order by bucket_id") }));
    }
    console.log(JSON.stringify({ schemaUsage: await q("select nspname,has_schema_privilege('authenticated',oid,'usage') authenticated_usage,has_schema_privilege('anon',oid,'usage') anon_usage from pg_namespace where nspname not like 'pg_%' and nspname<>'information_schema' order by nspname") }));
    console.log(JSON.stringify({ postgrestSchemas: await q("select current_setting('pgrst.db_schemas',true) session_setting"), roleSchemaSettings: await q("select r.rolname,s.setdatabase,config from pg_db_role_setting s left join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) config where config like 'pgrst.db_schemas=%' or config like 'pgrst.db_extra_search_path=%'") }));
    const publicKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ?? env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY;
    if (publicKey) {
      const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/players?select=id&limit=0`, {
        headers: { apikey: publicKey, 'Accept-Profile': '__director_readonly_schema_audit__' },
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json();
      console.log(JSON.stringify({ hostedSchemaProbe: { status: response.status, code: payload.code,
        message: payload.code === 'PGRST106' ? payload.message : 'Schema list not disclosed by this probe',
        details: payload.code === 'PGRST106' ? payload.details : undefined,
        hint: payload.code === 'PGRST106' ? payload.hint : undefined } }));
      if (response.status !== 406 || payload.code !== 'PGRST106') throw Error('Hosted API schema probe did not establish the exposed-schema list');
    }
    console.log(JSON.stringify(await q("select table_name,string_agg(column_name,',' order by ordinal_position) columns from information_schema.columns where table_schema='public' group by table_name order by table_name")));
    console.log(JSON.stringify(await q("select c.relname,c.relkind,c.relrowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relkind in ('v','m') or (c.relkind in ('r','p') and not c.relrowsecurity))")));
    console.log(JSON.stringify(await q("select p.proname,p.prorettype::regtype::text result,l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' and p.prosecdef and p.proname ~ '^(is_|has_|can_|current_user_)'")));
    return;
  }
  for (const sql of beforeMigrationSql) await db.query(sql);
  const portoBefore = await q("select oid,md5(prosrc) hash from pg_proc where pronamespace='public'::regnamespace and proname like '%porto%'");
  const reportDefinitionSql = "select oid,md5(prosrc) hash,proacl,prosecdef from pg_proc where oid in ('public.get_training_workload_30d(uuid,timestamptz)'::regprocedure,'public.get_weekly_attendance_frequency_v1(uuid,integer,timestamptz)'::regprocedure) order by oid";
  const reportDefinitions = await q(reportDefinitionSql);
  const reportCampuses = await q("select c.id,(coalesce(max(s.session_date),current_date)::timestamp+interval '23 hours') at time zone 'America/Monterrey' as as_of from public.campuses c left join public.attendance_sessions s on s.campus_id=c.id and s.status='completed' group by c.id order by c.id");
  const reportBaselines = [];
  for (const campus of reportCampuses) {
    for (const name of ['training_workload_30d', 'weekly_attendance_frequency_v1']) {
      const args = `'${campus.id}'::uuid,${name.includes('frequency') ? '8,' : ''}'${campus.as_of.toISOString()}'::timestamptz`;
      const baseline = await snapshot(`select * from public.get_${name}(${args})`);
      check(!!baseline.rows, `Original report failed: ${name}`);
      reportBaselines.push({ name, args, baseline });
    }
  }
  // Synthetic Front Desk identity; only fixtures are written, all rolled back.
  const deskId = randomUUID();
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [deskId, `readonly-desk-${deskId}@example.invalid`]);
  await q("insert into public.user_roles(user_id,role_id,campus_id) select $1,r.id,(select campus_id from public.enrollments group by campus_id order by count(*) desc,campus_id limit 1) from public.app_roles r where r.code='front_desk'", [deskId]);
  if (!(await q("select exists(select 1 from public.user_roles ur join public.app_roles r on r.id=ur.role_id where r.code='porto_viewer') present"))[0].present) {
    const portoId = randomUUID();
    await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [portoId, `readonly-porto-${portoId}@example.invalid`]);
    await q("insert into public.user_roles(user_id,role_id) select $1,id from public.app_roles where code='porto_viewer'", [portoId]);
  }
  const regressionActors = await q("select distinct on(r.code) r.code,ur.user_id from public.user_roles ur join public.app_roles r on r.id=ur.role_id where r.code in ('superadmin','director_admin','front_desk','director_deportivo','attendance_admin','coach','porto_viewer','admin_oficina','nutritionist') order by r.code,ur.user_id");
  check(regressionActors.some(a => ['superadmin','director_admin'].includes(a.code)), 'No real staff identity available for read-only regression comparison');
  const probes = [
    'select public.is_director_admin(),public.has_internal_staff_role()',
    'select * from public.list_teams_with_counts()',
    'select * from public.search_receipts(null,null,null,5,0)',
    'select id,first_name,last_name from public.players order by id limit 25',
    "select * from public.get_dashboard_finance_summary('2026-09',null)",
    'select * from public.get_latest_finance_reconciliation_snapshot()',
    'select public.current_user_coach_id()',
    'select public.porto_operational_overview()',
    "select public.nuke_player('00000000-0000-0000-0000-000000000000')",
  ];
  const before = new Map();
  for (const actor of regressionActors) {
    await identity(actor.user_id);
    for (const sql of probes) before.set(`${actor.code}:${sql}`, await snapshot(sql));
  }
  const timingQueries = {
    receiptSearch: 'select * from public.search_receipts(null,null,null,5,0)',
    playerList: 'select id,first_name,last_name from public.players order by id limit 25',
  };
  await identity(deskId);
  const timingBefore = {};
  for (const [name, sql] of Object.entries(timingQueries)) timingBefore[name] = await serverTiming(sql);
  await owner();
  if (!installed) await db.query(fs.readFileSync(migrationPath, 'utf8'));
  check(JSON.stringify(await q(reportDefinitionSql)) === JSON.stringify(reportDefinitions), 'Original report body/ACL changed');
  for (const actor of regressionActors) {
    await identity(actor.user_id);
    for (const sql of probes) check(JSON.stringify(await snapshot(sql)) === JSON.stringify(before.get(`${actor.code}:${sql}`)), `Staff/Porto RPC regression: ${actor.code}: ${sql}`);
  }
  await identity(deskId);
  const timings = [];
  for (const [name, sql] of Object.entries(timingQueries)) {
    const afterMs = await serverTiming(sql), beforeMs = timingBefore[name];
    timings.push({ query: name, beforeMs, afterMs, addedMs: +(afterMs - beforeMs).toFixed(3) });
    // Allow ordinary planner noise but fail material absolute-and-relative regressions.
    check(afterMs <= Math.max(beforeMs * 1.5, beforeMs + 10), `Front Desk timing regression: ${name}: ${beforeMs} -> ${afterMs} ms`);
  }
  console.log(JSON.stringify({ frontDeskMedianServerMs: timings, samplesPerQuery: 3, budget: 'max(1.5x baseline, baseline + 10ms)' }));
  await owner();
  console.log(JSON.stringify({ regressionRoles: regressionActors.map(a => a.code), identicalRpcResultsPerRole: probes.length }));
  console.log('Migration rehearsed; testing synthetic identities and projection reads.');
  const viewer = randomUUID(), unverified = randomUUID(), staff = randomUUID(), freshNoRole = randomUUID();
  for (const [id, verified] of [[viewer, true], [unverified, false], [staff, true], [freshNoRole, true]]) {
    await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,case when $3 then now() else null end)', [id, `readonly-${id}@example.invalid`, verified]);
  }
  const grant = "insert into public.user_roles(user_id,role_id) select $1,id from public.app_roles where code=$2";
  await blocked(grant, [unverified, 'director_readonly']);
  await q(grant, [staff, 'director_admin']);
  await blocked(grant, [staff, 'director_readonly']);
  await q(grant, [viewer, 'director_readonly']);
  await blocked(grant, [viewer, 'front_desk']);
  await blocked("insert into public.user_roles(user_id,role_id,campus_id) select $1,r.id,c.id from public.app_roles r cross join public.campuses c where r.code='director_readonly' limit 1", [viewer]);
  const graphqlCheckStart = checks;
  await identity(staff);
  const graphqlInstalled = (await q("select exists(select 1 from pg_extension where extname='pg_graphql') installed"))[0].installed;
  const graphSchema = await graphqlProbe('{ __schema { queryType { fields { name } } mutationType { fields { name } } } }');
  let graphqlStatus;
  let noRoleGraphReads = [], noRoleGraphMutation;
  if (!graphqlInstalled) {
    const disabled = result => !result.data && result.errors?.length === 1
      && result.errors[0].message === 'pg_graphql extension is not enabled.';
    check(disabled(graphSchema), 'Missing GraphQL extension must return the exact disabled-engine response');
    const disabledProbes = [
      '{ chargesCollection(first: 1) { edges { node { id amount } } } }',
      'mutation { updateChargesCollection(set: {amount: "0"}, filter: {id: {eq: "00000000-0000-0000-0000-000000000000"}}, atMost: 1) { affectedCount } }',
    ];
    noRoleGraphReads = [{ query: disabledProbes[0] }];
    noRoleGraphMutation = disabledProbes[1];
    for (const query of disabledProbes) check(disabled(await graphqlProbe(query)), 'Staff GraphQL entry point unexpectedly enabled');
    await identity(viewer);
    for (const query of disabledProbes) check(disabled(await graphqlProbe(query)), 'Viewer GraphQL entry point unexpectedly enabled');
    // These are unavailability checks, NOT valid-schema role-denial tests.
    graphqlStatus = 'extension_absent; role-specific GraphQL authorization not testable';
  } else {
  check(!graphSchema.errors && !!graphSchema.data?.__schema, `Staff GraphQL introspection failed: ${JSON.stringify(graphSchema.errors || graphSchema)}`);
  const queryFields = graphSchema.data.__schema.queryType.fields.map(field => field.name);
  const mutationFields = graphSchema.data.__schema.mutationType.fields.map(field => field.name);
  const graphReads = [];
  for (const table of ['charges', 'payments']) {
    const field = queryFields.find(name => name.toLowerCase() === `${table}collection`);
    check(!!field, `Staff GraphQL ${table} collection is unavailable`);
    const query = `{ ${field}(first: 1) { edges { node { id amount } } } }`;
    const baseline = await graphqlProbe(query);
    check(!baseline.errors && baseline.data?.[field]?.edges?.length === 1, `Staff GraphQL ${table} query must succeed with a real row`);
    graphReads.push({ field, query });
  }
  const mutationField = mutationFields.find(name => name.toLowerCase() === 'updatechargescollection');
  check(!!mutationField, 'Staff GraphQL charge-update mutation is unavailable');
  const graphMutation = `mutation { ${mutationField}(set: { amount: "0" }, filter: { id: { eq: "00000000-0000-0000-0000-000000000000" } }, atMost: 1) { affectedCount } }`;
  const mutationBaseline = await graphqlProbe(graphMutation);
  check(!mutationBaseline.errors && mutationBaseline.data?.[mutationField]?.affectedCount === 0,
    `Staff GraphQL no-op mutation must validate and execute: ${JSON.stringify(mutationBaseline.errors || [])}`);
  await identity(viewer);
  for (const { field, query } of graphReads) {
    const result = await graphqlProbe(query);
    check((!result.errors && result.data?.[field]?.edges?.length === 0) || graphqlPermissionDenied(result),
      `GraphQL finance read was not denied: ${field}`);
  }
  const mutationDenied = await graphqlProbe(graphMutation);
  check(graphqlPermissionDenied(mutationDenied) && !mutationDenied.data?.[mutationField],
    `GraphQL mutation lacked an explicit permission denial: ${JSON.stringify(mutationDenied.errors || [])}`);
    graphqlStatus = 'staff-valid finance reads and mutation denied to viewer';
    noRoleGraphReads = graphReads;
    noRoleGraphMutation = graphMutation;
  }
  const graphqlChecks = checks - graphqlCheckStart;
  console.log(JSON.stringify({ graphqlChecks, graphqlInstalled, graphqlStatus }));
  await owner();
  const views = await q("select table_name from information_schema.views where table_schema='public' and table_name like 'v_director_readonly_%' order by table_name");
  const expected = new Map();
  for (const { table_name: view } of views) expected.set(view, +(await q(`select count(*) n from public.${quote(view.replace('v_director_readonly_', ''))}`))[0].n);
  const tables = await q("select tablename from pg_tables where schemaname='public'");
  const oldViews = await q("select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('v','m') and c.relname not like 'v_director_readonly_%'");
  const legacy = await q(`select p.oid::regprocedure::text signature,p.proname,
    (select coalesce(jsonb_agg(jsonb_build_object('sqlType',format_type(t.oid,null),'category',t.typcategory,'name',t.typname,
      'enum',(select enumlabel from pg_enum where enumtypid=t.oid order by enumsortorder limit 1)) order by a.n),'[]')
     from unnest(p.proargtypes) with ordinality a(type_id,n) join pg_type t on t.oid=a.type_id) args
    from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef and p.prokind='f'
    and p.prorettype not in ('trigger'::regtype,'event_trigger'::regtype)
    and position('public.director_readonly_deny_legacy_rpc()' in p.prosrc)>0 and has_function_privilege('authenticated',p.oid,'execute')`);
  await identity(viewer);
  check((await q('select public.is_director_readonly() ok'))[0].ok, 'Verified reader missing');
  const bootstrap = await q('select ur.user_id,r.code from public.user_roles ur join public.app_roles r on r.id=ur.role_id');
  check(bootstrap.length === 1 && bootstrap[0].user_id === viewer && bootstrap[0].code === 'director_readonly', 'Own-role bootstrap join or assignment isolation failed');
  check(!(await q('select public.is_director_admin() ok'))[0].ok, 'Reader became director admin');
  check((await q('select public.director_readonly_can_access_campus(null) ok'))[0].ok, 'Global read scope missing');
  for (const report of reportBaselines) {
    check(JSON.stringify(await snapshot(`select * from public.director_readonly_${report.name}(${report.args})`)) === JSON.stringify(report.baseline), `Report output/math/historical attribution changed: ${report.name}`);
  }
  for (const name of ['training_workload_30d', 'weekly_attendance_frequency_v1']) {
    await blocked(`select * from public.director_readonly_${name}('00000000-0000-0000-0000-000000000000')`);
  }
  console.log(JSON.stringify({ reportComparisons: reportBaselines.map(r => ({ report: r.name, rows: r.baseline.rows.length })), originalReportAclsUnchanged: true }));
  await owner();
  await db.query('savepoint injected_snapshot');
  try {
    const target = (await q("select id,campus_id,coach_snapshot_source,(session_date::timestamp+interval '23 hours') at time zone 'America/Monterrey' as as_of from public.attendance_sessions where session_type='training' and status='completed' and training_group_id is not null order by session_date desc,id limit 1"))[0];
    check(!!target, 'No completed session available for rollback-only snapshot injection');
    const coach = { coach_id: randomUUID(), name: 'Historical test coach', is_primary: true };
    await q('update public.attendance_sessions set coach_snapshot=$2::jsonb where id=$1', [target.id, JSON.stringify([{ ...coach, balance: 987654, financial_blob: { secret: 'FINANCE_SENTINEL' } }])]);
    await identity(viewer);
    const result = (await q('select coach_snapshot,coach_snapshot_source from public.director_readonly_training_workload_30d($1,$2) where session_id=$3', [target.campus_id, target.as_of, target.id]))[0];
    check(result?.coach_snapshot?.length === 1, 'Historical snapshot missing');
    check(Object.keys(result.coach_snapshot[0]).sort().join(',') === 'coach_id,is_primary,name', 'Extra snapshot keys leaked');
    check(result.coach_snapshot[0].coach_id === coach.coach_id && result.coach_snapshot[0].name === coach.name && result.coach_snapshot[0].is_primary === true, 'Historical coach identity changed');
    check(result.coach_snapshot_source === target.coach_snapshot_source, 'Historical snapshot source changed');
    check(!JSON.stringify(result).includes('FINANCE_SENTINEL'), 'Injected financial payload leaked');
  } finally {
    await owner();
    await db.query('rollback to savepoint injected_snapshot; release savepoint injected_snapshot');
  }
  await identity(viewer);
  for (const { table_name: view } of views) {
    check(+(await q(`select count(*) n from public.${quote(view)}`))[0].n === expected.get(view), `Projection missing real rows: ${view}`);
    const columns = (await q('select column_name from information_schema.columns where table_schema=\'public\' and table_name=$1', [view])).map(r => r.column_name);
    check(!columns.some(c => /amount|price|scholarship|payment|charge|notes?|snapshot|created_by|rate|balance/.test(c)), `Sensitive projection: ${view}`);
    await blocked(`delete from public.${quote(view)}`, [], false, ['42501', '55000']);
    const batch = (await q('select public.director_readonly_rows($1,null,2,0) data', [view.replace('v_director_readonly_', '')]))[0].data;
    check(Array.isArray(batch) && batch.length === Math.min(expected.get(view), 2), `RPC batch failed: ${view}`);
  }
  for (const { tablename } of tables) {
    if (!['app_roles', 'user_roles'].includes(tablename)) await blocked(`select * from public.${quote(tablename)} limit 1`, [], true);
    await blocked(`delete from public.${quote(tablename)} where false`);
    const column = (await q("select a.attname from pg_attribute a where a.attrelid=to_regclass($1) and a.attnum>0 and not a.attisdropped order by a.attnum limit 1", [`public.${quote(tablename)}`]))[0].attname;
    await blocked(`update public.${quote(tablename)} set ${quote(column)} = default where false`);
    await blocked(`insert into public.${quote(tablename)} default values`);
  }
  console.log(`Checked ${views.length} projections and ${tables.length} raw tables; testing legacy views/RPCs.`);
  for (const { relname } of oldViews) await blocked(`select * from public.${quote(relname)} limit 1`, [], true);
  for (const f of legacy) {
    const args = f.args.map(t => {
      let value;
      if (t.category === 'A' || ['json', 'jsonb'].includes(t.name)) value = '{}';
      else if (t.enum !== null) value = t.enum;
      else if (t.name === 'uuid') value = '00000000-0000-0000-0000-000000000000';
      else if (t.category === 'B') value = 'false';
      else if (t.category === 'N') value = '1';
      else if (t.category === 'S') value = '2026-09';
      else if (t.name === 'interval') value = '0 days';
      else if (['time', 'timetz'].includes(t.name)) value = '00:00:00';
      else if (t.category === 'D') value = '2026-09-01';
      else throw Error(`Provide a valid non-null probe for ${f.signature}: ${t.sqlType}`);
      return `'${value.replaceAll("'", "''")}'::${t.sqlType}`;
    }).join(',');
    f.probeSql = `select public.${quote(f.proname)}(${args})`;
    await blocked(f.probeSql);
  }
  await blocked('select public.get_porto_datos_generales()');
  await blocked('select public.porto_operational_overview()');
  console.log(JSON.stringify({ deniedDefinerSignatures: legacy.map(f => f.signature) }));
  await blocked("insert into public.players(first_name,last_name,birth_date) values('Blocked','Reader','2015-01-01')");
  await blocked(grant, [viewer, 'superadmin']);
  await owner();
  // Deliberately unguarded definer proves statement triggers protect against RLS bypass.
  await db.query("create function public.director_readonly_test_mutation() returns void language sql security definer as 'delete from public.players where false'");
  await identity(viewer);
  await blocked('select public.director_readonly_test_mutation()');
  await owner();
  await q("update auth.users set banned_until=now()+interval '1 day' where id=$1", [viewer]);
  await identity(viewer);
  check(!(await q('select public.is_director_readonly() ok'))[0].ok, 'Banned reader retained read scope');
  await blocked("select public.director_readonly_rows('players')");
  await owner();
  await q('update auth.users set banned_until=null where id=$1', [viewer]);
  await q('update auth.users set email_confirmed_at=null where id=$1', [viewer]);
  await identity(viewer);
  check(!(await q('select public.is_director_readonly() ok'))[0].ok, 'Unverified identity retained read scope');
  for (const { table_name: view } of views) check((await q(`select * from public.${quote(view)} limit 1`)).length === 0, `Revoked email read: ${view}`);
  await blocked('select * from public.enrollments limit 1', [], true);
  for (const report of reportBaselines) await blocked(`select * from public.director_readonly_${report.name}(${report.args})`);
  await owner();
  // Restore verification so this tests role removal alone, not the email veto.
  await q('update auth.users set email_confirmed_at=now() where id=$1', [viewer]);
  await q('delete from public.user_roles where user_id=$1', [viewer]);
  await identity(viewer);
  check(!(await q('select public.is_director_readonly() ok'))[0].ok, 'Role revocation failed');
  const noRoleContexts = [];
  for (const [label, id] of [['revoked_verified_reader', viewer], ['fresh_verified_no_role', freshNoRole]]) {
    const start = checks;
    await owner();
    check((await q('select 1 from public.user_roles where user_id=$1', [id])).length === 0, `${label}: role unexpectedly assigned`);
    check((await q('select email_confirmed_at is not null verified from auth.users where id=$1', [id]))[0].verified, `${label}: verification missing`);
    await identity(id);
    check(!(await q('select public.has_director_readonly_role() present'))[0].present, `${label}: membership guard still active`);
    check(!(await q('select public.is_director_admin() allowed'))[0].allowed, `${label}: director privilege appeared`);
    for (const { tablename } of tables) {
      if (!['app_roles', 'user_roles'].includes(tablename)) await blocked(`select * from public.${quote(tablename)} limit 1`, [], true);
    }
    for (const { relname } of oldViews) await blocked(`select * from public.${quote(relname)} limit 1`, [], true);
    for (const f of legacy) await blocked(f.probeSql);
    await blocked('select public.get_porto_datos_generales()');
    await blocked("select public.director_readonly_rows('players')");
    for (const report of reportBaselines) await blocked(`select * from public.director_readonly_${report.name}(${report.args})`);
    for (const { field, query } of noRoleGraphReads) {
      const result = await graphqlProbe(query);
      if (graphqlInstalled) {
        check((!result.errors && result.data?.[field]?.edges?.length === 0) || graphqlPermissionDenied(result), `${label}: GraphQL finance read exposed data`);
      } else {
        check(!result.data && result.errors?.length === 1 && result.errors[0].message === 'pg_graphql extension is not enabled.', `${label}: GraphQL unexpectedly enabled`);
      }
    }
    const mutation = await graphqlProbe(noRoleGraphMutation);
    if (graphqlInstalled) check(!mutation.data && graphqlPermissionDenied(mutation), `${label}: GraphQL mutation not denied`);
    else check(!mutation.data && mutation.errors?.length === 1 && mutation.errors[0].message === 'pg_graphql extension is not enabled.', `${label}: GraphQL mutation unexpectedly available`);
    noRoleContexts.push({ identity: label, checks: checks - start, graphQl: graphqlInstalled ? 'permission_denied' : 'extension_absent' });
  }
  console.log(JSON.stringify({ noRoleContexts }));
  await identity(staff);
  check((await q('select public.is_director_admin() ok'))[0].ok, 'Director admin regression');
  await q('select public.list_teams_with_counts()');
  await owner();
  const portoAfter = await q("select oid,md5(prosrc) hash from pg_proc where pronamespace='public'::regnamespace and proname like '%porto%'");
  check(JSON.stringify(portoBefore) === JSON.stringify(portoAfter), 'Porto function changed');
  console.log(JSON.stringify({ checks, noRoleContexts, graphqlChecks, graphqlStatus, views: views.length, guardedRpcsTested: legacy.length, staffComparisons: regressionActors.length * probes.length, result: 'PASS; rollback follows' }));
}
module.exports = { main, db, migrationPath, ref };
if (require.main === module) main({ installed: process.argv.includes('--installed') }).catch(e => { console.error(e.code || '', e.message); process.exitCode = 1; }).finally(async () => {
  await db.query('rollback').catch(() => {});
  await db.end();
  console.log('Connection closed; transaction rolled back. No migration applied or real users granted.');
});
