import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_ROLES, DIRECTOR_OR_ABOVE } from "@/lib/auth/roles";
import { getDebugRecentUserIds, getDebugViewContext } from "@/lib/auth/debug-view";
import { listDebuggableUsers } from "@/lib/auth/debug-users";
import { version } from "../../../package.json";
import { AppSidebar, type NavSection } from "@/components/ui/app-sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PrinterTestButton } from "@/components/ui/printer-test-button";
import { getPrinterName } from "@/lib/queries/settings";
import { summarizeRoleScopes } from "@/lib/auth/role-display";
import { clearDebugViewAction, setDebugViewUserAction } from "@/server/actions/debug-view";

const STAFF_SECTION: NavSection = {
  label: "Diario",
  items: [
    { href: "/caja", label: "Caja" },
    { href: "/players", label: "Jugadores" },
  ],
};

const GESTION_SECTION: NavSection = {
  label: "Gestion",
  items: [
    { href: "/dashboard", label: "Panel" },
    { href: "/pending", label: "Pendientes" },
  ],
};

const FRONT_DESK_REPORTES_SECTION: NavSection = {
  label: "Reportes",
  items: [
    { href: "/reports/corte-diario", label: "Corte Diario" },
    { href: "/receipts", label: "Recibos" },
  ],
};

const DIRECTOR_REPORTES_SECTION: NavSection = {
  label: "Reportes",
  items: [
    { href: "/reports/corte-diario", label: "Corte Diario" },
    { href: "/reports/corte-semanal", label: "Corte Semanal" },
    { href: "/reports/resumen-mensual", label: "Res. Mensual" },
    { href: "/reports/porto-mensual", label: "Reporte Porto" },
    { href: "/receipts", label: "Recibos" },
  ],
};

