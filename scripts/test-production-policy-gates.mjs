import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// Compiled policy tests do not require sessions or database access.
async function load(file) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace('from "zod"', `from "${import.meta.resolve("zod")}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const { directorReadOnlyEnabled, directorReadOnlyRequestAllowed } = await load("src/lib/auth/director-readonly-policy.ts");
const { passwordAuthEnabled, passwordAuthReady } = await load("src/lib/auth/password-policy.ts");
const approved = {
  VERCEL_ENV: "production", DIRECTOR_READONLY_ENABLED: "true", DIRECTOR_READONLY_PRODUCTION_ENABLED: "true",
  EMAIL_PASSWORD_AUTH_ENABLED: "true", EMAIL_PASSWORD_AUTH_PRODUCTION_ENABLED: "true",
  AUTH_SECURITY_CONFIG_VERIFIED: "true", AUTH_EMAIL_DELIVERY_READY: "true", NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY: "synthetic",
  NEXT_PUBLIC_SUPABASE_URL: "https://hjvytfaalnfcqfgbxsmj.supabase.co", AUTH_SITE_URL: "https://dragon-force-ops.vercel.app",
};
for (const [patch, director, email, ready] of [
  [{ DIRECTOR_READONLY_PRODUCTION_ENABLED: "", EMAIL_PASSWORD_AUTH_PRODUCTION_ENABLED: "" }, false, false, false],
  [{ DIRECTOR_READONLY_ENABLED: "", EMAIL_PASSWORD_AUTH_ENABLED: "" }, false, false, false],
  [{}, true, true, true],
  [{ AUTH_SECURITY_CONFIG_VERIFIED: "" }, false, false, false],
  [{ NEXT_PUBLIC_SUPABASE_URL: "https://eqefgwdsqabnmpnbpqbq.supabase.co" }, false, false, false],
  [{ AUTH_SITE_URL: "https://example.invalid" }, false, false, false],
  [{ AUTH_EMAIL_DELIVERY_READY: "" }, true, true, false],
  [{ NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY: "" }, true, true, false],
  [{ DIRECTOR_READONLY_PRODUCTION_ENABLED: "" }, false, true, true],
  [{ EMAIL_PASSWORD_AUTH_PRODUCTION_ENABLED: "" }, true, false, false],
]) {
  const env = { ...approved, ...patch };
  assert.equal(directorReadOnlyEnabled(env), director);
  assert.equal(passwordAuthEnabled(env), email);
  assert.equal(passwordAuthReady(env), ready);
  assert.equal(directorReadOnlyRequestAllowed("GET", "/players", directorReadOnlyEnabled(env)), director);
  assert.equal(directorReadOnlyRequestAllowed("POST", "/players", directorReadOnlyEnabled(env)), false);
  assert.equal(directorReadOnlyRequestAllowed("GET", "/admin/users", directorReadOnlyEnabled(env)), false);
}
console.log("Compiled production policies: 10 scenarios passed; independent opt-ins, writes/admin denied.");
