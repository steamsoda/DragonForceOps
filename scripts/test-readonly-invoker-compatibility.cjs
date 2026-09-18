// Diagnose the proposed blanket invoker change without persisting any DDL.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
if (process.argv.length !== 2) throw Error('No arguments supported');
const { db, ref } = require('./test-director-readonly-db.cjs');
if (ref !== 'eqefgwdsqabnmpnbpqbq') throw Error('Preview required');
(async () => {
  await db.connect();
  await db.query('begin');
  await db.query("set local statement_timeout='15s'; set local lock_timeout='3s'");
  const id = randomUUID();
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',
    [id,`invoker-${id}@example.invalid`]);
  await db.query(`insert into public.user_roles(user_id,role_id)
    select $1,id from public.app_roles where code='director_readonly'`,[id]);
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)",
    [JSON.stringify({sub:id,role:'authenticated'}),id]);
  await db.query('set local role authenticated');
  const before = +(await db.query('select count(*) n from public.v_director_readonly_players')).rows[0].n;
  assert.ok(before>0,'Reader must have real baseline rows');
  await db.query('reset role');
  await db.query('alter view public.v_director_readonly_players set(security_invoker=true)');
  await db.query('set local role authenticated');
  await db.query('savepoint probe');
  let after;
  try { after = {rows:+(await db.query('select count(*) n from public.v_director_readonly_players')).rows[0].n}; }
  catch(e) { after = {code:e.code}; }
  await db.query('rollback to savepoint probe');
  console.log(JSON.stringify({baselineRows:before,invokerResult:after,
    compatible:after.rows===before,scope:'players projection; not a migration'}));
})().catch(e => {console.error(e.message);process.exitCode=1;}).finally(async () => {
  await db.query('rollback').catch(()=>{});
  await db.end();
  console.log('Rolled back; view and identities unchanged.');
});
