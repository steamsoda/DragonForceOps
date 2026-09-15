// Preview only; all users, grants and DDL are rolled back. There is no commit mode.
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const { parseEnv } = require("node:util"), { randomUUID } = require("node:crypto"), { Client } = require("pg");
if (process.argv.length > 2) throw Error("No arguments or commit mode supported");
const env = parseEnv(fs.readFileSync(path.resolve(__dirname, "../../../.env.local"), "utf8"));
const ref = "eqefgwdsqabnmpnbpqbq", url = new URL(env.SUPABASE_PREVIEW_DB_URL);
if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co` ||
 !(url.hostname === `db.${ref}.supabase.co` || (url.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(url.username) === `postgres.${ref}`))) throw Error("Preview target required");
url.searchParams.delete("sslmode");
const db = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
async function identity(id) {
 await db.query("reset role");
 await q("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.sub',$2,true)", [JSON.stringify({ sub: id, role: "authenticated" }), id]);
 await db.query("set local role authenticated");
}
async function owner() { await db.query("reset role"); await q("select set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true)"); }
async function denied(sql, args, code = "42501") {
 await db.query("savepoint denied");
 try { await q(sql, args); throw Error("Unexpected success"); }
 catch (e) { assert.equal(e.code, code); }
 finally { await db.query("rollback to savepoint denied"); }
}
(async () => {
 await db.connect();
 try {
  await db.query("begin"); await db.query("set local statement_timeout='30s'");
  await db.query(fs.readFileSync(path.resolve(__dirname,"../supabase/migrations/20260915160000_director_caja_reads.sql"),"utf8"));
  await db.query(fs.readFileSync(path.resolve(__dirname,"../supabase/migrations/20260915170000_director_receipt_search.sql"),"utf8"));
  await db.query(fs.readFileSync(path.resolve(__dirname,"../supabase/migrations/20260915180000_director_report_counts.sql"),"utf8"));
  await db.query(fs.readFileSync(path.resolve(__dirname,"../supabase/migrations/20260915190000_director_porto_counts.sql"),"utf8"));
  await db.query(fs.readFileSync(path.resolve(__dirname,"../supabase/migrations/20260915200000_director_product_charge_ledger.sql"),"utf8"));
  const viewer = randomUUID(), staff = randomUUID();
  for (const [id, role] of [[viewer,"director_readonly"],[staff,"director_admin"]]) {
   await q("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",[id,`${id}@fcportodragonforcemty.com`]);
   await q("insert into public.user_roles(user_id,role_id) select $1,id from public.app_roles where code=$2",[id,role]);
  }
  const [sample] = await q("select e.campus_id,extract(year from p.birth_date)::int yob from public.enrollments e join public.players p on p.id=e.player_id join public.campuses c on c.id=e.campus_id where e.status='active' and p.status='active' and c.is_active and p.birth_date is not null limit 1");
  assert.ok(sample);
  await identity(staff);
  const normal = await q("select * from public.list_caja_players_by_campus_year($1,$2)",[sample.campus_id,sample.yob]);
  const receipts = await q("select * from public.search_receipts(null,$1,null,30,0)",[sample.campus_id]);
  const [monthly] = await q("select * from public.get_resumen_mensual_summary('2026-09',$1)",[sample.campus_id]);
  const [dashboard] = await q("select * from public.get_dashboard_finance_summary('2026-09',$1)",[sample.campus_id]);
  await denied("select public.director_report_counts('2026-09',$1)",[sample.campus_id]);
  assert.equal((await q("select * from public.director_search_receipts() ")).length,0);
  await denied("select * from public.director_caja_years()",[]);
  const [{ porto }] = await q("select public.get_porto_datos_generales('2026-09-01') porto");
  await denied("select public.director_porto_counts('2026-09-01')",[]);
  const [product] = await q("select product_id from public.charges where product_id is not null limit 1");
  const ledger = product ? await q("select * from public.get_product_charge_ledger($1)",[product.product_id]) : [];
  assert.equal((await q("select * from public.director_product_charge_ledger($1)",[product?.product_id ?? randomUUID()])).length,0);
  await identity(viewer);
  const [{ porto: readerPorto }] = await q("select public.director_porto_counts('2026-09-01') porto");
  assert.ok(!('pendiente_mxn' in readerPorto.deudores));
  for (const key of ['nuevas_inscripciones','retiros','activos']) assert.deepEqual(readerPorto[key],porto[key]);
  assert.equal(readerPorto.deudores.count,porto.deudores.count);
  if (product) assert.deepEqual(await q("select * from public.director_product_charge_ledger($1)",[product.product_id]),ledger);
  const years = await q("select * from public.director_caja_years()"); assert.ok(years.length);
  const [{ counts }] = await q("select public.director_report_counts('2026-09',$1) counts",[sample.campus_id]);
  assert.equal(Number(counts.paymentCount),Number(monthly.payment_count));
  assert.equal(Number(counts.enrollmentsWithBalance),Number(dashboard.enrollments_with_balance));
  assert.equal(Number(counts.paymentCount),Number(dashboard.payment_count_this_month));
  assert.equal(Number(counts.activeEnrollments),Number(monthly.active_enrollments));
  assert.equal(Number(counts.player360Count),Number(monthly.player_360_count));
  assert.equal(Number(counts.historicalCatchupCount),Number(monthly.historical_catchup_count));
  assert.doesNotMatch(JSON.stringify(counts), /"(?:amount|total|balance|totalCobrado|pendingBalance)"/);
  await denied("select public.director_report_counts('2026-99',null)",[],"22023");
  await denied("select public.director_report_counts('2026-09',$1)",[randomUUID()]);
  const readerReceipts = await q("select * from public.director_search_receipts(null,$1,null,30,0)",[sample.campus_id]);
  assert.deepEqual(readerReceipts, receipts);
  if (receipts.length) {
    assert.equal((await q("select * from public.director_search_receipts(null,null,$1)",[receipts[0].payment_id])).length,1);
    assert.equal((await q("select * from public.director_search_receipts(null,$1,null,1,1)",[sample.campus_id]))[0]?.payment_id,receipts[1]?.payment_id);
  }
  assert.equal((await q("select * from public.director_search_receipts(null,$1)",[randomUUID()])).length,0);
  const read = await q("select * from public.director_caja_players(null,$1,$2)",[sample.campus_id,sample.yob]);
  const normalize = rows => rows.map(r => JSON.stringify([r.player_id,r.enrollment_id,r.player_name,r.birth_year,String(r.balance)])).sort();
  assert.deepEqual(normalize(read),normalize(normal));
  const search = await q("select * from public.director_caja_players($1)",[String(sample.yob)]);
  assert.ok(search.length > 0 && search.length <= 8); assert.ok(search.every(r => r.birth_year === sample.yob));
  await denied("select * from public.director_caja_players('a')",[],"22023");
  await denied("select * from public.director_caja_players()",[],"22023");
  await denied("update public.players set first_name=first_name where id=$1",[read[0].player_id]);
  assert.equal((await q("select * from public.payments limit 1")).length,0);
  const profileScope = await q("select id,campus_id from public.v_director_readonly_enrollments where player_id=$1", [read[0].player_id]);
  assert.ok(profileScope.some(row => row.id === read[0].enrollment_id));
  await denied("update public.uniform_orders set status=status where false", []);
  await owner(); await q("delete from public.user_roles where user_id=$1",[viewer]);
  await identity(viewer); await denied("select * from public.director_caja_years()",[]);
  await denied("select public.director_report_counts()",[]);
  assert.equal((await q("select * from public.director_search_receipts() ")).length,0);
  assert.equal((await q("select id from public.v_director_readonly_enrollments where player_id=$1", [read[0].player_id])).length, 0);
  console.log("PASS: Preview migrations, real-role staff/read-only cohort and receipt parity, pagination, scope, raw finance/write denial and revocation. All rolled back.");
 } finally { await db.query("rollback"); await db.end(); }
})().catch(e => { console.error(e.message); process.exitCode=1; });
