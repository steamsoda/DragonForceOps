import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Public key only; invalid tokens and reserved email prevent account/email writes.
const env = parseEnv(readFileSync(process.argv[2], "utf8"));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(url, "https://eqefgwdsqabnmpnbpqbq.supabase.co");
const apikey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(apikey);
// Read-only readiness check: a valid CAPTCHA cannot fix a disabled provider.
const settingsResponse = await fetch(`${url}/auth/v1/settings`, {
  headers: { apikey }, signal: AbortSignal.timeout(20000),
});
assert.equal(settingsResponse.status, 200, "Preview auth settings unavailable");
const settings = await settingsResponse.json();
assert.equal(settings.external?.email, true, "Preview email provider is disabled");
assert.equal(settings.disable_signup, false, "Preview signup is disabled");
assert.equal(settings.mailer_autoconfirm, false, "Preview must require email confirmation");
console.log("Preview email provider, signup and confirmation settings passed");
const email = "turnstile-security-test@example.invalid";
const captcha = { captcha_token: "invalid-turnstile-security-test" };
for (const [path, body] of [
  ["token?grant_type=password", { email, password: "not-a-real-password", gotrue_meta_security: captcha }],
  ["signup", { email, password: "not-a-real-password", gotrue_meta_security: captcha }],
  ["recover", { email, gotrue_meta_security: captcha }],
  ["resend", { type: "signup", email, gotrue_meta_security: captcha }],
]) {
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST", headers: { apikey, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(data.error_code ?? data.code, "captcha_failed", `${path}: expected CAPTCHA rejection, status ${response.status}`);
  assert.equal(response.ok, false);
  console.log(`Preview Supabase ${path}: invalid CAPTCHA rejected`);
}
const origin = "https://dragon-force-ops-git-preview-steamsodas-projects.vercel.app";
for (const action of ["signin", "signup", "forgot", "resend"]) {
  const response = await fetch(`${origin}/api/auth/password`, {
    method: "POST", headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ action, email, ...(["signin", "signup"].includes(action) ? { password: "not-a-real-password" } : {}) }),
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 400, `${action}: missing CAPTCHA`);
  console.log(`Preview app ${action}: missing CAPTCHA rejected`);
}
for (const action of ["signup", "forgot", "resend"]) {
  const response = await fetch(`${origin}/api/auth/password`, {
    method: "POST", headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify({ action, email, captchaToken: "invalid-turnstile-security-test",
      ...(action === "signup" ? { password: "not-a-real-password" } : {}) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  assert.equal(response.status, 400, `${action}: provider rejection must not appear successful`);
  assert.equal(data.message, "No se pudo verificar la seguridad. Completa la verificacion e intenta de nuevo.");
  assert.equal(response.headers.get("set-cookie"), null);
  console.log(`Preview app ${action}: provider CAPTCHA failure reported without session`);
}
