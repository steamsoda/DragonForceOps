import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [billingSource, diagnosticsSource, sanitySource, pageSource] = await Promise.all([
  readFile(new URL("../src/lib/queries/billing.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/queries/enrollment-finance-diagnostics.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/queries/finance-sanity.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/app/(protected)/admin/finance-sanity/page.tsx", import.meta.url), "utf8"),
]);

assert.match(billingSource, /strictReadErrors\?: boolean/);
assert.match(billingSource, /enrollment_ledger_read_failed:/);
assert.match(diagnosticsSource, /getEnrollmentLedger\(enrollmentId, \{ strictReadErrors: true \}\)/);
assert.match(diagnosticsSource, /finance_diagnostic_read_failed:canonical_balance/);
assert.match(sanitySource, /FINANCE_DIAGNOSTIC_CONCURRENCY = 6/);
assert.match(sanitySource, /mapWithConcurrencyLimit\(/);
assert.doesNotMatch(
  sanitySource,
  /candidateEnrollmentIds\.map\(\(enrollmentId\) => getEnrollmentFinanceDiagnostics/,
);
assert.match(sanitySource, /failedEnrollmentCount === 0/);
assert.match(pageSource, /Escaneo financiero incompleto/);
assert.match(pageSource, /no se convirtieron en saldos de \$0 ni en falsas anomalias/);

console.log("Finance sanity bounded-concurrency and failed-read safeguards passed.");
