const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, dependencies, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, { module, exports: module.exports, ...globals, require: id => {
    assert.ok(id in dependencies, id); return dependencies[id];
  } });
  return module.exports;
}
const env = { DIRECTOR_READONLY_ENABLED: 'true', VERCEL_ENV: 'preview' };
const policy = load('src/lib/auth/director-readonly-policy.ts', {}, { process: { env } });
let codes = ['director_readonly'];
let roleError = null;
let authenticated = true;
let verified = true;
const response = (kind, status = 200) => ({ kind, status, cookies: { set() {}, getAll: () => [] } });
const supabase = {
  rpc: async name => { assert.equal(name, 'is_director_readonly'); return { data: verified, error: null }; },
  auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'reader' } : null } }) },
  from: table => {
    assert.equal(table, 'user_roles');
    return { select: () => ({ eq: () => ({ returns: async () => ({ data: codes.map(code => ({ app_roles: { code } })), error: roleError }) }) }) };
  },
};
const { proxy } = load('src/proxy.ts', {
  '@supabase/ssr': { createServerClient: () => supabase },
  'next/server': { NextResponse: { next: () => response('next'), json: (_, options) => response('json', options.status), redirect: () => response('redirect', 307) } },
  '@/lib/supabase/env': { getSupabaseEnv: () => ({ url: 'https://example.test', publicKey: 'public' }) },
  '@/lib/auth/director-readonly-policy': policy,
}, { URL, process: { env } });
function request(method, pathname) {
  const url = new URL(pathname, 'https://example.test');
  url.clone = () => new URL(url);
  return { method, url: url.href, nextUrl: url, cookies: { getAll: () => [], set() {} } };
}
(async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    for (const path of ['/players', '/players/x.png', '/auth/create-account', '/auth/callback', '/api/payments', '/', '/_next/static/x.js', '/favicon.ico']) {
      assert.equal((await proxy(request(method, path))).status, 403, `${method} ${path}`);
    }
  }
  assert.equal((await proxy(request('GET', '/admin/users'))).kind, 'redirect');
  assert.equal((await proxy(request('GET', '/api/receipts'))).status, 403);
  assert.equal((await proxy(request('POST', '/api/auth/signout'))).kind, 'next');
  assert.equal((await proxy(request('POST', '/api/auth/password'))).kind, 'next');
  assert.equal((await proxy(request('GET', '/auth/confirm'))).kind, 'next');
  assert.equal((await proxy(request('GET', '/_next/static/x.js'))).kind, 'next');
  verified = false;
  assert.equal((await proxy(request('GET', '/players'))).kind, 'redirect');
  assert.equal((await proxy(request('GET', '/unauthorized'))).kind, 'next');
  assert.equal((await proxy(request('POST', '/api/auth/signout'))).kind, 'next');
  verified = true;
  codes = ['director_admin'];
  assert.equal((await proxy(request('POST', '/players'))).kind, 'next');
  roleError = { message: 'unavailable' };
  assert.equal((await proxy(request('POST', '/players'))).status, 503);
  roleError = null;
  authenticated = false;
  assert.equal((await proxy(request('POST', '/auth/create-account'))).kind, 'next');
  console.log('Proxy role boundary passed: mutation and financial denial, logout, staff and auth flow preservation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
