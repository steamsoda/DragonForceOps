import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, query, layout] = await Promise.all([
  readFile("src/app/(protected)/reports/carga-entrenamiento/page.tsx", "utf8"),
  readFile("src/lib/queries/training-workload-report.ts", "utf8"),
  readFile("src/app/(protected)/layout.tsx", "utf8"),
]);

assert.match(page, /title="Promedios de asistencia por coach"/);
assert.match(page, /showAll=\{false\}/);
assert.match(page, /mode === "coach" \? "Coach " : ""/);
assert.match(page, /data\.coachSections\.map/);
assert.match(page, /\+\{cell\.tryouts\}P/);
assert.match(page, />SR</);
assert.match(page, /Prom\.<br \/>oficial/);
assert.match(page, /%<br \/>asistencia/);
assert.match(page, /Prom\.<br \/>pruebas/);
assert.match(page, /Prom\.<br \/>total/);

assert.match(query, /get_training_workload_30d/);
assert.match(query, /row\.session_status === "completed"/);
assert.match(query, /coach_snapshot_source === "legacy_backfill_current_assignment"/);
assert.match(query, /const key = coaches\.map\(\(coach\) => coach\.id\)\.sort\(\)\.join\(":"\)/);
assert.doesNotMatch(query, /from\("(?:charges|payments|payment_allocations|account_credits)"\)/);

assert.match(layout, /href: "\/reports\/carga-entrenamiento", label: "Carga de entrenamiento"/);

console.log("Training workload coach-view assertions passed.");
