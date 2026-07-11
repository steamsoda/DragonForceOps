import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/app/(protected)/attendance/groups/page.tsx", "utf8");
const query = await readFile("src/lib/queries/attendance.ts", "utf8");

assert.match(
  page,
  /const showPendingBalances = permissionContext\.isDirector \|\| permissionContext\.isFrontDesk;/,
  "Attendance group balances must be limited to directors and Front Desk.",
);
assert.match(
  page,
  /includePendingBalances: showPendingBalances/,
  "The canonical balance query flag must come from the role gate.",
);
assert.match(
  page,
  /showPendingBalances \? <th[^>]*>\{sortLabel\("balance", "Saldo pendiente"\)\}<\/th> : null/,
  "The balance column must remain conditional.",
);
assert.match(
  query,
  /const includePendingBalances = Boolean\(financeContext && \(financeContext\.isDirector \|\| financeContext\.isFrontDesk\)\);/,
  "The query must independently revalidate the authorized finance roles.",
);
assert.match(
  query,
  /if \(includePendingBalances && selectedGroupId\) \{[\s\S]*?\.from\("v_enrollment_balances"\)/,
  "Canonical balances must only be queried after the internal role check.",
);
assert.match(
  query,
  /\.\.\.\(includePendingBalances[\s\S]*?\? \{ pendingBalance:/,
  "Unauthorized attendance payloads must omit the pending balance property.",
);

console.log("Attendance group finance visibility assertions passed.");
