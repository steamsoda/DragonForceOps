import { createSign } from "crypto";
import { createClient } from "@/lib/supabase/server";

// GET — diagnostic only, remove after debugging
export async function GET() {
  const rawKey = process.env.QZ_PRIVATE_KEY ?? "";
  const normalized = rawKey.replace(/\\n/g, "\n");
  const hasCert = !!process.env.NEXT_PUBLIC_QZ_CERTIFICATE;
  const keyPreview = normalized.slice(0, 40) + "...";
  const hasNewlines = normalized.includes("\n");

  try {
    const sign = createSign("SHA512");
    sign.update("test");
    sign.end();
    const sig = sign.sign(normalized, "base64");
    return new Response(
      JSON.stringify({ ok: true, sigLength: sig.length, hasCert, hasNewlines, keyPreview }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err), hasCert, hasNewlines, keyPreview }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function POST(req: Request) {
  // Only allow authenticated users
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawKey = process.env.QZ_PRIVATE_KEY;
  if (!rawKey) {
    return new Response("QZ_PRIVATE_KEY not configured", { status: 500 });
  }

  // Vercel sometimes collapses newlines — restore proper PEM line breaks
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const { message } = await req.json();
  if (typeof message !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  let signature: string;
  try {
    const sign = createSign("SHA512");
    sign.update(message);
    sign.end();
    signature = sign.sign(privateKey, "base64");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Sign error: ${msg}`, { status: 500 });
  }

  return new Response(signature, { headers: { "Content-Type": "text/plain" } });
}
