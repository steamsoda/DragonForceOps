import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assertIncludes(source, expected, message) {
  if (!source.includes(expected)) {
    throw new Error(message);
  }
}

function assertNotIncludes(source, unexpected, message) {
  if (source.includes(unexpected)) {
    throw new Error(message);
  }
}

const permissions = read("src/lib/auth/permissions.ts");
const playersPage = read("src/app/(protected)/players/page.tsx");
const groupedRosterApi = read("src/app/api/players/grouped-roster/route.ts");
const playerDetailPage = read("src/app/(protected)/players/[playerId]/page.tsx");
const layout = read("src/app/(protected)/layout.tsx");

assertIncludes(
  permissions,
  "hasPlayerRosterAccess: isDirector || isFrontDesk || isOfficeAdmin || isSportsDirector",
  "Director deportivo must receive roster access.",
);

assertIncludes(
  permissions,
  "hasPlayerDataAccess: isDirector || isFrontDesk || isOfficeAdmin",
  "Player data access must remain limited to director, front desk, and office admin.",
);

assertNotIncludes(
  permissions,
  "hasPlayerDataAccess: isDirector || isFrontDesk || isOfficeAdmin || isSportsDirector",
  "Director deportivo must not receive broad player data editing access.",
);

assertIncludes(
  playersPage,
  "requirePlayerRosterContext",
  "Jugadores page must use roster access, not only player-data access.",
);

assertIncludes(
  playersPage,
  'if (view !== "groups" && !permissionContext.hasPlayerDataAccess)',
  "Active/bajas lists must remain behind player-data access.",
);

assertIncludes(
  groupedRosterApi,
  "context.hasPlayerRosterAccess",
  "Grouped roster API must use roster access.",
);

assertIncludes(
  playerDetailPage,
  "canAccessPlayerRosterRecord",
  "Player detail must enforce campus-scoped roster access.",
);

assertIncludes(
  layout,
  "hasSportsAccess ? [sportsStaffSection]",
  "Director deportivo navigation must include the Jugadores section.",
);

console.log("Director deportivo player roster access assertions passed.");
