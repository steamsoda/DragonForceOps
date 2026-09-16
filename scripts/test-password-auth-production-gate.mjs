import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";

// Local HTTP only: no credentials, cookies or valid authentication payloads.
const require = createRequire(import.meta.url);
const cwd = path.resolve(process.env.PRODUCTION_GATE_APP_DIR || ".");
const approved = {
  NODE_ENV: "production", VERCEL_ENV: "production", EMAIL_PASSWORD_AUTH_ENABLED: "true",
  EMAIL_PASSWORD_AUTH_PRODUCTION_ENABLED: "true", DIRECTOR_READONLY_ENABLED: "true",
  DIRECTOR_READONLY_PRODUCTION_ENABLED: "true", AUTH_EMAIL_DELIVERY_READY: "true",
  AUTH_SECURITY_CONFIG_VERIFIED: "true", NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY: "synthetic-test-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://hjvytfaalnfcqfgbxsmj.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-public-key",
  AUTH_SITE_URL: "https://dragon-force-ops.vercel.app",
};
const cases = [
  ["production opt-ins off", { EMAIL_PASSWORD_AUTH_PRODUCTION_ENABLED: "", DIRECTOR_READONLY_PRODUCTION_ENABLED: "" }, false],
  ["base flags off", { EMAIL_PASSWORD_AUTH_ENABLED: "", DIRECTOR_READONLY_ENABLED: "" }, false],
  ["approved opt-ins", {}, true, true],
  ["missing security attestation", { AUTH_SECURITY_CONFIG_VERIFIED: "" }, false],
  ["wrong project", { NEXT_PUBLIC_SUPABASE_URL: "https://eqefgwdsqabnmpnbpqbq.supabase.co" }, false],
  ["wrong origin", { AUTH_SITE_URL: "https://example.invalid" }, false],
  ["missing delivery", { AUTH_EMAIL_DELIVERY_READY: "" }, true, false],
  ["missing CAPTCHA", { NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY: "" }, true, false],
  ["Turnstile ready", { AUTH_CAPTCHA_PROVIDER: "turnstile", NEXT_PUBLIC_AUTH_TURNSTILE_SITE_KEY: "synthetic-turnstile-key" }, true, true],
  ["Turnstile missing key", { AUTH_CAPTCHA_PROVIDER: "turnstile" }, true, false],
  ["unknown CAPTCHA provider", { AUTH_CAPTCHA_PROVIDER: "invalid" }, true, false],
];
for (const [name, patch, enabled, formReady] of cases) {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/SUPABASE|AUTH_|DIRECTOR_READONLY|CRON_|QZ_|VERCEL_|DATABASE|PGPASSWORD/i.test(key)));
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd, stdio: process.env.AUTH_GATE_DEBUG === "true" ? "inherit" : "ignore", windowsHide: true, env: { ...clean, ...approved, ...patch },
  });
  const exited = once(child, "exit");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await fetch(`${origin}/login`); ready = true; break; } catch {}
      if (child.exitCode !== null) throw Error("Production test server exited early");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Test server not ready");
    const response = await fetch(`${origin}/api/auth/password`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" });
    // Production origin validation must reject local POST even when the gate opens.
    assert.equal(response.status, enabled ? 403 : 404, name);
    const screen = await fetch(`${origin}/auth/create-account`);
    assert.equal(screen.status, enabled ? 200 : 404, name);
    if (enabled) assert.equal((await screen.text()).includes("El acceso por correo aun no esta disponible"), !formReady, name);
    const home = await (await fetch(origin)).text();
    assert.ok(home.includes("/api/auth/azure"), "Microsoft login must remain available");
    assert.equal(home.includes("/auth/create-account"), enabled, name);
    console.log(`Built production HTTP gate passed: ${name}`);
  } finally {
    child.kill();
    await exited;
  }
}
