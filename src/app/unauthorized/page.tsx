import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { getDebugViewContext } from "@/lib/auth/debug-view";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function UnauthorizedPage() {
  const debugContext = await getDebugViewContext();
  const canExitDebugView = Boolean(debugContext?.canManage && debugContext.activeView);
  async function signOut() {
    "use server";
    const client = await createClient();
    await client.auth.signOut({ scope: "local" });
    redirect("/");
  }

  return (
    <PageShell title="Sin autorizacion" subtitle="Tu cuenta esta autenticada pero no tiene un rol asignado">
      <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
        <p>Tu cuenta no tiene acceso autorizado. Contacta a un administrador de INVICTA para revisar tu acceso.</p>
        <div className="flex flex-wrap gap-2">
          {canExitDebugView ? (
            <Link
              href="/api/debug/reset?next=/dashboard"
              className="inline-flex rounded-md bg-blue-700 px-3 py-2 font-medium text-white hover:bg-blue-800"
            >
              Salir de Ver como
            </Link>
          ) : null}
          <form action={signOut}><button className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">Cerrar sesion</button></form>
        </div>
      </div>
    </PageShell>
  );
}
