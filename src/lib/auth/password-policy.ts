import { z } from "zod";

export function passwordAuthEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV === "production") {
    return env.EMAIL_PASSWORD_AUTH_ENABLED === "true" &&
      env.EMAIL_PASSWORD_AUTH_PRODUCTION_ENABLED === "true" &&
      env.AUTH_SECURITY_CONFIG_VERIFIED === "true" &&
      env.NEXT_PUBLIC_SUPABASE_URL === "https://hjvytfaalnfcqfgbxsmj.supabase.co" &&
      env.AUTH_SITE_URL === "https://dragon-force-ops.vercel.app";
  }
  return env.EMAIL_PASSWORD_AUTH_ENABLED === "true" &&
    (env.VERCEL_ENV === "preview" || (!env.VERCEL_ENV && env.NODE_ENV === "development"));
}

export function passwordAuthReady(env: NodeJS.ProcessEnv = process.env) {
  return passwordAuthEnabled(env) && env.AUTH_EMAIL_DELIVERY_READY === "true" &&
    env.AUTH_SECURITY_CONFIG_VERIFIED === "true" && Boolean(env.NEXT_PUBLIC_AUTH_HCAPTCHA_SITE_KEY);
}

const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const password = z.string().min(8).max(72);
const captchaToken = z.string().min(1).max(8192);
const token_hash = z.string().min(32).max(512).regex(/^[a-zA-Z0-9_-]+$/);
export const passwordRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("signin"), email, password: z.string().min(1).max(128), captchaToken }).strict(),
  z.object({ action: z.literal("signup"), email, password, captchaToken }).strict(),
  z.object({ action: z.literal("forgot"), email, captchaToken }).strict(),
  z.object({ action: z.literal("resend"), email, captchaToken }).strict(),
  z.object({ action: z.literal("confirm"), token_hash }).strict(),
  z.object({ action: z.literal("reset"), token_hash, password }).strict(),
]);

export function trustedAuthOrigin(request: Request, configured = process.env.AUTH_SITE_URL) {
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(process.env.NODE_ENV === "development" &&
      url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    return request.headers.get("origin") === url.origin && new URL(request.url).origin === url.origin
      ? url.origin : null;
  } catch { return null; }
}
