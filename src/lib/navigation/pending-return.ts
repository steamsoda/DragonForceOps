export function getSafePendingReturnTo(value: string | null | undefined) {
  if (!value) return "";

  try {
    const parsed = new URL(value, "https://invicta.local");
    const allowedPath = parsed.pathname === "/pending" || parsed.pathname === "/pending/detail";

    if (parsed.origin !== "https://invicta.local" || !allowedPath) return "";

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "";
  }
}
