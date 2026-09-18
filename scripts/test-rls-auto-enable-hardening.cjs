const fs = require('node:fs');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { Client } = require('pg');
const env = parseEnv(fs.readFileSync(process.argv[2], 'utf8'));
const ref = 'eqefgwdsqabnmpnbpqbq';
const url = new URL(env.SUPABASE_PREVIEW_DB_URL);
assert.equal(new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname, `${ref}.supabase.co`);
assert.ok(url.hostname === `db.${ref}.supabase.co` ||
  (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${ref}`));
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const migration = fs.readFileSync('supabase/migrations/20260918190000_restrict_rls_auto_enable_execute.sql', 'utf8');
(async () => {
  await db.connect();
  try {
    await db.query('begin');
    await db.query("set local statement_timeout='15s'; set local lock_timeout='3s'");
    const present = await db.query("select to_regprocedure('public.rls_auto_enable()') is not null present");
    if (!present.rows[0].present) {
      await db.query(migration);
      // Preview lacks the optional production helper. Rehearse event-trigger
      // behavior with an isolated fixture, never claim this is the installed one.
      await db.query(`create function public.rls_auto_enable() returns event_trigger
        language plpgsql security definer set search_path=pg_catalog as $$
        declare cmd record; begin
          for cmd in select * from pg_event_trigger_ddl_commands()
            where command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
              and object_type in ('table','partitioned table') loop
            if cmd.schema_name='public' then
              execute format('alter table if exists %s enable row level security',cmd.object_identity);
            end if;
          end loop;
        end; $$;
        create event trigger codex_rls_test_20260918 on ddl_command_end
          when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
          execute function public.rls_auto_enable();
        grant execute on function public.rls_auto_enable() to public,anon,authenticated;`);
      console.log('Preview helper absent: testing missing-helper no-op and rollback-only event-trigger fixture.');
    }
    const before = await db.query(`select p.oid,p.proowner,p.prosrc,p.prorettype,p.proconfig,
      e.evtname,e.evtenabled from pg_proc p join pg_event_trigger e on e.evtfoid=p.oid
      where p.oid=to_regprocedure('public.rls_auto_enable()')`);
    assert.ok(before.rowCount, 'Preview helper and event trigger required for rehearsal');
    await db.query(migration);
    await db.query(migration);
    const grants = await db.query(`select
      has_function_privilege('anon','public.rls_auto_enable()','EXECUTE') anon,
      has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE') authenticated`);
    assert.deepEqual(grants.rows[0], {anon:false,authenticated:false});
    const after = await db.query(`select p.oid,p.proowner,p.prosrc,p.prorettype,p.proconfig,
      e.evtname,e.evtenabled from pg_proc p join pg_event_trigger e on e.evtfoid=p.oid
      where p.oid=to_regprocedure('public.rls_auto_enable()')`);
    assert.deepEqual(after.rows,before.rows);
    await db.query('create table public.codex_rls_hardening_probe_20260918 (id integer)');
    const probe = await db.query("select relrowsecurity from pg_class where oid='public.codex_rls_hardening_probe_20260918'::regclass");
    assert.equal(probe.rows[0].relrowsecurity,true);
    console.log('PASS: client execution revoked, definition/owner/trigger preserved, idempotent, new-table RLS still automatic; all changes rolled back.');
  } finally { await db.query('rollback'); await db.end(); }
})().catch(e => {console.error(e.code === 'ERR_ASSERTION' ? e.message : e.code || 'test_failed'); process.exitCode=1;});
