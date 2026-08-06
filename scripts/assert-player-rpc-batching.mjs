import assert from "node:assert/strict";

const { fetchPlayerRpcInChunks } = await import("../src/lib/queries/player-rpc-batching.ts");

const playerIds = Array.from({ length: 301 }, (_, index) => `player-${String(index + 1).padStart(3, "0")}`);
const calls = [];

const client = {
  async rpc(name, args) {
    calls.push({ name, args });
    return {
      data: args.p_player_ids.map((playerId) => ({ player_id: playerId })),
      error: null,
    };
  },
};

const rows = await fetchPlayerRpcInChunks(client, "example_player_rpc", {
  p_player_ids: playerIds,
  other_arg: "kept",
});

assert.equal(rows.length, playerIds.length);
assert.deepEqual(rows.map((row) => row.player_id), playerIds);
assert.equal(calls.length, 3);
assert.deepEqual(calls.map((call) => call.args.p_player_ids.length), [150, 150, 1]);
assert.ok(calls.every((call) => call.name === "example_player_rpc"));
assert.ok(calls.every((call) => call.args.other_arg === "kept"));

const boundedCalls = [];
const boundedClient = {
  async rpc(name, args) {
    boundedCalls.push({ name, args });
    return {
      data: args.p_player_ids.flatMap((playerId) =>
        Array.from({ length: args.p_limit }, (_, index) => ({ player_id: playerId, row: index + 1 })),
      ),
      error: null,
    };
  },
};

const boundedPlayerIds = playerIds.slice(0, 200);
const boundedRows = await fetchPlayerRpcInChunks(boundedClient, "recent_attendance", {
  p_player_ids: boundedPlayerIds,
  p_limit: 15,
}, {
  maxRowsPerPlayer: 15,
});

assert.equal(boundedRows.length, boundedPlayerIds.length * 15);
assert.deepEqual(boundedCalls.map((call) => call.args.p_player_ids.length), [66, 66, 66, 2]);
assert.ok(boundedCalls.every((call) => call.args.p_limit === 15));

const attendanceSource = await import("node:fs/promises").then(({ readFile }) =>
  readFile(new URL("../src/lib/queries/attendance.ts", import.meta.url), "utf8"),
);
const migrationSource = await import("node:fs/promises").then(({ readFile }) =>
  readFile(new URL("../supabase/migrations/20260806143000_recent_player_attendance_complete_batches.sql", import.meta.url), "utf8"),
);

assert.match(attendanceSource, /maxRowsPerPlayer:\s*limit/);
assert.match(migrationSource, /least\(coalesce\(p_limit, 5\), 15\)/);

console.log("Player RPC batching assertions passed.");
