export type ProductBundleEntitlementInput = {
  sourceProductId: string;
  targetProductId: string;
  gender: string | null;
  isActive?: boolean;
};

function normalizeGender(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "femenino") return "female";
  if (normalized === "varonil" || normalized === "masculino") return "male";
  return normalized;
}

export function hasGenderConditionalBundleEntitlements(
  sourceProductId: string,
  entitlements: ProductBundleEntitlementInput[],
) {
  return entitlements.some(
    (row) =>
      row.sourceProductId === sourceProductId &&
      row.isActive !== false &&
      normalizeGender(row.gender) !== null,
  );
}

export function resolveEntitledProductIds({
  sourceProductId,
  gender,
  entitlements,
  includeSource = true,
}: {
  sourceProductId: string;
  gender: string | null;
  entitlements: ProductBundleEntitlementInput[];
  includeSource?: boolean;
}) {
  const playerGender = normalizeGender(gender);
  const productIds = new Set<string>(includeSource ? [sourceProductId] : []);

  for (const row of entitlements) {
    if (row.sourceProductId !== sourceProductId || row.isActive === false) continue;
    const requiredGender = normalizeGender(row.gender);
    if (requiredGender && requiredGender !== playerGender) continue;
    productIds.add(row.targetProductId);
  }

  return [...productIds];
}
