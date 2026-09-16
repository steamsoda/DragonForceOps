"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

export type PasswordScreen = "signin" | "signup" | "forgot" | "resend" | "confirm" | "reset";
type Captcha = { render: (element: HTMLElement, options: Record<string, unknown>) => string; reset: (id: string) => void; remove: (id: string) => void };
declare global { interface Window { hcaptcha?: Captcha; turnstile?: Captcha } }

export function PasswordForm({ mode, ready, siteKey, provider = "hcaptcha", token = "" }: {
  mode: PasswordScreen; ready: boolean; siteKey: string; provider?: "hcaptcha" | "turnstile"; token?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [visible, setVisible] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const isToken = mode === "confirm" || mode === "reset";
  const hasPassword = ["signin", "signup", "reset"].includes(mode);
  const newPassword = mode === "signup" || mode === "reset";
  useEffect(() => {
    const api = window[provider];
    if (!ready || isToken || !scriptReady || !container.current || !api) return;
    let active = true;
    const clearToken = () => { if (active) setCaptchaToken(""); };
    setCaptchaToken("");
    widget.current = api.render(container.current, {
      sitekey: siteKey, size: "compact", callback: (value: string) => { if (active) { setCaptchaToken(value); setCaptchaError(false); } },
      "expired-callback": clearToken, "timeout-callback": clearToken,
      "error-callback": () => { if (active) { setCaptchaToken(""); setCaptchaError(true); } },
      ...(provider === "turnstile" ? { "response-field": false, language: "es" } : {}),
    });
    return () => { active = false; if (widget.current !== undefined) api.remove(widget.current); widget.current = undefined; };
  }, [ready, isToken, scriptReady, siteKey, provider, mode]);
  useEffect(() => {
    if (isToken) window.history.replaceState(null, "", window.location.pathname);
  }, [isToken]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready || (isToken ? !token || success : !captchaToken)) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (newPassword && data.get("password") !== data.get("confirmation")) { setMismatch(true); return; }
    setMismatch(false); setBusy(true); setMessage(""); setSuccess(false);
    try {
      const body = { action: mode, ...(isToken ? { token_hash: token } : { email: data.get("email"), captchaToken }),
        ...(hasPassword ? { password: data.get("password") } : {}) };
      const response = await fetch("/api/auth/password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      setMessage(result.message || "No se pudo completar la solicitud."); setSuccess(response.ok);
      if (response.ok) {
        form.reset();
        if (result.next === "/inicio") window.location.assign("/inicio");
      }
    } catch { setMessage("No se pudo conectar. Tus datos siguen en el formulario; intenta de nuevo."); }
    finally {
      setBusy(false); setCaptchaToken("");
      if (widget.current !== undefined) window[provider]?.reset(widget.current);
    }
  }

  const inputClass = "w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white";
  return <form onSubmit={submit} className="space-y-4">
    {!isToken && <label className="block text-sm">Correo electronico
      <input className={`${inputClass} mt-1`} name="email" type="email" autoComplete="username" required maxLength={254} disabled={busy} />
    </label>}
    {hasPassword && <div>
      <label htmlFor="auth-password" className="block text-sm">Contrasena{newPassword ? " (8 a 72 caracteres)" : ""}</label>
      <div className="relative mt-1">
        <input id="auth-password" className={`${inputClass} pr-12`} name="password" type={visible ? "text" : "password"}
          autoComplete={newPassword ? "new-password" : "current-password"} required minLength={newPassword ? 8 : 1} maxLength={newPassword ? 72 : 128} disabled={busy} />
        <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar contrasena" : "Mostrar contrasena"}
          title={visible ? "Ocultar contrasena" : "Mostrar contrasena"} className="absolute right-0 top-0 flex h-full w-11 items-center justify-center">
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>}
    {newPassword && <label className="block text-sm">Confirmar contrasena
      <input className={`${inputClass} mt-1 ${mismatch ? "border-red-600" : ""}`} name="confirmation" type={visible ? "text" : "password"}
        autoComplete="new-password" required minLength={8} maxLength={72} disabled={busy} aria-invalid={mismatch} aria-describedby={mismatch ? "password-mismatch" : undefined}
        onChange={() => setMismatch(false)} />
      {mismatch && <span id="password-mismatch" className="text-red-700">Las contrasenas no coinciden.</span>}
    </label>}
    {mode === "signup" && <p className="text-sm text-slate-500">Confirma tu correo para continuar. El acceso requiere autorizacion de INVICTA.</p>}
    {mode === "confirm" && <p className="text-sm">Confirma tu correo para continuar con tu cuenta.</p>}
    {ready && !isToken && <>
      <Script src={provider === "turnstile" ? "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" : "https://js.hcaptcha.com/1/api.js?render=explicit"}
        onReady={() => setScriptReady(true)} onError={() => { setCaptchaToken(""); setCaptchaError(true); }} />
      <div ref={container} className={provider === "turnstile" ? "min-h-[150px] w-[150px]" : "min-h-[144px] w-[164px]"} />
      {captchaError && <p role="alert" className="text-sm text-red-700">No se pudo cargar la verificacion. Revisa tu conexion y recarga la pagina.</p>}
    </>}
    {!ready && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">El acceso por correo aun no esta disponible. Intenta mas tarde.</p>}
    {isToken && !token && <p role="alert" className="text-sm text-red-700">Falta el enlace de verificacion. Solicita uno nuevo.</p>}
    {message && <p role={success ? "status" : "alert"} className={`text-sm ${success ? "text-emerald-700" : "text-red-700"}`}>{message}</p>}
    <button disabled={busy || !ready || (isToken ? !token || success : !captchaToken)} type="submit"
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2.5 font-medium text-white hover:bg-blue-800 disabled:opacity-50">
      {busy && <LoaderCircle size={18} className="animate-spin" />}
      {{ signin: "Iniciar sesion", signup: "Crear cuenta", forgot: "Enviar enlace", resend: "Reenviar confirmacion", confirm: "Confirmar correo", reset: "Guardar contrasena" }[mode]}
    </button>
    <div className="flex flex-wrap justify-between gap-3 text-sm text-blue-700 dark:text-blue-300">
      {mode === "signin" ? <><Link href="/auth/create-account">Crear cuenta</Link><Link href="/auth/forgot-password">Olvide mi contrasena</Link></> : <Link href="/">Volver al inicio</Link>}
      {["signin", "signup", "confirm"].includes(mode) && <Link href="/auth/resend-confirmation">Reenviar confirmacion</Link>}
      {mode === "reset" && <Link href="/auth/forgot-password">Solicitar otro enlace</Link>}
    </div>
  </form>;
}
