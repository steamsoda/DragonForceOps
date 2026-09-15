const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, overrides = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const modules = {};
  for (const node of parsed.statements) {
    if (ts.isImportDeclaration(node)) modules[node.moduleSpecifier.text] = {};
  }
  Object.assign(modules, {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-dom': require('react-dom'),
  }, overrides);
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: m.exports, module: m, console, process, URLSearchParams,
    require: id => { assert.ok(id in modules, id); return modules[id]; },
  });
  return m.exports;
}

(async () => {
  let readOnly = true, verified = true, checks = 0, reads = 0;
  const context = () => ({ isDirectorReadOnly: readOnly, isDirector: true, hasAttendanceWriteAccess: true });
  const roles = load('src/lib/auth/roles.ts').APP_ROLES;
  const actions = load('src/server/actions/attendance.ts', {
    'next/navigation': { redirect: () => { throw Error('denied'); } },
    '@/lib/auth/permissions': { getPermissionContext: async () => context(), requireAttendanceWriteContext: async () => context() },
    '@/lib/auth/debug-view': { assertDebugWritesAllowed: async () => {}, getDebugViewContext: async () => ({
      isReadOnly: false, effective: { roleRows: [], roleCodes: [roles.DIRECTOR_ADMIN, ...(readOnly ? [roles.DIRECTOR_READONLY] : [])] },
    }) },
    '@/lib/auth/roles': { APP_ROLES: roles },
    '@/lib/perf/timing': { createPerfTimer: () => ({ mark() {} }) },
    '@/lib/supabase/admin': { createAdminClient: () => { throw Error('writer reached'); } },
    '@/lib/time': { getMonterreyDateString: () => '2026-09-15' },
  });
  const calls = [
    () => actions.saveAttendanceSessionAction('session', new FormData()),
    () => actions.cancelAttendanceSessionAction('session', new FormData()),
    () => actions.generateAttendanceSessionsAction(new FormData()),
    () => actions.createAttendanceScheduleAction(new FormData()),
    () => actions.createBulkAttendanceSchedulesAction(new FormData()),
    () => actions.updateAttendanceScheduleAction('template', new FormData()),
    () => actions.createManualAttendanceSessionAction(new FormData()),
    () => actions.createAttendanceClosureAction(new Map([
      ['starts_on', '2026-09-15'], ['ends_on', '2026-09-15'], ['reason_code', 'rain'], ['title', 'Test closure'],
    ])),
  ];
  for (const call of calls) await assert.rejects(call, /^Error: denied$/);
  readOnly = false;
  await assert.rejects(calls[0], /writer reached/);
  readOnly = true;

  const queries = load('src/lib/queries/attendance.ts', {
    '@/lib/auth/permissions': { getPermissionContext: async () => context() },
    '@/lib/auth/operational-page-reader': { requireOperationalPageReader: async () => {
      checks++; if (!verified) throw Error('revoked'); return context();
    } },
    '@/lib/auth/campuses': { getAttendanceCampusAccess: async () => null },
    '@/lib/supabase/admin': { createAdminClient: () => { reads++; throw Error('unexpected read'); } },
    '@/lib/time': { getMonterreyDateString: () => '2026-09-15' },
  });
  await queries.getAttendanceDailyNotes({ date: '2026-09-15' });
  assert.ok(checks > 0);
  verified = false;
  await assert.rejects(() => queries.getAttendanceDailyNotes({ date: '2026-09-15' }), /revoked/);
  await assert.rejects(() => queries.getAttendanceSessionDetail('session'), /revoked/);
  await assert.rejects(() => queries.listAttendanceScheduleTemplates(), /revoked/);
  assert.equal(reads, 0);

  const controls = load('src/components/auth/read-only-controls.tsx');
  const { AttendanceRecorder } = load('src/components/attendance/attendance-recorder.tsx', {
    '@/components/auth/read-only-controls': controls,
  });
  const render = readOnly => renderToStaticMarkup(React.createElement(controls.ReadOnlyProvider, { readOnly },
    React.createElement(AttendanceRecorder, { sessionId: 'session', disabled: false, sessionNotes: 'Session note', roster: [{
      enrollmentId: 'enrollment', playerName: 'Test Player', birthYear: 2015, currentStatus: 'present', note: 'Player note', source: 'manual',
    }] })));
  const readerHtml = render(true);
  assert.match(readerHtml, /Session note/);
  assert.match(readerHtml, /Player note/);
  assert.match(readerHtml, /<button[^>]*type="submit"[^>]*disabled=""/);
  assert.doesNotMatch(readerHtml, /<button[^>]*type="button"[^>]*disabled=""/);
  assert.doesNotMatch(render(false), /title="Solo lectura"/);

  const policy = load('src/lib/auth/director-readonly-policy.ts');
  assert.equal(policy.directorReadOnlyRequestAllowed('GET', '/attendance/notes', true), true);
  assert.equal(policy.directorReadOnlyRequestAllowed('POST', '/attendance/notes', true), false);
  assert.equal(policy.directorReadOnlyRequestAllowed('GET', '/attendance/notes', false), false);
  console.log('PASS: attendance mixed-role write veto, role revocation before reads, standard recorder fields, disabled save and GET-only notes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
