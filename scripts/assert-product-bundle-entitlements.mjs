import assert from "node:assert/strict";

const {
  hasGenderConditionalBundleEntitlements,
  resolveEntitledProductIds,
} = await import("../src/lib/products/bundle-entitlements.ts");

const entitlements = [
  { sourceProductId: "combo", targetProductId: "leyendas", gender: null, isActive: true },
  { sourceProductId: "combo", targetProductId: "superliga", gender: "male", isActive: true },
  { sourceProductId: "combo", targetProductId: "rosa", gender: "female", isActive: true },
  { sourceProductId: "combo", targetProductId: "inactive", gender: null, isActive: false },
];

assert.equal(hasGenderConditionalBundleEntitlements("combo", entitlements), true);
assert.equal(hasGenderConditionalBundleEntitlements("normal", entitlements), false);

assert.deepEqual(
  resolveEntitledProductIds({ sourceProductId: "combo", gender: "male", entitlements }),
  ["combo", "leyendas", "superliga"],
);
assert.deepEqual(
  resolveEntitledProductIds({ sourceProductId: "combo", gender: "female", entitlements }),
  ["combo", "leyendas", "rosa"],
);
assert.deepEqual(
  resolveEntitledProductIds({ sourceProductId: "combo", gender: null, entitlements }),
  ["combo", "leyendas"],
);
assert.deepEqual(
  resolveEntitledProductIds({ sourceProductId: "normal", gender: "male", entitlements }),
  ["normal"],
);

console.log("Product bundle entitlement assertions passed.");