const ADMIN_SECTION: NavSection = {
  label: "Admin",
  items: [
    { href: "/admin/mensualidades", label: "Mensualidades" },
    { href: "/admin/cargos-equipo", label: "Cargo Equipo" },
    { href: "/products", label: "Productos" },
    { href: "/pending/bajas", label: "Bajas & Saldos Pendientes" },
    { href: "/admin/merge-players", label: "Fusionar Jugadores" },
    { href: "/activity", label: "Actividad" },
    { href: "/admin/configuracion", label: "Configuracion" },
  ],
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const debugContext = await getDebugViewContext();
  if (!debugContext) redirect("/login");

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    redirect("/login?error=supabase_config");
  }

  const actorRoleSummary = summarizeRoleScopes(debugContext.actor.roleScopes).join(" | ");
  const effectiveRoleSummary = summarizeRoleScopes(debugContext.effective.roleScopes).join(" | ");
  const roleCodes = debugContext.effective.roleCodes;
  const isSuperAdmin = roleCodes.includes(APP_ROLES.SUPERADMIN);
  const isDirectorOrAbove = DIRECTOR_OR_ABOVE.some((roleCode) => roleCodes.includes(roleCode));
  const isFrontDesk = roleCodes.includes(APP_ROLES.FRONT_DESK);
  const canAccess = isDirectorOrAbove || isFrontDesk;

  if (!canAccess) redirect("/unauthorized");

  const superAdminItems: NavSection["items"] = [
    { href: "/admin/users", label: "Usuarios y Permisos" },
    { href: "/admin/actividad", label: "Auditoria" },
    ...(debugContext.canManage ? [{ href: "/admin/debug-view", label: "Debug permisos" }] : []),
  ];

  const sections: NavSection[] = [
    STAFF_SECTION,
    GESTION_SECTION,
    ...(isDirectorOrAbove ? [DIRECTOR_REPORTES_SECTION, ADMIN_SECTION] : [FRONT_DESK_REPORTES_SECTION]),
    ...(isSuperAdmin ? [{ label: "Super Admin", items: superAdminItems }] : []),
  ];

  const [printerName, debugUsers, recentDebugUserIds] = await Promise.all([
    getPrinterName(),
    debugContext.canManage ? listDebuggableUsers(supabase) : Promise.resolve([]),
    debugContext.canManage ? getDebugRecentUserIds() : Promise.resolve([]),
  ]);

  const recentDebugUsers = recentDebugUserIds
    .map((userId) => debugUsers.find((candidate) => candidate.id === userId))
    .filter((candidate): candidate is (typeof debugUsers)[number] => Boolean(candidate));

  async function signOut() {
    "use server";
    const serverClient = await createClient();
    await serverClient.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-baseline gap-2">
          <p className="font-[family-name:var(--font-aoboshi)] text-xl tracking-wide text-portoDark dark:text-portoBlue">INVICTA</p>
          <span className="text-xs text-slate-400 dark:text-slate-500">v{version}</span>
          {debugContext.isReadOnly ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              Solo lectura
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          <div className="max-w-[340px] text-right">
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {debugContext.actor.email}
              {debugContext.isReadOnly ? " · actor" : null}
            </p>
            <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
              {debugContext.isReadOnly ? actorRoleSummary : effectiveRoleSummary}
            </p>
            {debugContext.isReadOnly ? (
              <p className="truncate text-[11px] font-medium text-amber-600 dark:text-amber-400">
                Vista: {debugContext.effective.email ?? debugContext.activeView?.userId}
              </p>
            ) : null}
          </div>

          {debugContext.canManage ? (
            <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 dark:border-amber-800 dark:bg-amber-950/40">
              <form action={setDebugViewUserAction} className="flex items-center gap-2">
                <select
                  name="target_user_id"
                  defaultValue={debugContext.activeView?.userId ?? ""}
                  className="w-52 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-slate-700 dark:border-amber-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">Selecciona usuario...</option>
                  {debugUsers.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.source === "persona" ? "[Debug] " : ""}
                      {candidate.email} | {candidate.roleSummary}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded bg-amber-500 px-2 py-1 text-xs font-medium text-white hover:bg-amber-600"
                >
                  Ver como
                </button>
              </form>

              <Link
                href="/admin/debug-view"
                className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
              >
                Panel
              </Link>

              {recentDebugUsers.length > 0 ? (
                <div className="flex items-center gap-1">
                  {recentDebugUsers.slice(0, 3).map((candidate) => (
                    <form key={candidate.id} action={setDebugViewUserAction}>
                      <input type="hidden" name="target_user_id" value={candidate.id} />
                      <button
                        type="submit"
                        title={`Ver como ${candidate.email}`}
                        className="rounded-full border border-amber-300 px-2 py-1 text-[10px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                      >
                        {candidate.source === "persona" ? `Debug: ${candidate.email.split("@")[0]}` : candidate.email.split("@")[0]}
                      </button>
                    </form>
                  ))}
                </div>
              ) : null}

              {debugContext.isReadOnly ? (
                <form action={clearDebugViewAction}>
                  <button
                    type="submit"
                    className="rounded border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  >
                    Reset
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          <ThemeToggle />
          <PrinterTestButton printerName={printerName} />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cerrar sesion
            </button>
          </form>
        </div>
      </header>

      <AppSidebar sections={sections} />

      <div className="ml-48 pt-14">
        {debugContext.isReadOnly ? (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Viendo como: {debugContext.effective.email ?? debugContext.activeView?.userId}
                  </p>
                  <span className="rounded-full border border-amber-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:border-amber-700 dark:text-amber-300">
                    Solo lectura
                  </span>
                </div>
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  {effectiveRoleSummary} · Modo solo lectura en preview
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href="/caja" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Caja</Link>
                <Link href="/players" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Jugadores</Link>
                <Link href="/pending" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Pendientes</Link>
                <Link href="/reports/corte-diario" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Corte Diario</Link>
                <Link href="/receipts" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Recibos</Link>
                <Link href="/admin/debug-view" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Panel debug</Link>
                <form action={clearDebugViewAction}>
                  <button type="submit" className="rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-white hover:bg-amber-600">
                    Salir de vista
                  </button>
                </form>
              </div>
            </div>
          </div>
        ) : null}

        {children}
      </div>
    </div>
  );
}
