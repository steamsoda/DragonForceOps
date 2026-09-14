import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { passwordAuthEnabled, passwordAuthReady, passwordRequest, trustedAuthOrigin } from "@/lib/auth/password-policy";
import { runPasswordOperation } from "@/lib/auth/password-operations";

export async function POST(request: Request) {
  const reply = (message: string, status: number) => NextResponse.json({ message }, {
    status, headers: { "Cache-Control": "no-store" },
  });
  if (!passwordAuthEnabled()) return reply("No disponible.", 404);
  const origin = trustedAuthOrigin(request);
  if (!origin) return reply("Solicitud no permitida.", 403);
  if (!passwordAuthReady()) return reply("El acceso por correo aun no esta disponible. Intenta mas tarde.", 503);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply("Solicitud invalida.", 415);
  // Bound the actual stream, not only the caller-controlled Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return reply("Solicitud invalida.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); return reply("Solicitud demasiado grande.", 413); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return reply("Solicitud invalida.", 400); }
  const parsed = passwordRequest.safeParse(body);
  if (!parsed.success) return reply("Revisa los campos. Usa entre 8 y 72 caracteres para una contrasena nueva.", 400);
  try {
    const { url, publicKey } = getSupabaseEnv();
    const pending: { name: string; value: string; options?: CookieOptions }[] = [];
    const client = createServerClient(url, publicKey, {
      cookies: { getAll: () => [], setAll: (values: typeof pending) => { pending.push(...values); } },
    });
    const result = await runPasswordOperation(client.auth, parsed.data, origin);
    const response = NextResponse.json({ message: result.message, next: result.next }, {
      status: result.status, headers: { "Cache-Control": "no-store" },
    });
    if (result.session) for (const cookie of pending) response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch {
    // Never log credentials, recovery tokens, request bodies, or provider objects.
    return reply("No se pudo completar la solicitud. Intenta de nuevo.", 503);
  }
}
