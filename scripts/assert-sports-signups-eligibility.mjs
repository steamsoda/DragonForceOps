import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const query = await readFile(new URL("src/lib/queries/sports-signups.ts", root), "utf8");
const board = await readFile(new URL("src/components/sports/sports-signups-board.tsx", root), "utf8");
const page = await readFile(new URL("src/app/(protected)/sports-signups/page.tsx", root), "utf8");
const detail = await readFile(new URL("src/app/(protected)/sports-signups/detail/page.tsx", root), "utf8");
const exportRoute = await readFile(new URL("src/app/api/exports/sports-signups/route.ts", root), "utf8");
const productPage = await readFile(new URL("src/app/(protected)/products/[productId]/page.tsx", root), "utf8");

assert.match(query, /from\("product_training_group_restrictions"\)/);
assert.match(query, /from\("product_pricing_rules"\)/);
assert.match(query, /restrictedGroupIds && restrictedGroupIds\.size > 0/);
assert.match(query, /if \(!bucket\.requiresPricingRuleMatch\) return true/);
assert.match(query, /pricingRuleDefinesEligibility/);
assert.match(query, /eligibleActiveEnrollmentIds\.add\(enrollment\.id\)/);
assert.match(query, /if \(!eligibleActiveEnrollmentIds\.has\(enrollment\.id\)\) continue/);
assert.match(query, /getCompetitionBucketIds\(charge, productBucketIds, bundleEntitlements\)/);
assert.match(query, /eligibilityReviewPlayers/);

assert.match(board, /No Selectivos/);
assert.doesNotMatch(board, /Futbol Para Todos/);
assert.match(board, /Selectivos/);
assert.match(board, /dashboard\.selectedProgram/);
assert.match(board, /programQuery/);
assert.match(page, /program: params\.program/);
assert.match(detail, /program: params\.program/);
assert.match(exportRoute, /program = searchParams\.get\("program"\)/);
assert.match(productPage, /Grupos invitados al torneo/);

console.log("Sports signups eligibility assertions passed.");
