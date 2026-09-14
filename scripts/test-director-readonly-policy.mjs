import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync("src/lib/auth/director-readonly-policy.ts", "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { directorReadOnlyEnabled, directorReadOnlyRequestAllowed: allowed } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
assert.equal(directorReadOnlyEnabled({ DIRECTOR_READONLY_ENABLED: "true", VERCEL_ENV: "production" }), false);
assert.equal(directorReadOnlyEnabled({ DIRECTOR_READONLY_ENABLED: "true", VERCEL_ENV: "preview" }), true);
assert.equal(directorReadOnlyEnabled({ VERCEL_ENV: "preview" }), false);
const production = {
  VERCEL_ENV: "production", DIRECTOR_READONLY_ENABLED: "true", DIRECTOR_READONLY_PRODUCTION_ENABLED: "true",
  AUTH_SECURITY_CONFIG_VERIFIED: "true", AUTH_SITE_URL: "https://dragon-force-ops.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://hjvytfaalnfcqfgbxsmj.supabase.co",
};
assert.equal(directorReadOnlyEnabled(production), true);
for (const key of Object.keys(production)) {
  assert.equal(directorReadOnlyEnabled({ ...production, [key]: undefined }), false, `missing ${key}`);
  assert.equal(directorReadOnlyEnabled({ ...production, [key]: "incorrect" }), false, `invalid ${key}`);
}
for (const value of ["https://eqefgwdsqabnmpnbpqbq.supabase.co", production.NEXT_PUBLIC_SUPABASE_URL + ".evil.test", production.NEXT_PUBLIC_SUPABASE_URL + "/"]) {
  assert.equal(directorReadOnlyEnabled({ ...production, NEXT_PUBLIC_SUPABASE_URL: value }), false);
}
for (const value of [production.AUTH_SITE_URL + ".evil.test", production.AUTH_SITE_URL + "/path", production.AUTH_SITE_URL.replace("https:", "http:")]) {
  assert.equal(directorReadOnlyEnabled({ ...production, AUTH_SITE_URL: value }), false);
}
for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
  for (const path of ["/", "/players", "/players/a.png", "/auth/create-account", "/api/payments", "/api/auth/password/anything", "/admin/users"]) {
    assert.equal(allowed(method, path, true), false, `${method} ${path}`);
  }
}
for (const path of ["/admin/users", "/admin/configuracion", "/receipts", "/api/sign-qz", "/reports/corte-diario", "/api/exports/product-charge-ledger"]) {
  assert.equal(allowed("GET", path, true), false, path);
}
assert.equal(allowed("POST", "/api/auth/signout", false), true);
assert.equal(allowed("POST", "/api/auth/password", false), true);
assert.equal(allowed("PATCH", "/api/auth/password", true), false);
assert.equal(allowed("POST", "/api/auth/signout/anything", true), false);
assert.equal(allowed("GET", "/unauthorized", false), true);
assert.equal(allowed("GET", "/players", false), false);
assert.equal(allowed("GET", "/nutrition", true), true);
assert.equal(allowed("GET", "/nutrition", false), false);
assert.equal(allowed("GET", "/nutrition/players/new", true), false);
assert.equal(allowed("GET", "/nutrition/players/00000000-0000-0000-0000-000000000001/report", true), true);
for (const path of ["/players", "/api/players/grouped-roster", "/caja", "/dashboard", "/new-enrollments", "/datos-faltantes", "/trial-classes", "/uniforms"]) {
  assert.equal(allowed("GET", path, true), true, path);
  assert.equal(allowed("POST", path, true), false, path);
}
for (const path of ["/players/new", "/players/00000000-0000-0000-0000-000000000001/edit", "/teams/new", "/teams/00000000-0000-0000-0000-000000000001/edit", "/caja/sesion", "/llamadas", "/pending", "/attendance/notes", "/attendance/settings"]) {
  assert.equal(allowed("GET", path, true), false, path);
}
console.log("Director read-only request policy passed: default deny, production gate, financial/admin denial and mutation blocking.");
