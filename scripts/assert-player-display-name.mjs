import assert from "node:assert/strict";
import { compactPlayerName } from "../src/lib/exports/player-display-name.ts";

assert.equal(compactPlayerName("Amanda Mariana Garza Escobedo"), "Amanda Garza");
assert.equal(compactPlayerName("Alan Rodriguez Perez"), "Alan Rodriguez");
assert.equal(compactPlayerName("Juan Pablo de la Garza"), "Juan de la Garza");
assert.equal(compactPlayerName("Jose Maria de los Santos Perez"), "Jose de los Santos");
assert.equal(compactPlayerName("Gael"), "Gael");

console.log("Compact player display-name assertions passed.");
