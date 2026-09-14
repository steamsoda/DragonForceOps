const DEFAULT_PORTO_EMAIL_ALLOWLIST = ["rita.cabral@fcporto.pt"];

export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isPortoEmailProofEnabled() {
  // Superseded by the CAPTCHA-protected password flow. Do not leave an
  // alternate unauthenticated email-sending endpoint enabled.
  return false;
}

export function getPortoEmailAllowlist() {
  const configured = process.env.PORTO_DEMO_EMAIL_ALLOWLIST
    ?.split(",")
    .map(normalizeAuthEmail)
    .filter(Boolean);

  return new Set(configured?.length ? configured : DEFAULT_PORTO_EMAIL_ALLOWLIST);
}

export function isAllowedPortoEmail(value: string) {
  return getPortoEmailAllowlist().has(normalizeAuthEmail(value));
}
