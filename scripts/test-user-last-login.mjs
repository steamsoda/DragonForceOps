import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const page = readFileSync('src/app/(protected)/admin/users/page.tsx', 'utf8');
assert.equal((page.match(/formatDate\(authUser.last_sign_in_at\)/g) ?? []).length, 2);
assert.equal((page.match(/Ultimo acceso \(MTY\)/g) ?? []).length, 2);
assert.ok(page.includes('Cuenta creada'));
assert.ok(!page.includes('Primer acceso'));
assert.ok(page.indexOf('await requireSuperAdminContext') < page.indexOf('supabase.rpc("list_auth_users")'));
assert.ok(page.includes('if (!value) return "Nunca"'));
assert.ok(page.includes('Number.isNaN(new Date(value).getTime())'));
const code = ts.transpileModule(readFileSync('src/lib/time.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { formatDateTimeMonterrey } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
  process.env.TZ = tz;
  assert.equal(formatDateTimeMonterrey('2026-09-18T03:15:00Z'), '17/09/2026 21:15');
}
console.log('PASS: both user lists, authorization guard, null/invalid handling, Monterrey date rollover independent of server timezone.');
