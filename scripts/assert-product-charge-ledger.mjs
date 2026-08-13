import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("supabase/migrations/20260813110000_product_charge_ledger.sql", root), "utf8");
const contextMigration = await readFile(new URL("supabase/migrations/20260813130000_product_charge_ledger_context.sql", root), "utf8");
const query = await readFile(new URL("src/lib/queries/products.ts", root), "utf8");
const page = await readFile(new URL("src/app/(protected)/products/[productId]/page.tsx", root), "utf8");

assert.match(migration, /security invoker/i, "ledger RPC must preserve caller permissions");
assert.match(migration, /join target_charges charge on charge\.id = allocation\.charge_id/i, "allocation scan must be product-scoped");
assert.match(migration, /progress\.allocated_so_far >= charge\.amount/i, "paid time must mean fully allocated");
assert.match(migration, /payment\.status = 'posted'/i, "only posted payments may settle a charge");
assert.match(migration, /assignment\.end_date is null/i, "ledger must resolve the current training group");
assert.match(migration, /count\(\*\) over \(\)/i, "pagination must retain the exact filtered count");
assert.doesNotMatch(migration, /\b(insert|update|delete)\s+(into|public\.)/i, "ledger migration must remain read-only");
assert.match(contextMigration, /training_group_program text/i, "ledger must return canonical group metadata");
assert.match(contextMigration, /competition_roster_squad_members/i, "ledger must resolve product-matched competition teams");
assert.match(contextMigration, /tournament\.product_id = charge\.product_id/i, "team assignments must belong to the charged product");
assert.doesNotMatch(contextMigration, /\b(insert|update|delete)\s+(into|public\.)/i, "ledger context migration must remain read-only");

assert.match(query, /rpc\("get_product_charge_ledger"/, "product query must use the paginated ledger RPC");
assert.match(query, /p_paid_from: paidFrom/, "query must pass the start boundary");
assert.match(query, /p_paid_to: paidTo/, "query must pass the end boundary");
assert.match(page, /getMonterreyDayBounds\(paidFrom\)\.start/, "start date must use Monterrey bounds");
assert.match(page, /getMonterreyDayBounds\(paidTo\)\.end/, "end date must be inclusive by Monterrey day");
assert.match(page, /Campus \/ categoria/, "ledger must show campus and YOB");
assert.match(page, /Grupo actual/, "ledger must show current training group");
assert.match(page, /Equipo asignado/, "ledger must show the product tournament team");
assert.match(page, /<PageShell\s+wide/, "product detail must use the wide page shell");
assert.match(page, /Cargo emitido/, "ledger must show charge creation time");
assert.match(page, />Pagado</, "ledger must show payment completion time");

console.log("Product charge ledger checks passed.");
