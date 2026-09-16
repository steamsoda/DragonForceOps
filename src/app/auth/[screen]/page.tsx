import { notFound } from "next/navigation";
import { PasswordForm, type PasswordScreen } from "@/components/auth/password-form";
import { authCaptchaConfig, passwordAuthEnabled, passwordAuthReady } from "@/lib/auth/password-policy";

const screens: Record<string, { mode: PasswordScreen; title: string }> = {
  "create-account": { mode: "signup", title: "Crear cuenta" },
  "forgot-password": { mode: "forgot", title: "Recuperar contrasena" },
  "resend-confirmation": { mode: "resend", title: "Confirmar mi correo" },
  confirm: { mode: "confirm", title: "Confirmar correo" },
  "reset-password": { mode: "reset", title: "Nueva contrasena" },
};
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function PasswordPage({ params, searchParams }: {
  params: Promise<{ screen: string }>; searchParams: Promise<{ token_hash?: string }>;
}) {
  if (!passwordAuthEnabled()) notFound();
  const { screen } = await params;
  if (!Object.hasOwn(screens, screen)) notFound();
  const selected = screens[screen];
  const { token_hash } = await searchParams;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="w-full max-w-sm space-y-6">
      <div className="bg-blue-950 px-6 py-5"><img src="/invicta-wordmark-white.png" alt="INVICTA" width={320} height={49} className="h-auto w-full" /></div>
      <h1 className="text-xl font-semibold">{selected.title}</h1>
      <PasswordForm mode={selected.mode} ready={passwordAuthReady()} {...authCaptchaConfig()}
        token={typeof token_hash === "string" ? token_hash : ""} />
    </div>
  </main>;
}
