const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { z } = require('zod');
function load(file, modules) {
  const result = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module: result, exports: result.exports, require: id => {
    if (!(id in modules)) throw Error(`Unexpected dependency ${id}`); return modules[id];
  } });
  return result.exports;
}
let allowed = true, calls = [], readEnabled = true;
const actions = load('src/server/actions/preauthorizations.ts', {
  'next/navigation': { redirect: path => { throw Error(path); } },
  'next/cache': { revalidatePath: () => {} }, zod: { z },
  '@/lib/auth/debug-view': { assertDebugWritesAllowed: async () => {} },
  '@/lib/auth/permissions': { requireSuperAdminContext: async () => { if (!allowed) throw Error('forbidden'); } },
  '@/lib/supabase/server': { createClient: async () => ({ rpc: async (...args) => { calls.push(args); return { error: null }; } }) },
  '@/lib/auth/director-readonly-policy': { directorReadOnlyEnabled: () => readEnabled },
});
const form = values => { const f = new FormData(); for (const [k,v] of Object.entries(values)) f.set(k,v); return f; };
(async () => {
  const valid = { email: ' Test@Example.COM ', role: 'director_readonly', campus: '', revision: '-1' };
  allowed = false;
  await assert.rejects(actions.savePreauthorization(form(valid)), /forbidden/); assert.equal(calls.length, 0);
  allowed = true;
  await assert.rejects(actions.savePreauthorization(form({ ...valid, role: 'coach' })), /invalid_form/); assert.equal(calls.length, 0);
  readEnabled = false;
  await assert.rejects(actions.savePreauthorization(form(valid)), /invalid_form/); assert.equal(calls.length, 0);
  readEnabled = true;
  await assert.rejects(actions.savePreauthorization(form(valid)), /preauthorization_saved/);
  assert.equal(calls[0][0], 'save_email_preauthorization');
  assert.equal(calls[0][1].p_email, 'test@example.com'); assert.equal(calls[0][1].p_campus, null);
  assert.equal(calls[0][1].p_revision, -1);
  const { Preauthorizations } = load('src/components/admin/preauthorizations.tsx', {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-dom': require('react-dom'),
    'lucide-react': require('lucide-react'), '@/server/actions/preauthorizations': actions,
  });
  const row = { email: 'pending@example.com', role_code: 'director_readonly', campus_id: null,
    campus_name: null, enabled: true, auto_grant: true, claimed_at: null, approved_at: '2026-09-14', revision: 0, last_issue: null };
  const props = { rows: [row, { ...row, email: 'claimed@example.com', claimed_at: '2026-09-14' }], total: 2,
    offset: 0, search: '', unavailable: false, campuses: [], roles: [{ code: 'director_readonly', label: 'Director - Solo lectura' }] };
  const html = renderToStaticMarkup(React.createElement(Preauthorizations, props));
  assert.ok(html.includes('Pendiente') && html.includes('Asignada'));
  assert.ok(html.includes('Editar pending@example.com'));
  assert.ok(!html.includes('Editar claimed@example.com'));
  assert.ok(html.includes('Gestionar en Usuarios'));
  const unavailable = renderToStaticMarkup(React.createElement(Preauthorizations, { ...props, unavailable: true }));
  assert.ok(unavailable.includes('disabled=""') && unavailable.includes('role="alert"'));
  console.log('PASS action guards, normalization, feature gate, pending/claimed UI and unavailable-state checks.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
