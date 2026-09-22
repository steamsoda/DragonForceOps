const fs = require('node:fs');
const assert = require('node:assert/strict');
const { parseEnv } = require('node:util');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const env = parseEnv(fs.readFileSync('../director-parity/.env.local', 'utf8'));
assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'https://eqefgwdsqabnmpnbpqbq.supabase.co');
const url = new URL(env.SUPABASE_PREVIEW_DB_URL);
assert.ok(url.hostname === 'db.eqefgwdsqabnmpnbpqbq.supabase.co' || decodeURIComponent(url.username) === 'postgres.eqefgwdsqabnmpnbpqbq');
url.searchParams.delete('sslmode');
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const copy = value => JSON.parse(JSON.stringify(value));
async function owner() {
  await db.query('reset role');
  await q("select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true)");
}
async function denied(fn, message) {
  await db.query('savepoint denied');
  let error;
  try { await fn(); } catch (e) { error = e; }
  finally { await db.query('rollback to savepoint denied;release savepoint denied'); }
  check(error && error.message.includes(message), `Expected ${message}, got ${error?.message ?? 'success'}`);
}
async function scenario(fn) {
  await owner(); await db.query('savepoint scenario');
  try { await fn(); } finally { await db.query('rollback to savepoint scenario;release savepoint scenario'); }
}

