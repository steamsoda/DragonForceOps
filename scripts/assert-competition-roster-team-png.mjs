import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setPngDpi } from "../src/lib/exports/png-dpi.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const view = fs.readFileSync(path.join(root, "src/components/sports/competition-roster-live-view.tsx"), "utf8");
const button = fs.readFileSync(path.join(root, "src/components/sports/competition-roster-team-png-button.tsx"), "utf8");
assert.match(view, /CompetitionRosterTeamPngButton/);
assert.match(button, /setPngDpi\(blob, 300\)/);
assert.match(button, /Exportar PNG/);
assert.doesNotMatch(button, /fetch\(/);

const signature = [137, 80, 78, 71, 13, 10, 26, 10];
const ihdr = [0, 0, 0, 13, 73, 72, 68, 82, ...Array(13).fill(0), 0, 0, 0, 0];
const iend = [0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0];
const blob = await setPngDpi(new Blob([new Uint8Array([...signature, ...ihdr, ...iend])]), 300);
const bytes = new Uint8Array(await blob.arrayBuffer());
const physOffset = bytes.findIndex((byte, index) => byte === 112 && bytes[index + 1] === 72 && bytes[index + 2] === 89 && bytes[index + 3] === 115);
assert.ok(physOffset > 0);
const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
assert.equal(data.getUint32(physOffset + 4), 11811);
assert.equal(data.getUint32(physOffset + 8), 11811);
assert.equal(bytes[physOffset + 12], 1);
console.log("competition roster team PNG checks passed");
