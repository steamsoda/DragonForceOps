// Preview only. Every probe and synthetic identity is rolled back; no commit mode.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
if (process.argv.length !== 2) throw Error('No arguments supported');
const { db, ref } = require('./test-director-readonly-db.cjs');
if (ref !== 'eqefgwdsqabnmpnbpqbq') throw Error('Preview required');
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const zero = '00000000-0000-0000-0000-000000000000';
let checks = 0;
async function probe(sql, args, expected) {
  await db.query('savepoint probe');
  let result;
  try { result = { rows: await q(sql, args) }; }
  catch (e) { result = { code: e.code, message: e.message }; }
  finally { await db.query('rollback to savepoint probe; release savepoint probe'); }
  assert.ok(expected(result), `${sql}: unexpected ${JSON.stringify(result)}`);
  checks++;
}
const denied = r => r.code === '42501' || r.message === 'unauthorized'
  || (r.rows?.length === 1 && r.rows[0].ok === false && r.rows[0].error_code === 'unauthorized');
async function identity(id) {
  await db.query('reset role');
  await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",
    [JSON.stringify({ sub: id, role: 'authenticated' }), id]);
  await db.query('set local role authenticated');
}
(async () => {
  await db.connect();
  await db.query('begin');
  await db.query("set local statement_timeout='15s'; set local lock_timeout='3s'; set local idle_in_transaction_session_timeout='60s'");
  const campuses = await q('select id from public.campuses where is_active order by id limit 2');
  assert.equal(campuses.length, 2, 'Two campuses required');
  const payments = await q(`select distinct on(e.campus_id) p.id,e.id enrollment_id,e.campus_id
    from public.payments p join public.enrollments e on e.id=p.enrollment_id
    where e.campus_id=any($1::uuid[]) order by e.campus_id,p.id`, [campuses.map(c => c.id)]);
  assert.equal(payments.length, 2, 'Payment in each campus required');
  const actors = [];
  for (const role of ['none','director_readonly','coach','front_desk','director_admin','superadmin']) {
    const id = randomUUID();
    await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
      [id, `security-${id}@fcportodragonforcemty.com`]);
    if (role !== 'none') {
      const rows = await q(`insert into public.user_roles(user_id,role_id,campus_id)
        select $1,id,$3 from public.app_roles where code=$2 returning user_id`,
      [id,role,role === 'front_desk' ? campuses[0].id : null]);
      assert.equal(rows.length,1, `Missing role ${role}`);
    }
    actors.push({ id,role });
  }
  for (const { id, role } of actors) {
    await identity(id);
    const start = checks;
    const privileged = ['director_admin','superadmin'].includes(role);
    await probe('select public.nuke_player($1)',[zero],role === 'superadmin'
      ? r => r.message === 'player_not_found' : denied);
    await probe('select public.merge_players($1,$2,$3,$4)',[zero,randomUUID(),id,'Security rollback probe'],
      privileged ? r => r.message === 'master_not_found' : denied);
    if (privileged) await probe('select public.merge_players($1,$2,$3,$4)',
      [zero,randomUUID(),randomUUID(),'Security rollback probe'],denied);
    await probe('select * from public.repair_payment_allocations($1,$2,$3,$4)',
      [payments[0].enrollment_id,[],[],'[]'],role === 'superadmin'
        ? r => r.rows?.[0]?.error_code === 'payment_selection_required' : denied);
    if (role !== 'superadmin') {
      await probe('select public.save_email_preauthorization($1,$2,$3,$4)',
        ['security-probe@example.invalid','director_readonly',null,-1],denied);
      await probe('select public.revoke_email_preauthorization($1,$2)',
        ['security-probe@example.invalid',1],denied);
      await probe('select * from public.list_auth_users()',[],r => denied(r) || r.rows?.length === 0);
    } else {
      await probe('select count(*)::int n from public.list_auth_users()',[],r => r.rows?.[0]?.n >= actors.length);
      await probe('select public.save_email_preauthorization($1,$2,$3,$4)',
        ['security-probe@example.invalid','superadmin',null,-1],r => r.message === 'staff_domain_required');
    }
    for (const payment of payments) {
      const allowed = privileged || (role === 'front_desk' && payment.campus_id === campuses[0].id);
      // Authorized mutation success needs dedicated financial fixtures, not existing accounts.
      if (allowed) {
        await probe('select public.current_user_can_access_payment($1) allowed',[payment.id],r => r.rows?.[0]?.allowed === true);
        continue;
      }
      await probe('select * from public.record_payment_refund($1,$2,$3,$4,$5)',
        [payment.id,'cash','2026-09-18T12:00:00Z','Security rollback probe',null],denied);
      await probe('select * from public.reassign_payment_to_charges($1,$2)',[payment.id,[]],denied);
      await probe('select * from public.reassign_payment_source_charge_to_charges($1,$2,$3)',[payment.id,zero,[]],denied);
    }
    console.log(JSON.stringify({role,checks:checks-start}));
  }
  console.log(JSON.stringify({result:'PASS',checks,scope:'high-risk denial and guard reachability; not financial mutation success'}));
})().catch(e => { console.error(e.message); process.exitCode=1; }).finally(async () => {
  await db.query('rollback').catch(() => {});
  await db.end();
  console.log('Rolled back; no persistent changes.');
});
