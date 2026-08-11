import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { getDebugViewContext } from "@/lib/auth/debug-view";

export default async function UnauthorizedPage() {
  const debugContext = await getDebugViewContext();
  const canExitDebugView = Boolean(debugContext?.canManage && debugContext.activeView);

  return (
    <PageShell title="Sin autorizacion" subtitle="Tu cuenta esta autenticada pero no tiene un rol asignado">
      <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
        <p>Pide a un administrador que asigne tu rol en `public.user_roles`.</p>
        <div className="flex flex-wrap gap-2">
          {canExitDebugView ? (
            <Link
              href="/api/debug/reset?next=/dashboard"
              className="inline-flex rounded-md bg-blue-700 px-3 py-2 font-medium text-white hover:bg-blue-800"
            >
              Salir de Ver como
            </Link>
          ) : null}
          <Link href="/login" className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
            Volver a iniciar sesion
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
