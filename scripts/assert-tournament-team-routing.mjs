import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/20260810190000_dynamic_competition_roster_routing.sql", import.meta.url),
  "utf8",
);

assert.match(migration, /if not v_tournament_active then[\s\S]*tournament_inactive/i);
assert.match(migration, /if cardinality\(v_destination_ids\) = 0 then[\s\S]*insert into public\.competition_roster_squads/i);
assert.match(migration, /if cardinality\(v_destination_ids\) > 1 then[\s\S]*pending_split_assignment/i);
assert.match(migration, /if cardinality\(v_destination_ids\) > 1 then[\s\S]*v_destination_id := v_destination_ids\[1\];[\s\S]*insert into public\.competition_roster_squad_members/i);
assert.match(migration, /array_agg\(distinct squad\.id/i);

console.log("Tournament team routing assertions passed.");
