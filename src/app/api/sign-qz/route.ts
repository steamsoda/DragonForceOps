import { createSign } from "crypto";
import { getPermissionContext } from "@/lib/auth/permissions";
import { createCheckoutTrace } from "@/lib/perf/checkout-timing";


export async function POST(req: Request) {
  const trace = createCheckoutTrace(req.headers.get("x-checkout-trace"));
  // Authentication alone is not authority to sign printer commands.
  try {
    const context = await trace.run("authorization", () => getPermissionContext());
    if (!context) return new Response("Unauthorized", { status: 401 });
    if (!context.hasOperationalAccess) return new Response("Forbidden", { status: 403 });
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const rawKey = process.env.QZ_PRIVATE_KEY;
  if (!rawKey) {
    return new Response("Printer signing unavailable", { status: 500 });
  }

  // Restore newlines and PEM headers if stripped by Vercel
  let privateKey = rawKey.replace(/\\n/g, "\n").trim();
  if (!privateKey.includes("-----BEGIN")) {
    // Headers were stripped — wrap as PKCS#8 (QZ Tray demo key format)
    privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----`;
  }

  let message: unknown;
  try { ({ message } = await req.json()); } catch { return new Response("Bad request", { status: 400 }); }
  if (typeof message !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  let signature: string;
  try {
    signature = await trace.run("sign", async () => {
      const sign = createSign("SHA512");
      sign.update(message as string);
      sign.end();
      return sign.sign(privateKey, "base64");
    });
  } catch {
    return new Response("Printer signing unavailable", { status: 500 });
  }

  return new Response(signature, { headers: { "Content-Type": "text/plain" } });
}
