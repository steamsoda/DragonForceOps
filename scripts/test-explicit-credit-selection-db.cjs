const fs = require('node:fs');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');

// Hosted Preview only. Fixtures, DDL and all financial operations always roll back.
const env = parseEnv(fs.readFileSync('../director-parity/.env.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://eqefgwdsqabnmpnbpqbq.supabase.co');
const url = new URL(env.SUPABASE_PREVIEW_DB_URL);
assert.ok(url.hostname === 'db.eqefgwdsqabnmpnbpqbq.supabase.co' ||
  decodeURIComponent(url.username) === 'postgres.eqefgwdsqabnmpnbpqbq');
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
async function owner() {
  await db.query('reset role');
  await q("select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true)");
}
async function call(actor, enrollment, request, selection, available = 1200) {
  await owner();
  await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",
    [JSON.stringify({ sub: actor, role: 'authenticated' }), actor]);
  await db.query('set local role authenticated');
  return (await q('select public.apply_explicit_credit_selection($1,$2,$3,$4) result',
    [enrollment, request, JSON.stringify(selection), available]))[0].result;
}
async function denied(fn, message) {
  await db.query('savepoint denied');
  let error;
  try { await fn(); } catch (e) { error = e; }
  finally { await db.query('rollback to savepoint denied;release savepoint denied'); }
  check(error && error.message.includes(message), `Expected ${message}, got ${error?.message ?? 'success'}`);
}

