const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
module.exports = function reliabilityModules(options = {}) {
  const logs = options.logs || [];
  const globals = { crypto: require('node:crypto').webcrypto, performance, Date,
    setTimeout: options.setTimeout || setTimeout, clearTimeout: options.clearTimeout || clearTimeout,
    console: { info: (...args) => logs.push(args) } };
  const load = file => {
    const m = { exports: {} };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    } }).outputText, { module: m, exports: m.exports, ...globals });
    return m.exports;
  };
  return { '@/lib/perf/checkout-timing': load('src/lib/perf/checkout-timing.ts'),
    '@/lib/printer-attempts': load('src/lib/printer-attempts.ts') };
};