(async () => {
  await db.connect();
  await db.query("begin;set local lock_timeout='3s';set local statement_timeout='30s'");
  const autoBefore = (await q("select pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure) def"))[0].def;
  const installed = process.argv.includes('--installed');
  const tableBefore = (await q("select to_regclass('public.explicit_cart_checkouts') table_name"))[0].table_name;
  if (installed) assert.ok(tableBefore, 'Installed Preview checkout required');
  for (const file of installed ? [] : ['20260922010000_explicit_credit_selection_foundation.sql', '20260922020000_explicit_cart_checkout.sql']) {
    await db.query(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  check((await q("select pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure) def"))[0].def === autoBefore, 'No global automatic function change');
  const retired = process.argv.includes('--retired');
  const operationReceipts = process.argv.includes('--operation-receipts');
  const operationReceiptBefore = (await q("select to_regclass('public.charge_operation_receipts') t"))[0].t;
  if (operationReceipts && !operationReceiptBefore) await db.query(fs.readFileSync('supabase/migrations/20260922080000_charge_operation_receipts.sql', 'utf8'));
  if (retired && !installed) for (const file of ['20260922030000_retire_automatic_credit.sql', '20260922040000_explicit_credit_collection_balances.sql', '20260922050000_explicit_checkout_recovery.sql', '20260922060000_standalone_credit_recovery.sql', '20260922070000_director_operation_resolution.sql']) {
    await db.query(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  }
  const e = (await q("select e.id,e.campus_id from enrollments e where e.status='active' and not exists(select 1 from enrollment_credits c where c.enrollment_id=e.id and c.status='open') and not exists(select 1 from charges c where c.enrollment_id=e.id and c.copa_tigres_installments and c.status<>'void') and exists(select 1 from training_group_assignments a where a.enrollment_id=e.id and a.end_date is null) order by e.id limit 1"))[0];
  assert.ok(e, 'Need Preview fixture enrollment');
  const actor = randomUUID();
  await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [actor, `checkout-${actor}@example.invalid`]);
  async function role(code, campus = null) {
    await owner(); await q('delete from user_roles where user_id=$1', [actor]);
    if (code) await q('insert into user_roles(user_id,role_id,campus_id) select $1,id,$3 from app_roles where code=$2', [actor, code, campus]);
  }
  await role('superadmin');
  const types = await q("select id,code from charge_types where code in ('monthly_tuition','uniform_training','cup')");
  const type = code => types.find(t => t.code === code).id;
  async function charge(amount, code, product = null) {
    return (await q("insert into charges(enrollment_id,charge_type_id,description,amount,currency,status,created_by,product_id,size,uniform_fulfillment_mode) values($1,$2,'Atomic checkout test',$3,'MXN','pending',$4,$5,$6,$7) returning id", [e.id, type(code), amount, actor, product, code === 'uniform_training' ? 'M' : null, code === 'uniform_training' ? 'pending_order' : null]))[0].id;
  }
  const tuition = await charge(700, 'monthly_tuition');
  const uniform = await charge(600, 'uniform_training');
  const product = (await q("insert into products(name,charge_type_id,default_amount,currency,is_active) values($1,$2,400,'MXN',true) returning id", [`Atomic cup ${actor}`, type('cup')]))[0].id;
  await q("insert into tournaments(name,campus_id,product_id,is_active,charge_amount) values('Atomic cup',$1,$2,true,400)", [e.campus_id, product]);
  const cup = await charge(400, 'cup', product);
  const copaProduct = (await q('select id from products where copa_tigres_installments and is_active limit 1'))[0].id;
  const copa = await charge(1250, 'cup', copaProduct);
  const source = (await q("insert into payments(enrollment_id,paid_at,method,amount,currency,status,operator_campus_id,created_by) values($1,now(),'card',300,'MXN','posted',$2,$3) returning id", [e.id, e.campus_id, actor]))[0].id;
  await q("insert into enrollment_credits(enrollment_id,campus_id,source_payment_id,source_workflow,original_amount,reason,created_by) values($1,$2,$3,'eligible_payment_remainder',300,'Atomic test only',$4)", [e.id, e.campus_id, source, actor]);
  const line = (id, pending, due = pending, kind = 'ordinary') => ({ key: id, chargeId: id, pending, due, kind, creditAllowed: kind === 'ordinary' });
  const payload = (lines, selection, payments, available = 300) => ({ command: {
    requestId: randomUUID(), enrollmentId: e.id, currency: 'MXN', expectedAvailableCredit: available,
    expectedLines: lines, creditSelection: selection, payments,
  }, charges: [], notes: 'Rollback-only test', paidAt: '2026-09-20T23:00:00Z' });
  const base = payload([line(tuition, 700), line(uniform, 600), line(cup, 400)],
    [{ key: tuition, amount: 300 }], [{ method: 'cash', amount: 400 }, { method: 'card', amount: 1000 }]);
  async function call(data, who = actor, campus = e.campus_id, dbRole = 'service_role') {
    await owner();
    await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: who, role: dbRole }), who]);
    assert.ok(['service_role', 'authenticated', 'anon'].includes(dbRole));
    await db.query(`set local role ${dbRole}`);
    return (await q('select checkout_explicit_cart($1,$2,$3,$4,$5) result', [who, e.id, campus, data.command.requestId, JSON.stringify(data)]))[0].result;
  }
  async function counts() {
    await owner(); return (await q(`select
      (select count(*) from payments where enrollment_id=$1)::int payments,
      (select count(*) from charges where enrollment_id=$1)::int charges,
      (select count(*) from payment_allocations)::int allocations,
      (select count(*) from enrollment_credit_applications)::int credits,
      (select count(*) from cash_session_entries)::int cash,
      (select count(*) from uniform_orders)::int uniforms,
      (select count(*) from explicit_cart_checkouts)::int receipts`, [e.id]))[0];
  }
  await denied(() => call(base, actor, e.campus_id, 'authenticated'), 'permission denied');
  await denied(() => call(base, actor, e.campus_id, 'anon'), 'permission denied');
  for (const code of [null, 'director_readonly', 'porto_viewer', 'field_admin']) {
    await role(code); await denied(() => call(base), 'forbidden');
  }
  await role('superadmin');
  const otherCampus = (await q('select id from campuses where id<>$1 and is_active limit 1', [e.campus_id]))[0].id;
  await role('front_desk', otherCampus); await denied(() => call(base), 'forbidden');
  await role('front_desk', e.campus_id); await denied(() => call(base, actor, otherCampus), 'forbidden');
  await role('superadmin');
  await scenario(async () => {
    await q('update auth.users set email_confirmed_at=null where id=$1', [actor]);
    await denied(() => call(base), 'forbidden');
  });
  await scenario(async () => {
    await q("update auth.users set banned_until=now()+interval '1 day' where id=$1", [actor]);
    await denied(() => call(base), 'forbidden');
  });
  for (const [name, change, error] of [
    ['stale available', p => p.command.expectedAvailableCredit = 301, 'checkout_changed'],
    ['stale pending', p => p.command.expectedLines[0].pending = 699, 'checkout_changed'],
    ['wrong currency', p => p.command.currency = 'USD', 'checkout_changed'],
    ['duplicate target', p => p.command.expectedLines.push(p.command.expectedLines[0]), 'invalid_checkout'],
    ['duplicate credit', p => p.command.creditSelection.push(p.command.creditSelection[0]), 'invalid_credit_selection'],
    ['unknown credit target', p => p.command.creditSelection[0].key = randomUUID(), 'invalid_credit_selection'],
    ['over credit', p => p.command.creditSelection[0].amount = 301, 'invalid_credit_selection'],
    ['subcent credit', p => p.command.creditSelection[0].amount = 0.001, 'invalid_credit_selection'],
    ['short payment', p => p.command.payments[0].amount = 399, 'payment_total_mismatch'],
    ['excess payment', p => p.command.payments[0].amount = 401, 'payment_total_mismatch'],
    ['bad second tender', p => p.command.payments[1].method = 'bad', 'invalid_checkout'],
    ['subcent money', p => p.command.payments[1].amount = 1000.001, 'invalid_checkout'],
    ['string money', p => p.command.payments[1].amount = '1000', 'invalid_checkout'],
    ['future payment', p => p.paidAt = '2099-01-01T00:00:00Z', 'invalid_payment_date'],
  ]) {
    const changed = copy(base); change(changed); const before = await counts();
    await denied(() => call(changed), error); assert.deepEqual(await counts(), before, name);
  }
  await scenario(async () => {
    await q("update payments set status='void' where id=$1", [source]);
    await denied(() => call(base), 'credit_source_requires_review');
  });
  await scenario(async () => {
    await q('update payments set amount=299 where id=$1', [source]);
    await denied(() => call(base), 'credit_source_requires_review');
  });
  await scenario(async () => {
    const before = await counts();
    await db.query("create function pg_temp.fail_checkout_audit() returns trigger language plpgsql as $$ begin if new.action='checkout.explicit.completed' then raise exception 'test_late_failure'; end if; return new; end $$; create trigger test_fail_checkout_audit before insert on public.audit_logs for each row execute function pg_temp.fail_checkout_audit()");
    await denied(() => call(base), 'test_late_failure');
    check(JSON.stringify(await counts()) === JSON.stringify(before), 'Late failure rolls back credit, money, cash, receipt and uniform');
    check((await q('select 1 from tournament_player_entries where charge_id=$1', [cup])).length === 0, 'Late failure rolls back tournament registration');
  });
  await scenario(async () => {
    const before = await counts(); const receipt = await call(base);
    check((await q('select auth.role() role'))[0].role === 'service_role', 'Transaction restores service claims');
    check((await q("select current_setting('app.copa_cart_credit_targets',true) value"))[0].value === '', 'Transaction restores automatic-target scope');
    await owner();
    await db.query('set constraints all immediate');
    const after = await counts();
    check(receipt.moneyReceived === 1400 && receipt.creditApplied === 300 && receipt.creditRemaining === 0, 'Receipt separates real money and credit');
    check(after.payments === before.payments + 2 && after.receipts === before.receipts + 1, 'Two exact tenders and one receipt');
    check(receipt.payments[0].method === 'cash' && receipt.payments[0].amount === 400 && receipt.payments[1].method === 'card' && receipt.payments[1].amount === 1000, 'Split tender facts preserved');
    check(receipt.lines.every(l => l.pendingAfter === 0), 'Selected charges settled');
    check((await q('select 1 from uniform_orders where charge_id=$1', [uniform])).length === 1, 'One settled uniform order');
    check((await q("select 1 from tournament_player_entries where charge_id=$1 and entry_status='confirmed'", [cup])).length === 1, 'Paid tournament registration synchronized');
    check((await q('select 1 from payment_allocations where payment_id=$1', [source])).length === 0, 'No legacy source-payment sweep');
    check((await q('select 1 from enrollment_credit_applications where application_key=$1 and charge_id<>$2', [base.command.requestId, tuition])).length === 0, 'Only selected credit destination');
    const replay = await call(base); check(JSON.stringify(replay) === JSON.stringify(receipt), 'Retry returns identical saved receipt');
    check(JSON.stringify(await counts()) === JSON.stringify(after), 'Retry makes no duplicate records');
    const changed = copy(base); changed.notes = 'Different'; await denied(() => call(changed), 'checkout_request_conflict');
    const changedMoney = copy(base); changedMoney.command.payments[0].amount = 401;
    await denied(() => call(changedMoney), 'checkout_request_conflict');
    await owner(); await q("update charges set description='Changed after checkout' where id=$1", [tuition]);
    check(JSON.stringify(await call(base)) === JSON.stringify(receipt), 'Later description changes do not rewrite receipt');
    await owner(); await charge(77, 'monthly_tuition');
    check(JSON.stringify(await call(base)) === JSON.stringify(receipt), 'Later debt does not rewrite original remaining balance');
    await role('director_readonly'); await denied(() => call(base), 'forbidden');
  });
  await scenario(async () => {
    await role('front_desk', e.campus_id);
    const plain = payload([line(tuition, 700)], [], [{ method: 'card', amount: 700 }]);
    const result = await call(plain);
    check(result.creditApplied === 0 && result.creditRemaining === 300, 'Same-campus staff money-only checkout leaves credit untouched');
  });
  await scenario(async () => {
    const only = payload([line(tuition, 700, 300)], [{ key: tuition, amount: 300 }], []);
    const before = await counts(); const result = await call(only); const after = await counts();
    check(result.moneyReceived === 0 && result.payments.length === 0 && result.lines[0].pendingAfter === 400, 'Credit-only partial receipt');
    check(after.payments === before.payments && after.cash === before.cash, 'Credit-only makes no new payment/cash record');
  });
  await scenario(async () => {
    const partial = payload([line(uniform, 600, 400)], [{ key: uniform, amount: 100 }], [{ method: 'card', amount: 300 }]);
    const result = await call(partial); await owner();
    check(result.lines[0].pendingAfter === 200 && (await q('select 1 from uniform_orders where charge_id=$1', [uniform])).length === 0, 'Part-paid uniform creates no premature order');
  });
  await scenario(async () => {
    const stagedKey = randomUUID(), stagedId = randomUUID();
    const mixed = payload([line(copa, 1250, 600, 'copa_tigres'), { ...line(stagedKey, 600), chargeId: null }],
      [{ key: stagedKey, amount: 300 }], [{ method: 'cash', amount: 300 }, { method: 'card', amount: 600 }]);
    mixed.charges = [{ key: stagedKey, id: stagedId, charge_type_id: type('uniform_training'), description: 'New uniform', amount: 600,
      currency: 'MXN', size: 'M', uniform_fulfillment_mode: 'pending_order' }];
    const result = await call(mixed); await owner(); await db.query('set constraints all immediate');
    check(result.moneyReceived === 900 && result.creditApplied === 300, 'Copa plus staged uniform uses selected credit only');
    check(result.lines.find(l => l.chargeId === copa).pendingAfter === 650, 'Copa reservation leaves exactly 650');
    check((await q('select 1 from enrollment_credit_applications where charge_id=$1', [copa])).length === 0, 'Copa has no credit allocation');
    check(Number((await q('select sum(amount)::numeric total from enrollment_credit_applications where charge_id=$1 and application_key=$2', [stagedId, mixed.command.requestId]))[0].total) === 300, 'New charge did not consume credit automatically');
    check((await q('select 1 from uniform_orders where charge_id=$1', [stagedId])).length === 1, 'Staged uniform settles atomically');
    const finish = payload([line(copa, 650, 650, 'copa_tigres')], [], [{ method: 'card', amount: 650 }], 0);
    check((await call(finish)).lines[0].pendingAfter === 0, 'Second Copa installment settles');
    const third = payload([line(copa, 650, 650, 'copa_tigres')], [], [{ method: 'card', amount: 650 }], 0);
    await denied(() => call(third), 'checkout_changed');
  });
  await scenario(async () => {
    const bad = payload([{ ...line(copa, 1250, 600, 'copa_tigres'), creditAllowed: true }], [{ key: copa, amount: 300 }], [{ method: 'card', amount: 300 }]);
    await denied(() => call(bad), 'copa_tigres_no_credit');
    const odd = payload([line(copa, 1250, 650, 'copa_tigres')], [], [{ method: 'card', amount: 650 }]);
    await denied(() => call(odd), 'invalid_copa_installment');
  });
  await scenario(async () => {
    const key = randomUUID();
    const reprice = payload([{ ...line(key, 600), chargeId: null }], [{ key, amount: 300 }], [{ method: 'card', amount: 300 }]);
    reprice.charges = [{ key, id: tuition, existing: true, expected_amount: 700, amount: 600, currency: 'MXN' }];
    const result = await call(reprice); await owner();
    check(Number((await q('select amount from charges where id=$1', [tuition]))[0].amount) === 600 && result.lines[0].pendingAfter === 0, 'Prepared tuition repricing and checkout commit together');
  });
  await scenario(async () => {
    const key = randomUUID(), newId = randomUUID();
    const staged = payload([{ ...line(key, 400), chargeId: null }], [], [{ method: 'card', amount: 400 }]);
    staged.charges = [{ key, id: newId, product_id: product, charge_type_id: type('cup'), description: 'New cup', amount: 400, currency: 'MXN' }];
    await q('update products set is_active=false where id=$1', [product]);
    await denied(() => call(staged), 'checkout_changed'); await owner();
    check((await q('select 1 from charges where id=$1', [newId])).length === 0, 'Inactive staged product creates no charge');
  });
  await scenario(async () => {
    const newProduct = (await q("insert into products(name,charge_type_id,default_amount,currency,is_active,copa_tigres_installments) values($1,$2,1250,'MXN',true,true) returning id", [`Copa atomic ${actor}`, type('cup')]))[0].id;
    await q("insert into tournaments(name,campus_id,product_id,is_active,charge_amount) values('Copa atomic',$1,$2,true,1250)", [e.campus_id, newProduct]);
    const key = randomUUID(), newId = randomUUID();
    const staged = payload([{ ...line(key, 1250, 1250, 'copa_tigres'), chargeId: null }], [], [{ method: 'card', amount: 1250 }]);
    staged.charges = [{ key, id: newId, product_id: newProduct, charge_type_id: type('cup'), description: 'New Copa', amount: 1250, currency: 'MXN' }];
    const result = await call(staged); await owner(); await db.query('set constraints all immediate');
    check(result.lines[0].pendingAfter === 0 && result.creditRemaining === 300, 'New Copa full payment leaves available credit intact');
    check((await q("select 1 from tournament_player_entries where charge_id=$1 and entry_status='confirmed'", [newId])).length === 1, 'New Copa registration synchronized');
  });
  await scenario(async () => {
    const key = randomUUID(), newId = randomUUID();
    const staged = payload([{ ...line(key, 700, 500), chargeId: null }], [{ key, amount: 300 }], [{ method: 'card', amount: 200 }]);
    staged.charges = [{ key, id: newId, charge_type_id: type('monthly_tuition'), description: 'Staged month',
      period_month: '1900-01-01', amount: 700, currency: 'MXN' }];
    const before = await counts();
    await denied(() => call(staged), 'prior_month_arrears');
    check(JSON.stringify(await counts()) === JSON.stringify(before), 'Staged monthly tuition must be fully covered; failure rolls back all funding');
    staged.command.expectedLines[0].due = 700; staged.command.payments[0].amount = 400;
    check((await call(staged)).lines[0].pendingAfter === 0, 'Fully funded staged tuition succeeds');
  });
  await owner();
  if (retired) {
    await scenario(async () => {
      const p = payload([line(tuition, 700)], [{ key: tuition, amount: 300 }], [{ method: 'card', amount: 400 }]);
      check(Number((await q('select balance from v_charge_collection_balances where charge_id=$1', [tuition]))[0].balance) === 700, 'Unused credit cannot hide unpaid tuition');
      await call(p); await owner();
      check(Number((await q('select balance from v_charge_collection_balances where charge_id=$1', [tuition]))[0].balance) === 0, 'Selected credit plus new money settles collection balance');
    });
    await scenario(async () => {
      await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, role: 'service_role' })]);
      await db.query('set local role service_role');
      const recovery = { fields: [], snapshot: {} };
      await q('select stage_explicit_cart($1,$2,$3,$4,$5,$6)', [actor, e.id, e.campus_id, base.command.requestId, base, recovery]);
      await denied(() => q('select stage_explicit_cart($1,$2,$3,$4,$5,$6)', [actor, e.id, e.campus_id, randomUUID(), base, recovery]), 'checkout_in_progress');
      const receipt = await call(base);
      check((await q('select state from explicit_cart_intents where id=$1', [base.command.requestId]))[0].state === 'pending', 'Committed but unacknowledged checkout remains recoverable');
      await q('select fail_explicit_cart_intent($1,$2)', [actor, base.command.requestId]);
      check((await q('select state from explicit_cart_intents where id=$1', [base.command.requestId]))[0].state === 'pending', 'Failure cleanup cannot discard a committed result');
      check(JSON.stringify(await call(base)) === JSON.stringify(receipt), 'Durable request replays saved receipt');
      await q('select acknowledge_explicit_cart($1,$2)', [actor, base.command.requestId]);
      check((await q('select state from explicit_cart_intents where id=$1', [base.command.requestId]))[0].state === 'completed', 'Acknowledgement releases account for another checkout');
    });
    await scenario(async () => {
      await call(payload([line(cup, 400)], [{ key: cup, amount: 300 }], [{ method: 'card', amount: 100 }]));
      const result = (await q('select * from void_charge_to_explicit_credit($1,$2,$3,$4)', [e.id, cup, actor, 'Rollback-only annulment']))[0];
      check(Number(result.released_payment_amount) === 100 && Number(result.reopened_credit_amount) === 300, 'Annulment preserves cash-origin and reopened-credit facts');
      check(Number(result.auto_applied_credit_amount) === 0 && Number(result.remaining_credit_amount) === 400, 'Annulment leaves all released credit available');
      if (operationReceipts) {
        const receipt = (await q('select receipt from charge_operation_receipts where charge_id=$1', [cup]))[0].receipt;
        check(receipt.creditGenerated === 100 && receipt.creditRestored === 300 && receipt.cashReturned === 0, 'Saved cancellation separates new and restored credit');
        check(receipt.paymentReferences.length === 1 && receipt.operator && receipt.playerName, 'Receipt retains original payment, player and operator');
        await denied(() => q('select * from void_charge_to_explicit_credit($1,$2,$3,$4)', [e.id, cup, actor, 'Duplicate']), 'charge_not_pending');
        await owner();
        await q("update charges set description='Changed later' where id=$1", [cup]);
        check(JSON.stringify((await q('select receipt from charge_operation_receipts where charge_id=$1', [cup]))[0].receipt) === JSON.stringify(receipt), 'Reprint snapshot does not change with account edits');
      }
      await owner();
      check((await q('select 1 from enrollment_credit_applications where charge_id=$1', [tuition])).length === 0, 'Annulment does not pay unrelated tuition');
    });
    await scenario(async () => {
      if (!(await q("select 1 from cash_sessions where campus_id=$1 and status='open'", [e.campus_id])).length) {
        await q('insert into cash_sessions(campus_id,opened_by) values($1,$2)', [e.campus_id, actor]);
      }
      await call(payload([line(cup, 400)], [{ key: cup, amount: 300 }], [{ method: 'card', amount: 100 }]));
      const result = (await q('select * from record_charge_cash_refund($1,$2,$3,$4,now(),$5,null)', [e.id, cup, e.campus_id, actor, 'Rollback-only refund']))[0];
      check(Number(result.cash_refund_amount) === 100 && Number(result.reopened_credit_amount) === 300, 'Cash refund returns only money and reopens selected credit');
      check(Number(result.auto_applied_credit_amount) === 0 && Number(result.remaining_credit_amount) === 300, 'Refund does not spend reopened credit');
      if (operationReceipts) {
        const receipt = (await q('select receipt from charge_operation_receipts where charge_id=$1', [cup]))[0].receipt;
        check(receipt.cashReturned === 100 && receipt.creditRestored === 300 && receipt.creditGenerated === 0, 'Refund snapshot separates cash from restored credit');
        check(receipt.operationId === result.refund_id && receipt.operatorCampusName, 'Refund references the real cash operation');
      }
    });
    if (operationReceipts) {
      await scenario(async () => {
        const payment = (await q("insert into payments(enrollment_id,paid_at,method,amount,currency,status,operator_campus_id,created_by) values($1,now(),'card',100,'MXN','posted',$2,$3) returning id", [e.id,e.campus_id,actor]))[0].id;
        await q('insert into payment_allocations(payment_id,charge_id,amount) values($1,$2,100)', [payment,cup]);
        await q('select * from void_charge_to_explicit_credit($1,$2,$3,$4)', [e.id,cup,actor,'Partial payment']);
        const receipt = (await q('select receipt from charge_operation_receipts where charge_id=$1', [cup]))[0].receipt;
        check(receipt.chargeAmount === 400 && receipt.creditGenerated === 100 && receipt.creditRestored === 0, 'Partial cancellation creates only actual funded credit');
      });
      await scenario(async () => {
        await q('select * from void_charge_to_explicit_credit($1,$2,$3,$4)', [e.id, cup, actor, 'Unpaid test']);
        const receipt = (await q('select receipt from charge_operation_receipts where charge_id=$1', [cup]))[0].receipt;
        check(receipt.cashReturned === 0 && receipt.creditRestored === 0 && receipt.creditGenerated === 0, 'Unpaid cancellation does not invent credit');
      });
      await scenario(async () => {
        await call(payload([line(cup, 400)], [], [{ method: 'card', amount: 400 }]));
        await owner();
        await q('alter table charge_operation_receipts add constraint simulate_storage_failure check(false) not valid');
        await denied(() => q('select * from void_charge_to_explicit_credit($1,$2,$3,$4)', [e.id, cup, actor, 'Atomic failure']), 'simulate_storage_failure');
        check((await q('select status from charges where id=$1', [cup]))[0].status === 'pending', 'Receipt failure rolls back cancellation');
        check(Number((await q('select sum(amount) total from payment_allocations where charge_id=$1', [cup]))[0].total) === 400, 'Receipt failure preserves payment allocations');
      });
      await scenario(async () => {
        for (const role of ['anon','authenticated']) {
          await db.query(`set local role ${role}`);
          await denied(() => q('select * from charge_operation_receipts'), 'permission denied');
          await denied(() => q('select * from void_charge_to_explicit_credit($1,$2,$3,$4)', [e.id,cup,actor,'Forbidden']), 'permission denied');
          await owner();
        }
        await db.query('set local role service_role');
        await denied(() => q("update charge_operation_receipts set receipt='{}'"), 'permission denied');
        await denied(() => q('select * from void_charge_to_explicit_credit_core($1,$2,$3,$4)', [e.id,cup,actor,'Forbidden']), 'permission denied');
      });
      await scenario(async () => {
        if (!(await q("select 1 from cash_sessions where campus_id=$1 and status='open'", [e.campus_id])).length) {
          await q('insert into cash_sessions(campus_id,opened_by) values($1,$2)', [e.campus_id,actor]);
        }
        await call(payload([line(cup,400)],[],[{method:'card',amount:400}]));
        await owner();
        await q('alter table charge_operation_receipts add constraint simulate_storage_failure check(false) not valid');
        await denied(() => q('select * from record_charge_cash_refund($1,$2,$3,$4,now(),$5,null)', [e.id,cup,e.campus_id,actor,'Atomic refund failure']), 'simulate_storage_failure');
        check((await q('select status from charges where id=$1', [cup]))[0].status === 'pending', 'Receipt failure rolls back cash refund');
        check((await q('select 1 from charge_cash_refunds where charge_id=$1', [cup])).length === 0, 'No orphan cash refund after receipt failure');
      });
    }
    await scenario(async () => {
      await q("update enrollments set status='ended' where id=$1", [e.id]);
      await q("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actor, role: 'service_role' })]);
      await db.query('set local role service_role');
      const result = (await q('select * from reconcile_returning_enrollment_credit_fifo($1,$2)', [e.id, actor]))[0];
      check(Number(result.explicit_applied_amount) === 0 && Number(result.legacy_applied_amount) === 0, 'Reingreso reconciliation never spends explicit or legacy credit');
      check(Number(result.remaining_explicit_credit_amount) === 300, 'Historical available credit preserved');
      await owner();
      check((await q('select status from enrollments where id=$1', [e.id]))[0].status === 'ended', 'Credit check does not reactivate enrollment');
    });
    const before = await counts();
    const result = (await q('select * from auto_apply_enrollment_credit_fifo($1,$2)', [e.id, actor]))[0];
    check(Number(result.applied_amount) === 0 && Number(result.remaining_credit_amount) === 300, 'Retired compatibility function preserves available credit');
    check(JSON.stringify(await counts()) === JSON.stringify(before), 'Compatibility call creates no financial rows');
    const newCharge = await charge(100, 'cup');
    check((await q('select 1 from enrollment_credit_applications where charge_id=$1', [newCharge])).length === 0, 'Charge insertion cannot spend credit');
    check((await q("select 1 from pg_trigger where tgrelid='public.charges'::regclass and tgname='trg_apply_explicit_credit_after_charge_insert'")).length === 0, 'Automatic charge trigger removed');
    check((await q("select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_enrollment_credit_to_charges' and has_function_privilege('service_role',p.oid,'execute')")).length === 0, 'Legacy credit application unavailable to service role');
  } else {
    check((await q("select pg_get_functiondef('public.auto_apply_enrollment_credit_fifo(uuid,uuid,uuid,text)'::regprocedure) def"))[0].def === autoBefore, 'Existing automation unchanged after all scenarios');
  }
  await db.query('rollback');
  check((await q("select to_regclass('public.explicit_cart_checkouts') table_name"))[0].table_name === tableBefore, 'Original installed schema state preserved');
  check((await q('select 1 from auth.users where id=$1', [actor])).length === 0, 'Temporary actor rolled back');
  if (operationReceipts) check((await q("select to_regclass('public.charge_operation_receipts') t"))[0].t === operationReceiptBefore, 'Receipt schema state preserved after rollback');
  console.log(`PASS ${checks} atomic checkout database checks. All DDL and fixtures rolled back; no production writes or emails.`);
})().catch(async error => {
  try { await db.query('rollback'); } catch {}
  console.error(error.message); process.exitCode = 1;
}).finally(() => db.end());
