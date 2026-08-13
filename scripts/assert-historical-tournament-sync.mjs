import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const payments = read("src/server/actions/payments.ts");
const migration = read("supabase/migrations/20260812190000_backfill_historical_tournament_entries.sql");

assert.match(payments, /syncPaidCompetitionSignupsForCharges/);
assert.match(
  payments,
  /syncPaidCompetitionSignupsForCharges\([\s\S]*allocations\.map\(\(allocation\) => allocation\.chargeId\)/,
);
assert.match(payments, /revalidatePath\("\/sports-signups"\)/);

assert.match(migration, /insert into public\.tournament_player_entries/);
assert.match(migration, /tournament\.product_id = charge\.product_id/);
assert.match(migration, /tournament\.campus_id = enrollment\.campus_id/);
assert.match(migration, /payment\.status = 'posted'/);
assert.match(migration, /payment_dates\.allocated_amount \+ 0\.009 >= charge\.amount/);
assert.match(migration, /not exists \([\s\S]*public\.tournament_player_entries/);
assert.match(migration, /process_competition_roster_sync_queue\(1000, null\)/);
assert.doesNotMatch(
  migration,
  /(?:update|delete from) public\.(?:charges|payments|payment_allocations|enrollments|training_group_assignments|attendance_records)/i,
);

console.log("historical tournament payment synchronization assertions passed");
