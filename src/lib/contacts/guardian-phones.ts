export type GuardianPhoneLink = {
  isPrimary: boolean;
  createdAt: string;
  phonePrimary: string | null;
  phoneSecondary: string | null;
};

function cleanPhone(value: string | null | undefined) {
  return value?.trim() || null;
}

export function resolveGuardianPhones(links: GuardianPhoneLink[]) {
  const sorted = [...links].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.createdAt.localeCompare(b.createdAt),
  );
  const primaryLink = sorted.find((link) => link.isPrimary) ?? sorted[0] ?? null;
  const primaryPhone = cleanPhone(primaryLink?.phonePrimary);
  const fallbackPrimary = sorted
    .map((link) => cleanPhone(link.phonePrimary))
    .find((phone) => phone && phone !== primaryPhone) ?? null;
  const phone1 = primaryPhone ?? fallbackPrimary;
  const primarySecondary = cleanPhone(primaryLink?.phoneSecondary);
  const phone2 = primarySecondary && primarySecondary !== phone1
    ? primarySecondary
    : sorted
        .filter((link) => link !== primaryLink)
        .map((link) => cleanPhone(link.phonePrimary))
        .find((phone) => phone && phone !== phone1) ?? null;

  return { phone1, phone2 };
}