(async () => {
  await db.connect();
  await db.query("begin;set local lock_timeout='3s';set local statement_timeout='30s'");
  const legacyDefinition = (await q("select pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure) def"))[0].def;
  await db.query(fs.readFileSync('supabase/migrations/20260922010000_explicit_credit_selection_foundation.sql', 'utf8'));
  check((await q("select pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure) def"))[0].def === legacyDefinition,
    'Foundation leaves existing automation unchanged');
  const e = (await q("select e.id,e.campus_id from enrollments e where e.status='active' and not exists(select 1 from enrollment_credits cr where cr.enrollment_id=e.id and cr.status='open') and exists(select 1 from training_group_assignments a where a.enrollment_id=e.id and a.end_date is null) order by e.id limit 1"))[0];
  assert.ok(e, 'Need Preview fixture enrollment');
  const actor = randomUUID();
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [actor, `credit-test-${actor}@example.invalid`]);
  async function role(code, campus = null) {
    await owner();
    await q('delete from user_roles where user_id=$1', [actor]);
    if (code) await q('insert into user_roles(user_id,role_id,campus_id) select $1,id,$3 from app_roles where code=$2', [actor, code, campus]);
  }
  await role('superadmin');
  const types = await q("select id,code from charge_types where code in ('monthly_tuition','uniform_training','cup')");
  const type = code => types.find(t => t.code === code).id;
  async function charge(amount, code, extra = {}) {
    return (await q("insert into charges(enrollment_id,charge_type_id,description,amount,currency,status,created_by,product_id,size,uniform_fulfillment_mode) values($1,$2,'Explicit credit test',$3,'MXN','pending',$4,$5,$6,$7) returning id",
      [e.id, type(code), amount, actor, extra.product ?? null, code === 'uniform_training' ? 'M' : null, code === 'uniform_training' ? 'pending_order' : null]))[0].id;
  }
  const tuition = await charge(700, 'monthly_tuition');
  const uniform = await charge(800, 'uniform_training');
  const product = (await q("insert into products(name,charge_type_id,default_amount,currency,is_active) values($1,$2,400,'MXN',true) returning id", [`Credit test ${actor}`, type('cup')]))[0].id;
  await q("insert into tournaments(name,campus_id,product_id,is_active,charge_amount) values('Credit test',$1,$2,true,400)", [e.campus_id, product]);
  const tournamentCharge = await charge(400, 'cup', { product });
  const copaProduct = (await q('select id from products where copa_tigres_installments limit 1'))[0].id;
  const copa = await charge(1250, 'cup', { product: copaProduct });
  const source = (await q("insert into payments(enrollment_id,paid_at,method,amount,currency,status,operator_campus_id,created_by) values($1,now(),'card',200,'MXN','posted',$2,$3) returning id", [e.id, e.campus_id, actor]))[0].id;
  await q("insert into enrollment_credits(enrollment_id,campus_id,source_workflow,original_amount,reason,created_by) values($1,$2,'manual_admin_credit',1000,'Test only',$3)", [e.id, e.campus_id, actor]);
  await q("insert into enrollment_credits(enrollment_id,campus_id,source_payment_id,source_workflow,original_amount,reason,created_by) values($1,$2,$3,'eligible_payment_remainder',200,'Test only',$4)", [e.id, e.campus_id, source, actor]);
  const baselinePayments = (await q('select count(*)::int n from payments where enrollment_id=$1', [e.id]))[0].n;
  const baselineCash = (await q('select count(*)::int n from cash_session_entries'))[0].n;
  const baselineAllocations = (await q('select count(*)::int n from payment_allocations'))[0].n;
  const selection = [{ chargeId: tuition, amount: 200, expectedPending: 700 }, { chargeId: uniform, amount: 800, expectedPending: 800 }];
  const request = randomUUID();

  await denied(() => call(actor, e.id, request, selection, 1199), 'credit_selection_changed');
  await denied(() => call(actor, e.id, request, [{ ...selection[0], expectedPending: 699 }]), 'credit_selection_changed');
  await denied(() => call(actor, e.id, request, [selection[0], selection[0]]), 'invalid_credit_selection');
  await denied(() => call(actor, e.id, request, [{ ...selection[0], amount: 701 }]), 'invalid_credit_selection');
  await denied(() => call(actor, e.id, request, [{ ...selection[0], amount: 0 }]), 'invalid_credit_selection');
  await denied(() => call(actor, e.id, request, [{ ...selection[0], amount: 0.001 }]), 'invalid_credit_selection');
  await denied(() => call(actor, e.id, request, [{ ...selection[0], amount: '200' }]), 'invalid_credit_selection');
  await denied(() => call(actor, e.id, request, []), 'invalid_credit_selection');
  await denied(() => call(actor, e.id, request, null), 'invalid_credit_selection');
  await denied(() => call(actor, e.id, request, [{ chargeId: copa, amount: 600, expectedPending: 1250 }]), 'copa_tigres_no_credit');
  await denied(() => call(actor, e.id, request, [{ ...selection[0], chargeId: randomUUID() }]), 'invalid_target_charge');

  await owner();
  await db.query('savepoint stale_source');
  await q("update payments set status='void' where id=$1", [source]);
  await denied(() => call(actor, e.id, request, selection), 'credit_source_requires_review');
  await db.query('rollback to savepoint stale_source;release savepoint stale_source');
  await owner();
  await db.query('savepoint overcommitted_source');
  await q('update payments set amount=199 where id=$1', [source]);
  await denied(() => call(actor, e.id, request, selection), 'credit_source_requires_review');
  await db.query('rollback to savepoint overcommitted_source;release savepoint overcommitted_source');

  // Force a late failure after applications/settlement; no partial operation may remain.
  await owner();
  await db.query('savepoint late_failure');
  await db.query("create function pg_temp.fail_credit_audit() returns trigger language plpgsql as $$ begin if new.action='account_credit.applied.explicit' then raise exception 'test_late_failure'; end if; return new; end $$; create trigger test_fail_credit_audit before insert on public.audit_logs for each row execute function pg_temp.fail_credit_audit()");
  await denied(() => call(actor, e.id, request, selection), 'test_late_failure');
  await owner();
  check((await q('select 1 from enrollment_credit_applications where application_key=$1', [request])).length === 0, 'Late failure rolls back applications');
  check((await q('select 1 from uniform_orders where charge_id=$1', [uniform])).length === 0, 'Late failure rolls back uniform order');
  check((await q('select 1 from explicit_credit_operations where id=$1', [request])).length === 0, 'Late failure leaves no receipt');
  await db.query('rollback to savepoint late_failure;release savepoint late_failure');

  const receipt = await call(actor, e.id, request, selection);
  check(typeof receipt.playerName === 'string' && receipt.playerName.length > 0 &&
    typeof receipt.campusName === 'string' && receipt.campusName.length > 0, 'Receipt snapshots player and campus identity');
  check(receipt.moneyReceived === 0 && receipt.creditApplied === 1000 && receipt.creditRemaining === 200, 'Credit-only receipt separates cash from credit');
  check(receipt.lines.find(l => l.chargeId === tuition).pendingAfter === 500, 'Only requested tuition amount used');
  check(receipt.lines.find(l => l.chargeId === uniform).pendingAfter === 0, 'Uniform settled');
  check(JSON.stringify(await call(actor, e.id, request, [...selection].reverse())) === JSON.stringify(receipt), 'Reordered retry returns identical receipt');
  await denied(() => call(actor, e.id, request, [selection[0]]), 'credit_request_conflict');
  await denied(() => call(actor, e.id, request, selection, 1400), 'credit_request_conflict');
  await owner();
  check((await q('select count(*)::int n from payments where enrollment_id=$1', [e.id]))[0].n === baselinePayments, 'No new money/payment record');
  check((await q('select count(*)::int n from cash_session_entries'))[0].n === baselineCash, 'No cash-session entry');
  check((await q('select count(*)::int n from payment_allocations'))[0].n === baselineAllocations, 'No legacy payment sweep');
  check((await q('select 1 from uniform_orders where charge_id=$1', [uniform])).length === 1, 'Exactly one uniform order');
  check((await q('select 1 from enrollment_credit_applications where application_key=$1 and charge_id<>all($2::uuid[])', [request, [tuition, uniform]])).length === 0, 'No unselected charges funded');
  check((await q("select 1 from audit_logs where action='account_credit.applied.explicit' and record_id=$1", [request])).length === 1, 'Exactly one audit operation');
  await call(actor, e.id, randomUUID(), [{ chargeId: tuition, amount: 50, expectedPending: 500 }], 200);
  check(JSON.stringify(await call(actor, e.id, request, selection)) === JSON.stringify(receipt), 'Later application does not rewrite original receipt');

  for (const roleName of ['anon', 'service_role']) {
    await owner();
    check(!(await q("select has_function_privilege($1,'public.apply_explicit_credit_selection(uuid,uuid,jsonb,numeric)','execute') allowed", [roleName]))[0].allowed, `${roleName} cannot call explicit selection`);
  }
  await owner();
  check(!(await q("select has_table_privilege('authenticated','public.explicit_credit_operations','select') allowed"))[0].allowed, 'Raw receipts are private');
  for (const code of [null, 'field_admin', 'director_readonly', 'porto_viewer']) {
    await role(code);
    await denied(() => call(actor, e.id, request, selection), 'forbidden');
  }
  const otherCampus = (await q('select id from campuses where is_active and id<>$1 limit 1', [e.campus_id]))[0].id;
  await role('front_desk', otherCampus);
  await denied(() => call(actor, e.id, request, selection), 'forbidden');
  await role('front_desk', e.campus_id);
  check((await call(actor, e.id, request, selection)).operationId === request, 'Scoped Front Desk authorized');
  await owner();
  await denied(() => q("insert into user_roles(user_id,role_id) select $1,id from app_roles where code='director_readonly'", [actor]),
    'director_readonly_cannot_combine_staff_roles');
  await role('superadmin');
  await q('update auth.users set email_confirmed_at=null where id=$1', [actor]);
  await denied(() => call(actor, e.id, request, selection), 'forbidden');
  await owner();
  await q("update auth.users set email_confirmed_at=now(),banned_until=now()+interval '1 day' where id=$1", [actor]);
  await denied(() => call(actor, e.id, request, selection), 'forbidden');
  await owner();
  await q('update auth.users set banned_until=null where id=$1', [actor]);

  // Credit-only tournament settlement and historical-account choice are supported.
  await q("insert into enrollment_credits(enrollment_id,campus_id,source_workflow,original_amount,reason,created_by) values($1,$2,'manual_admin_credit',250,'Test only',$3)", [e.id, e.campus_id, actor]);
  await call(actor, e.id, randomUUID(), [{ chargeId: tournamentCharge, amount: 400, expectedPending: 400 }], 400);
  await owner();
  check((await q("select 1 from tournament_player_entries where charge_id=$1 and entry_status='confirmed'", [tournamentCharge])).length === 1, 'Credit-only tournament registration synchronized');
  await db.query('savepoint historical');
  await q("update enrollments set status='ended' where id=$1", [e.id]);
  await q("insert into enrollment_credits(enrollment_id,campus_id,source_workflow,original_amount,reason,created_by) values($1,$2,'manual_admin_credit',50,'Test only',$3)", [e.id, e.campus_id, actor]);
  await call(actor, e.id, randomUUID(), [{ chargeId: tuition, amount: 50, expectedPending: 450 }], 50);
  await owner();
  check((await q('select status from enrollments where id=$1', [e.id]))[0].status === 'ended', 'Explicit historical application does not reenroll player');
  await db.query('rollback to savepoint historical;release savepoint historical');
  console.log(`PASS ${checks} explicit-credit foundation checks.`);
})().catch(error => {
  console.error(error.code ?? '', error.message, error.where ?? '');
  process.exitCode = 1;
}).finally(async () => {
  await db.query('rollback').catch(() => {});
  await db.end();
  console.log('Preview transaction rolled back; no persistent changes.');
});
