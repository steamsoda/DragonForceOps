// Local built app, existing synthetic Preview identity; no writes or token logging.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { checkPageBody } = require("./preview-director-readonly-validation.cjs");
const state = JSON.parse(fs.readFileSync(".tmp/director-readonly-validation.json", "utf8"));
assert.equal(state.ref, "eqefgwdsqabnmpnbpqbq");
assert.equal(state.purpose, "temporary_director_readonly_preview_validation_v1");
const origin = "http://localhost:3112";
const cookie = state.cookies.map(c => c.name + "=" + c.value).join("; ");
async function request(route, method = "GET", extra = {}) {
  return fetch(origin + route, { method, redirect: "manual", signal: AbortSignal.timeout(60000),
    headers: { Cookie: cookie, Origin: origin, ...extra },
    ...(method === "POST" ? { body: "[]" } : {}) });
}
(async () => {
  let failed = 0;
  for (const route of ["/inicio", "/players", "/caja", "/pending", "/llamadas",
    "/trial-classes", "/uniforms", "/attendance", "/sports-signups", "/convocatorias",
    "/teams", "/tournaments", "/nutrition", "/products", "/admin/configuracion"]) {
    try {
      const response = await request(route);
      assert.equal(response.status, 200);
      checkPageBody(await response.text());
      const rsc = await request(route + "?_rsc=", "GET", { RSC: "1" });
      assert.equal(rsc.status, 200);
      checkPageBody(await rsc.text());
      console.log("PASS HTML/RSC " + route);
    } catch { console.log("FAIL HTML/RSC " + route); failed++; }
  }
  for (const route of ["/admin/users", "/admin/access-audit", "/admin/finance-sanity",
    "/admin/regularizacion-historica", "/api/exports/finance-sanity", "/api/reports/monthly-summary", "/api/sign-qz"]) {
    const response = await request(route);
    assert.ok(response.status === 403 || ([302,303,307,308].includes(response.status) &&
      new URL(response.headers.get("location"), origin).pathname === "/unauthorized"), route);
  }
  console.log("PASS restricted routes");
  for (const method of ["POST","PUT","PATCH","DELETE"]) {
    for (const route of ["/players", "/caja", "/products", "/teams", "/api/payments", "/api/director-readonly/account", "/_next/static/test.js"]) {
      const response = await request(route, method, { "Content-Type": "text/plain", "Next-Action": "0000000000000000000000000000000000000000" });
      assert.equal(response.status, 403, method + " " + route);
    }
  }
  console.log("PASS 28 forged mutation/action requests denied");
  if (failed) throw Error(failed + " page failures; review server output without logging customer data");
})().catch(error => { console.error(error.message); process.exitCode = 1; });
