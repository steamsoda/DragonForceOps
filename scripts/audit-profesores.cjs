const fs = require('node:fs');
const { parseEnv } = require('node:util');
const { Client } = require('pg');
const assert = require('node:assert/strict');
const env = parseEnv(fs.readFileSync('../../.env.prod.local', 'utf8'));
const url = new URL(env.SUPABASE_PROD_DB_URL);
assert.ok(url.hostname === 'db.hjvytfaalnfcqfgbxsmj.supabase.co' || decodeURIComponent(url.username) === 'postgres.hjvytfaalnfcqfgbxsmj');
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
(async () => {
  await db.connect();
  await db.query("begin read only;set local statement_timeout='30s'");
  const queries = {
    columns: `select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name in ('coaches','training_group_coaches','attendance_sessions','audit_log','competition_roster_squad_coaches') order by table_name,ordinal_position`,
    totals: `select (select count(*) from coaches) coaches,(select count(*) from coaches where is_active) active,(select count(*) from coaches where user_id is not null) linked,(select count(*) from training_group_coaches) assignments,(select count(*) from coaches c where not exists(select 1 from training_group_coaches a where a.coach_id=c.id)) groupless,(select count(*) from training_groups g where status='active' and not exists(select 1 from training_group_coaches a join coaches c on c.id=a.coach_id and c.is_active where a.training_group_id=g.id)) unstaffed`,
    anomalies: `select 'missing_home_campus' kind,count(*) n from coaches where campus_id is null union all select 'duplicate_user_link',count(*) from (select user_id from coaches where user_id is not null group by user_id having count(*)>1) x union all select 'inactive_assigned',count(*) from training_group_coaches a join coaches c on c.id=a.coach_id where not c.is_active union all select 'cross_campus_links',count(*) from training_group_coaches a join coaches c on c.id=a.coach_id join training_groups g on g.id=a.training_group_id where c.campus_id<>g.campus_id union all select 'multiple_primaries',count(*) from (select training_group_id from training_group_coaches where is_primary group by training_group_id having count(*)>1) x`,
    provider: `select rolname,rolconfig from pg_roles where rolname='authenticator'`,
    functions: `select p.oid::regprocedure::text signature,p.prosecdef definer,has_function_privilege('authenticated',p.oid,'execute') authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname ilike '%role%' or p.proname ilike '%pre_request%' or p.proname ilike '%preauthor%' or p.proname ilike '%coach%') order by 1`,
    triggers: `select event_object_table,trigger_name,action_statement from information_schema.triggers where event_object_schema='public' and event_object_table in ('coaches','training_group_coaches','training_groups','user_roles')`,
    schedule: `select count(*) filter(where s.day_of_week not in (1,2,3)) other_days,count(*) filter(where s.start_time<>g.start_time or s.end_time<>g.end_time) differing_times from attendance_schedule_templates s join training_groups g on g.id=s.training_group_id where s.is_active and (s.effective_end is null or s.effective_end>=current_date) and g.status='active'`,
    roleMix: `select count(*) n from coaches c where c.user_id is not null and exists(select 1 from user_roles ur join app_roles ar on ar.id=ur.role_id where ur.user_id=c.user_id and ar.code<>'coach')`,
  };
  for (const [name, sql] of Object.entries(queries)) console.log(name, JSON.stringify((await db.query(sql)).rows));
  await db.query('rollback');
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.end());
