import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile("src/app/api/auth/email/route.ts", "utf8");
const helper = await readFile("src/lib/auth/porto-email-proof.ts", "utf8");
const confirmed = await readFile("src/app/auth/email-confirmed/page.tsx", "utf8");
const home = await readFile("src/app/page.tsx", "utf8");
const callback = await readFile("src/app/auth/callback/route.ts", "utf8");

assert.match(route, /shouldCreateUser:\s*false/);
assert.match(route, /isAllowedPortoEmail/);
assert.match(route, /isPortoEmailProofEnabled/);
assert.match(route, /GENERIC_MESSAGE/);
assert.match(helper, /rita\.cabral@fcporto\.pt/);
assert.match(helper, /VERCEL_ENV === "preview"/);
assert.match(confirmed, /no concede acceso a datos ni permisos/i);
assert.match(confirmed, /isAllowedPortoEmail/);
assert.match(home, /showPortoEmailProof/);
assert.match(callback, /!requestedNext\.startsWith\("\/\/"\)/);

console.log("Porto passwordless Preview proof assertions passed.");
