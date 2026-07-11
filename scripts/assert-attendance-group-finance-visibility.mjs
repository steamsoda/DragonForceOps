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
  page,
  /const showGuardianPhones = permissionContext\.isDirector \|\| permissionContext\.isFrontDesk;/,
  "Attendance group guardian phones must be limited to directors and Front Desk.",
);
assert.match(
  page,
  /includeGuardianPhones: showGuardianPhones/,
  "The guardian phone query flag must come from the role gate.",
);
assert.match(
  page,
  /showGuardianPhones \? <th[^>]*>Teléfono 1<\/th> : null/,
  "The first guardian phone column must remain conditional.",
);
assert.match(
  page,
  /showGuardianPhones \? <th[^>]*>Teléfono 2<\/th> : null/,
  "The second guardian phone column must remain conditional.",
);
assert.match(
  query,
  /const canViewPrivateDetails = Boolean\(privateContext && \(privateContext\.isDirector \|\| privateContext\.isFrontDesk\)\);/,
  "The query must independently revalidate the authorized private-data roles.",
);
assert.match(
  query,
  /if \(includePendingBalances && selectedGroupId\) \{[\s\S]*?\.from\("v_enrollment_balances"\)/,
  "Canonical balances must only be queried after the internal role check.",
);
assert.match(
  query,
  /if \(includeGuardianPhones && selectedGroupId\) \{[\s\S]*?\.from\("player_guardians"\)/,
  "Guardian phones must only be queried after the internal role check.",
);
assert.match(
  query,
  /\.\.\.\(includePendingBalances[\s\S]*?\? \{ pendingBalance:/,
  "Unauthorized attendance payloads must omit the pending balance property.",
);
assert.match(
  query,
  /\.\.\.\(includeGuardianPhones[\s\S]*?guardianPhone1:[\s\S]*?guardianPhone2:/,
  "Unauthorized attendance payloads must omit both guardian phone properties.",
);

console.log("Attendance group private-data visibility assertions passed.");
