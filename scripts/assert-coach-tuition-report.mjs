import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const query = await readFile("src/lib/queries/coach-tuition-report.ts", "utf8");
const page = await readFile("src/app/(protected)/reports/mensualidades-coaches/page.tsx", "utf8");
const charts = await readFile("src/components/reports/coach-tuition-charts.tsx", "utf8");
const permissions = await readFile("src/lib/auth/permissions.ts", "utf8");
const layout = await readFile("src/app/(protected)/layout.tsx", "utf8");

assert.match(query, /const PAGE_SIZE = 500/);
assert.match(query, /const ID_CHUNK_SIZE = 100/);
assert.match(query, /\.range\(from, from \+ PAGE_SIZE - 1\)/, "Every large source must be explicitly paginated.");
assert.match(query, /for \(let index = 0; index < enrollmentIds\.length; index \+= ID_CHUNK_SIZE\)/, "Enrollment filters must be chunked.");
assert.match(query, /\.eq\("charge_types\.code", "monthly_tuition"\)/);
assert.match(query, /\.neq\("status", "void"\)/);
assert.match(query, /payment_allocations\(amount\)/);
assert.match(query, /scholarship_status === "full"/);
assert.match(query, /return "scholarship"/);
assert.match(query, /return "omitted"/);
assert.match(query, /return "missing"/);
assert.match(query, /return "review"/);
assert.match(query, /previousPendingPeriodsByEnrollment/);
assert.match(query, /UNASSIGNED_GROUP_ID/);
assert.match(query, /uniquePlayers\.set\(player\.enrollmentId, player\)/, "Shared coaches must not duplicate general totals.");
for (const forbidden of [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/]) {
  assert.doesNotMatch(query, forbidden, "Tuition status report must remain read-only.");
}

assert.match(page, /requireTuitionStatusReportContext/);
assert.match(page, /Reporte operativo sin montos/);
assert.match(page, /Becado/);
assert.match(page, /Omitida/);
assert.match(page, /Sin cargo/);
assert.match(page, /Jugadores unicos, sin duplicar coaches compartidos/);
assert.doesNotMatch(page, /MXN|formatCurrency|formatMoney|Intl\.NumberFormat/i, "The report UI must not expose monetary values.");
assert.match(charts, /Pagada/);
assert.match(charts, /Pendiente \/ sin cargo/);
assert.match(permissions, /hasTuitionStatusReportAccess/);
assert.match(permissions, /requireTuitionStatusReportContext/);
assert.match(layout, /\/reports\/mensualidades-coaches/);

console.log("Coach tuition report assertions passed.");
