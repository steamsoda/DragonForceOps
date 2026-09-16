import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

async function load(path) {
  const source = readFileSync(path, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  // Resolve zod from this workspace; all other core imports are type-only.
  const resolved = code.replace('from "zod"', `from "${import.meta.resolve("zod")}"`);
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString("base64")}`);
}
const { authCaptchaConfig, passwordRequest, passwordAuthEnabled, passwordAuthReady, trustedAuthOrigin } = await load("src/lib/auth/password-policy.ts");
const { runPasswordOperation } = await load("src/lib/auth/password-operations.ts");
const env = { NODE_ENV: "production", VERCEL_ENV: "preview", EMAIL_PASSWORD_AUTH_ENABLED: "true" };
assert.equal(passwordAuthEnabled(env), true);
assert.equal(passwordAuthEnabled({ ...env, VERCEL_ENV: "production" }), false);
assert.equal(passwordAuthEnabled({ ...env, EMAIL_PASSWORD_AUTH_ENABLED: undefined }), false);
assert.equal(passwordAuthReady(env), false);
assert.equal(passwordAuthReady({ ...env, AUTH_EMAIL_DELIVERY_READY: "true", AUTH_SECURITY_CONFIG_VERIFIED: "true", NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY: "key" }), true);
const production = {
  NODE_ENV: "production", VERCEL_ENV: "production", EMAIL_PASSWORD_AUTH_ENABLED: "true",
  EMAIL_PASSWORD_AUTH_PRODUCTION_ENABLED: "true", AUTH_SECURITY_CONFIG_VERIFIED: "true",
  AUTH_SITE_URL: "https://dragon-force-ops.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://hjvytfaalnfcqfgbxsmj.supabase.co",
  AUTH_EMAIL_DELIVERY_READY: "true", NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY: "test-key",
};
assert.equal(passwordAuthEnabled(production), true);
assert.equal(passwordAuthReady(production), true);
const turnstile = { ...production, AUTH_CAPTCHA_PROVIDER: "turnstile", NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY: "turnstile-key" };
assert.deepEqual(authCaptchaConfig(turnstile), { provider: "turnstile", siteKey: "turnstile-key" });
assert.equal(passwordAuthReady(turnstile), true);
assert.equal(passwordAuthReady({ ...turnstile, NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY: undefined }), true);
assert.equal(passwordAuthReady({ ...turnstile, NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY: undefined }), false);
assert.equal(passwordAuthReady({ ...turnstile, NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY: "  " }), false);
assert.equal(passwordAuthReady({ ...turnstile, AUTH_CAPTCHA_PROVIDER: "unknown" }), false);
assert.deepEqual(authCaptchaConfig(production), { provider: "hcaptcha", siteKey: "test-key" });
for (const key of Object.keys(production).filter(key => key !== "NODE_ENV")) {
  assert.equal(passwordAuthReady({ ...production, [key]: undefined }), false, `missing ${key}`);
}
for (const key of ["EMAIL_PASSWORD_AUTH_ENABLED", "EMAIL_PASSWORD_AUTH_PRODUCTION_ENABLED", "AUTH_SECURITY_CONFIG_VERIFIED", "AUTH_EMAIL_DELIVERY_READY", "AUTH_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  assert.equal(passwordAuthReady({ ...production, [key]: "incorrect" }), false, `invalid ${key}`);
}
assert.equal(passwordAuthReady({ ...production, NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY: "" }), false);
assert.equal(passwordAuthEnabled({ ...production, NEXT_PUBLIC_SUPABASE_URL: "https://eqefgwdsqabnmpnbpqbq.supabase.co" }), false);
assert.equal(passwordAuthEnabled({ ...production, AUTH_SITE_URL: production.AUTH_SITE_URL + ".evil.test" }), false);
const origin = "https://preview.example.com";
assert.equal(trustedAuthOrigin(new Request(origin, { headers: { origin } }), origin), origin);
assert.equal(trustedAuthOrigin(new Request(origin, { headers: { origin: "https://evil.example" } }), origin), null);
assert.equal(trustedAuthOrigin(new Request(origin), origin), null);
assert.equal(trustedAuthOrigin(new Request("https://evil.example", { headers: { origin } }), origin), null);
const signup = { action: "signup", email: " Person@Example.com ", password: "a long test password", captchaToken: "captcha" };
assert.equal(passwordRequest.parse(signup).email, "person@example.com");
for (const extra of [{ role: "super_admin" }, { data: { role: "porto_viewer" } }, { campus: "all" }]) {
  assert.equal(passwordRequest.safeParse({ ...signup, ...extra }).success, false);
}
assert.equal(passwordRequest.safeParse({ ...signup, password: "short" }).success, false);
for (const [length, accepted] of [[7, false], [8, true], [72, true], [73, false], [128, false]]) {
  assert.equal(passwordRequest.safeParse({ ...signup, password: "a".repeat(length) }).success, accepted);
  assert.equal(passwordRequest.safeParse({ action: "reset", token_hash: "x".repeat(64), password: "a".repeat(length) }).success, accepted);
}
assert.equal(passwordRequest.safeParse({ ...signup, captchaToken: "" }).success, false);
assert.equal(passwordRequest.safeParse({ action: "reset", password: signup.password }).success, false);
assert.equal(passwordRequest.safeParse({ action: "reset", token_hash: "x".repeat(64), password: signup.password, type: "signup" }).success, false);

function mock(overrides = {}) {
  const calls = [];
  const auth = new Proxy({}, { get: (_, name) => async (...args) => {
    calls.push([name, ...args]);
    return overrides[name] ?? { error: null, data: { user: { email_confirmed_at: "2026-09-13" } } };
  } });
  return { auth, calls };
}
let m = mock();
let result = await runPasswordOperation(m.auth, passwordRequest.parse(signup), origin);
assert.equal(result.session, false);
assert.deepEqual(m.calls[0][1], { email: "person@example.com", password: signup.password, options: { captchaToken: "captcha", emailRedirectTo: `${origin}/auth/confirm` } });
const generic = result.message;
m = mock({ signUp: { error: { code: "user_already_exists", status: 422 } } });
assert.equal((await runPasswordOperation(m.auth, passwordRequest.parse(signup), origin)).message, generic);
for (const action of ["forgot", "resend"]) {
  m = mock();
  assert.equal((await runPasswordOperation(m.auth, { action, email: "person@example.com", captchaToken: "captcha" }, origin)).message, generic);
  assert.equal(m.calls.length, 1);
}
for (const [action, method] of [["signup", "signUp"], ["forgot", "resetPasswordForEmail"], ["resend", "resend"]]) {
  for (const [code, status, expected] of [
    ["email_provider_disabled", 400, 503], ["unexpected_failure", 500, 503],
    ["email_address_not_authorized", 400, 503], [undefined, 0, 503],
    ["new_unknown_error", 400, 503], ["captcha_failed", 400, 400],
    ["over_email_send_rate_limit", 429, 429], ["over_request_rate_limit", 429, 429],
    [undefined, 429, 429], ["weak_password", 422, 400],
    ["user_already_exists", 422, 200], ["email_exists", 422, 200],
    ["user_not_found", 404, 200], ["email_not_confirmed", 400, 200],
  ]) {
    m = mock({ [method]: { error: { code, status, message: "PRIVATE provider details person@example.com" } } });
    const response = await runPasswordOperation(m.auth, { ...signup, action }, origin);
    assert.equal(response.status, expected, `${action}: ${code}`);
    assert.equal(response.session, false);
    assert.equal(response.next, undefined);
    assert.equal(JSON.stringify(response).includes("PRIVATE"), false);
    assert.equal(JSON.stringify(response).includes("person@example.com"), false);
    assert.equal(response.message === generic, expected === 200);
    assert.equal(m.calls.length, 1);
  }
}
m = mock();
result = await runPasswordOperation(m.auth, { ...signup, action: "signin" }, origin);
assert.equal(result.session, true);
assert.equal(result.next, "/inicio");
m = mock({ signInWithPassword: { error: null, data: { user: { email_confirmed_at: null } } } });
assert.equal((await runPasswordOperation(m.auth, { ...signup, action: "signin" }, origin)).session, false);
const reset = { action: "reset", token_hash: "x".repeat(64), password: signup.password };
m = mock({ verifyOtp: { error: { code: "otp_expired" } } });
result = await runPasswordOperation(m.auth, reset, origin);
assert.equal(result.status, 400);
assert.deepEqual(m.calls.map(c => c[0]), ["verifyOtp"]);
m = mock();
result = await runPasswordOperation(m.auth, reset, origin);
assert.equal(result.session, false);
assert.deepEqual(m.calls, [ ["verifyOtp", { token_hash: reset.token_hash, type: "recovery" }], ["updateUser", { password: signup.password }], ["signOut", { scope: "global" }] ]);
m = mock({ updateUser: { error: { code: "weak_password" } } });
assert.equal((await runPasswordOperation(m.auth, reset, origin)).status, 400);
assert.equal(m.calls.at(-1)[0], "signOut");
m = mock();
result = await runPasswordOperation(m.auth, { action: "confirm", token_hash: reset.token_hash }, origin);
assert.equal(result.session, true);
assert.deepEqual(m.calls, [["verifyOtp", { token_hash: reset.token_hash, type: "signup" }]]);
console.log("Password auth policy and mocked operation tests passed (gates, origin, validation, no role metadata, generic messages, recovery isolation, session handling).");
