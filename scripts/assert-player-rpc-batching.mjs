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

console.log("Player RPC batching assertions passed.");
