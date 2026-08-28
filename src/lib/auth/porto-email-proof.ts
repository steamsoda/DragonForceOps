const DEFAULT_PORTO_EMAIL_ALLOWLIST = ["rita.cabral@fcporto.pt"];

export function normalizeAuthEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isPortoEmailProofEnabled() {
  return process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development";
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
