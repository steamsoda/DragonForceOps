import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { passwordRequest } from "./password-policy";

const generic = "Si la solicitud corresponde a una cuenta disponible, recibiras un correo. Revisa tambien correo no deseado.";

// This client must be isolated from the caller's session. Recovery proves identity
// with an emailed token, never with an existing browser session or metadata.
// Supabase shares recovery and magic-link tokens; `type` is not a purpose boundary.
export async function runPasswordOperation(
  auth: SupabaseClient["auth"], input: z.infer<typeof passwordRequest>, origin: string,
) {
  switch (input.action) {
    case "signin": {
      const { data, error } = await auth.signInWithPassword({
        email: input.email, password: input.password, options: { captchaToken: input.captchaToken },
      });
      if (error || !data.user?.email_confirmed_at) {
        return { status: 400, message: "No se pudo iniciar sesion. Revisa tus datos y confirma tu correo.", session: false };
      }
      return { status: 200, message: "Sesion iniciada.", session: true, next: "/inicio" };
    }
    case "signup": {
      const { error } = await auth.signUp({ email: input.email, password: input.password,
        options: { captchaToken: input.captchaToken, emailRedirectTo: `${origin}/auth/confirm` } });
      // Do not expose account existence or issue a session on signup, even if the
      // provider is accidentally configured to auto-confirm new accounts.
      if (error?.status === 429) return { status: 429, message: "Espera unos minutos antes de intentar de nuevo.", session: false };
      return { status: 200, message: generic, session: false };
    }
    case "forgot": {
      await auth.resetPasswordForEmail(input.email, {
        redirectTo: `${origin}/auth/reset-password`, captchaToken: input.captchaToken,
      });
      return { status: 200, message: generic, session: false };
    }
    case "resend": {
      await auth.resend({ type: "signup", email: input.email,
        options: { emailRedirectTo: `${origin}/auth/confirm`, captchaToken: input.captchaToken } });
      return { status: 200, message: generic, session: false };
    }
    case "confirm": {
      const { error } = await auth.verifyOtp({ token_hash: input.token_hash, type: "signup" });
      return error
        ? { status: 400, message: "El enlace no es valido o ya vencio. Solicita otro correo de confirmacion.", session: false }
        : { status: 200, message: "Correo confirmado.", session: true, next: "/inicio" };
    }
    case "reset": {
      const { error } = await auth.verifyOtp({ token_hash: input.token_hash, type: "recovery" });
      if (error) return { status: 400, message: "El enlace no es valido o ya vencio. Solicita otro enlace.", session: false };
      const updated = await auth.updateUser({ password: input.password });
      const signedOut = await auth.signOut({ scope: "global" });
      if (updated.error) return { status: 400, message: "No se pudo cambiar la contrasena. Solicita un nuevo enlace e intenta con otra contrasena.", session: false };
      if (signedOut.error) return { status: 503, message: "Contrasena actualizada, pero no se pudieron cerrar las otras sesiones. Contacta al administrador.", session: false };
      return { status: 200, message: "Contrasena actualizada. Vuelve a iniciar sesion.", session: false };
    }
  }
}
