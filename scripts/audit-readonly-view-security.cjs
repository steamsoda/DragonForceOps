const fs = require('node:fs');
const { parseEnv } = require('node:util');
const { Client } = require('pg');

// Metadata and anonymous probes only. Never persist changes or print credentials.
const env = parseEnv(fs.readFileSync(process.argv[2], 'utf8'));
const ref = 'hjvytfaalnfcqfgbxsmj';
const url = new URL(env.SUPABASE_PROD_DB_URL);
if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co` ||
  !(url.hostname === `db.${ref}.supabase.co` ||
    (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`))) {
  throw Error('Expected production metadata audit target');
}
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
(async () => {
  await db.connect();
  try {
    await db.query('begin read only');
    await db.query("set local statement_timeout='15s'");
    if (process.argv.includes('--inventory')) {
      const rows = await db.query(`select p.oid::regprocedure::text signature,
        p.prorettype::regtype::text return_type,p.proconfig,
        has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
        md5(p.prosrc) body_hash,
        position('director_readonly_deny_legacy_rpc' in p.prosrc)>0 legacy_guard_present,
        position('auth.uid()' in p.prosrc)>0 caller_reference_present
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prosecdef
        and has_function_privilege('authenticated',p.oid,'EXECUTE') order by signature`);
      const schema = await db.query(`select
        has_schema_privilege('anon','public','CREATE') anon_create,
        has_schema_privilege('authenticated','public','CREATE') authenticated_create`);
      console.log(JSON.stringify({count:rows.rowCount,schema:schema.rows[0],functions:rows.rows},null,2));
      return;
    }
    if (process.argv.includes('--function-warnings')) {
      const functions = await db.query(`select p.oid::regprocedure::text name,
        p.prorettype::regtype::text return_type, p.proconfig,
        has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
        has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
        pg_get_functiondef(p.oid) definition
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.prosecdef and p.proname in
        ('rls_auto_enable','nuke_player','merge_players','repair_payment_allocations',
         'record_payment_refund','reassign_payment_to_charges','reassign_payment_source_charge_to_charges',
         'save_email_preauthorization','revoke_email_preauthorization','list_auth_users')
        order by p.proname`);
      const triggers = await db.query(`select evtname,evtenabled,evtfoid::regprocedure::text function
        from pg_event_trigger where evtfoid=to_regprocedure('public.rls_auto_enable()')`);
      console.log(JSON.stringify({functions:functions.rows,eventTriggers:triggers.rows},null,2));
      return;
    }
    const views = await db.query(`select c.relname, c.reloptions,
      pg_get_userbyid(c.relowner) owner,
      pg_get_viewdef(c.oid,true) definition,
      has_table_privilege('anon',c.oid,'SELECT') anon_select,
      has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
      has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') authenticated_write
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='v' and c.relname like 'v_director_readonly_%'
      order by c.relname`);
    const guards = await db.query(`select p.oid::regprocedure::text name, p.prosecdef,
      p.proconfig, pg_get_functiondef(p.oid) definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in
      ('is_director_readonly','has_director_readonly_role','list_auth_users')`);
    console.log(JSON.stringify({ views: views.rows, guards: guards.rows }, null, 2));
    await db.query('set local role anon');
    for (const view of views.rows) {
      await db.query('savepoint probe');
      let result;
      try {
        const r = await db.query(`select 1 from public."${view.relname.replaceAll('"', '""')}" limit 1`);
        result = r.rowCount ? 'EXPOSED' : 'empty';
      } catch (e) { result = e.code === '42501' ? 'denied' : `error:${e.code}`; }
      await db.query('rollback to savepoint probe');
      console.log(`${view.relname}: anonymous ${result}`);
      if (result === 'EXPOSED') throw Error('Anonymous exposure found');
    }
  } finally {
    await db.query('rollback');
    await db.end();
  }
})().catch(e => { console.error(e.code || 'audit_failed'); process.exitCode = 1; });
