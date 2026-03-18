import { createSign } from "crypto";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  // Only allow authenticated users
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const privateKey = process.env.QZ_PRIVATE_KEY;
  if (!privateKey) {
    return new Response("QZ_PRIVATE_KEY not configured", { status: 500 });
  }

  const { message } = await req.json();
  if (typeof message !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  const sign = createSign("SHA512");
  sign.update(message);
  sign.end();
  const signature = sign.sign(privateKey, "base64");

  return new Response(signature, { headers: { "Content-Type": "text/plain" } });
}
