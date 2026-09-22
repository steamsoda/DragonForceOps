const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const m={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/finance/collection-balance.ts','utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText,{module:m,exports:m.exports});
const sum=m.exports.outstandingChargeAmount;
assert.equal(sum([{status:'pending',pendingAmount:700}]),700);
assert.equal(sum([{status:'pending',pendingAmount:500},{status:'void',pendingAmount:700}]),500);
assert.equal(sum([{status:'pending',pendingAmount:0}]),0);
assert.equal(sum([{status:'pending',pendingAmount:0.1},{status:'pending',pendingAmount:0.2}]),0.3);
assert.throws(()=>sum([{status:'pending',pendingAmount:NaN}]),/unavailable/);
console.log('PASS 5 collection-status arithmetic and failure checks.');
