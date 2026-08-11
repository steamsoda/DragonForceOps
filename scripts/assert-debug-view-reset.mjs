import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const route = read("src/app/api/debug/reset/route.ts");
const unauthorizedPage = read("src/app/unauthorized/page.tsx");

assert(route.includes("isPreviewDebugEnabled()"), "Debug reset must remain Preview-only.");
assert(route.includes("context.canManage"), "Debug reset must verify the real actor can manage debug views.");
assert(route.includes("clearDebugViewCookies()"), "Debug reset must clear only the active debug-view cookies.");
assert(route.includes('requestedPath.startsWith("//")'), "Debug reset must reject protocol-relative redirects.");
assert(unauthorizedPage.includes("debugContext?.canManage && debugContext.activeView"), "Unauthorized escape must only appear for an active managed debug view.");
assert(unauthorizedPage.includes("/api/debug/reset?next=/dashboard"), "Unauthorized page must expose the protected debug reset route.");

console.log("Debug view reset assertions passed.");
