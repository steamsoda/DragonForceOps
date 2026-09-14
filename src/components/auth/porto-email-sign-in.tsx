"use client";

import { FormEvent, useState } from "react";

export function PortoEmailSignIn() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as { message?: string };
      setMessage(
        payload.message ??
          "Si el correo esta autorizado, recibiras un enlace de acceso en unos minutos."
      );
    } catch {
      setMessage("No se pudo solicitar el enlace. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-slate-200 pt-5 dark:border-slate-700">
      <div>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          Prueba de acceso por correo
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Disponible solo en Preview para correos autorizados.
        </p>
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
          Correo electronico
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
            placeholder="nombre@empresa.com"
            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-portoBlue focus:ring-2 focus:ring-portoBlue/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center rounded-md border border-portoBlue px-4 text-sm font-medium text-portoBlue hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-slate-800"
        >
          {loading ? "Solicitando enlace..." : "Enviar enlace de acceso"}
        </button>
      </form>

      {message ? (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}
