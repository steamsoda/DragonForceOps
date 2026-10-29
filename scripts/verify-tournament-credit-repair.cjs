// Preview only; all fixture changes and migration executions are rolled back.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { Client } = require('pg');
const env = parseEnv(fs.readFileSync('../director-parity/.env.local', 'utf8'));
const url = new URL(env.SUPABASE_PREVIEW_DB_URL);
const ref = 'eqefgwdsqabnmpnbpqbq';
assert.ok(url.hostname === `db.${ref}.supabase.co` || decodeURIComponent(url.username) === `postgres.${ref}`);
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const migration = fs.readFileSync('supabase/migrations/20261029034752_reconcile_credit_funded_tournament_entries.sql', 'utf8');
let connected = false;
(async () => {
  await db.connect();
  connected = true;
  await db.query('begin');
  await db.query("set local statement_timeout='30s'");
  const fixture = (await db.query(`select c.id, c.enrollment_id, c.amount, t.id tournament_id, e.campus_id
    from charges c join enrollments e on e.id=c.enrollment_id
    join tournaments t on t.product_id=c.product_id and t.campus_id=e.campus_id
    where e.status='active' and c.status<>'void' and c.amount>0 and not c.copa_tigres_installments and t.is_active
      and not exists(select 1 from enrollment_credit_applications a where a.charge_id=c.id)
    order by c.id limit 1`)).rows[0];
  assert.ok(fixture, 'Preview fixture exists');
  const actor = (await db.query('select id from auth.users order by id limit 1')).rows[0].id;
  await db.query('delete from tournament_player_entries where tournament_id=$1 and enrollment_id=$2', [fixture.tournament_id, fixture.enrollment_id]);
  await db.query('delete from payment_allocations where charge_id=$1', [fixture.id]);
  await db.query('update tournaments set end_date=current_date+30 where id=$1', [fixture.tournament_id]);
  const credit = (await db.query(`insert into enrollment_credits(enrollment_id,campus_id,source_workflow,original_amount,reason,created_by)
    values($1,$2,'manual_admin_credit',$3,'Rolled-back credit registration test',$4) returning id`,
    [fixture.enrollment_id, fixture.campus_id, fixture.amount, actor])).rows[0].id;
  await db.query('insert into enrollment_credit_applications(credit_id,charge_id,amount,applied_by) values($1,$2,$3,$4)', [credit, fixture.id, fixture.amount, actor]);
  const before = Number((await db.query("select count(*) from audit_logs where action='tournament.credit_funding_reconciled'")).rows[0].count);
  await db.query(migration);
  const entry = (await db.query('select id,entry_status,charge_id from tournament_player_entries where tournament_id=$1 and enrollment_id=$2', [fixture.tournament_id, fixture.enrollment_id])).rows[0];
  assert.equal(entry?.entry_status, 'confirmed');
  assert.equal(entry?.charge_id, fixture.id);
  const after = Number((await db.query("select count(*) from audit_logs where action='tournament.credit_funding_reconciled'")).rows[0].count);
  assert.ok(after > before, 'Repair writes audit evidence');
  await db.query(migration);
  assert.equal(Number((await db.query("select count(*) from audit_logs where action='tournament.credit_funding_reconciled'")).rows[0].count), after, 'Repair is idempotent');
  assert.equal(Number((await db.query('select sum(amount) total from enrollment_credit_applications where charge_id=$1', [fixture.id])).rows[0].total), Number(fixture.amount));
  assert.equal(Number((await db.query('select count(*) from payment_allocations where charge_id=$1', [fixture.id])).rows[0].count), 0);
  console.log('PASS Preview repair: confirmed registration, audit evidence, idempotency, unchanged funding, roster reconciliation completed.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  try {
    if (connected) { await db.query('rollback'); console.log('Preview fixture rolled back.'); }
  } catch (error) { console.error(`Rollback verification failed: ${error.message}`); process.exitCode = 1; }
  finally { await db.end(); }
});
