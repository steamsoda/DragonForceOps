import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const source = fs.readFileSync("src/lib/enrollments/returning.ts", "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
});

const sandbox = {
  module: { exports: {} },
  exports: {},
  require,
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(outputText, sandbox, { filename: "src/lib/enrollments/returning.ts" });

const { getReturningInscriptionOption } = sandbox.module.exports;

const inscriptionOnly = getReturningInscriptionOption("inscription_only");
assert.equal(inscriptionOnly.amount, 700, "Returning enrollment inscription-only tier should be $700");

console.log("Returning enrollment pricing assertions passed.");
