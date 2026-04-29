import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_ROLES, ATTENDANCE_STAFF_OR_ABOVE, DIRECTOR_OR_ABOVE, NUTRITION_STAFF_OR_ABOVE, SPORTS_STAFF_OR_ABOVE } from "@/lib/auth/roles";
import { getDebugRecentUserIds, getDebugViewContext } from "@/lib/auth/debug-view";
import { listDebuggableUsers } from "@/lib/auth/debug-users";
import { version } from "../../../package.json";
import { AppSidebar, type NavSection } from "@/components/ui/app-sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PrinterTestButton } from "@/components/ui/printer-test-button";
import { getPrinterName } from "@/lib/queries/settings";
import { summarizeRoleScopes } from "@/lib/auth/role-display";
import { clearDebugViewAction, setDebugViewUserAction } from "@/server/actions/debug-view";

const DIRECTOR_GESTION_SECTION: NavSection = {
  label: "Gestion",
  items: [
    { href: "/dashboard", label: "Panel" },
    { href: "/new-enrollments", label: "Nuevas Inscripciones" },
    { href: "/pending", label: "Pendientes" },
    { href: "/llamadas", label: "Llamadas" },
  ],
};

const FRONT_DESK_GESTION_SECTION: NavSection = {
  label: "Gestion",
  items: [
    { href: "/new-enrollments", label: "Nuevas Inscripciones" },
    { href: "/pending", label: "Pendientes" },
    { href: "/llamadas", label: "Llamadas" },
  ],
};

const COMPETITION_BASE_SECTION: NavSection = {
  label: "Competencias",
  items: [{ href: "/sports-signups", label: "Inscripciones Torneos" }],
};

const NUTRITION_BASE_SECTION: NavSection = {
  label: "Nutricion",
  items: [
    { href: "/nutrition", label: "Panel" },
    { href: "/nutrition/measurements", label: "Toma de medidas" },
  ],
};

const ATTENDANCE_BASE_SECTION: NavSection = {
  label: "Asistencia",
  items: [
    { href: "/attendance", label: "Hoy" },
    { href: "/attendance/groups", label: "Grupos" },
    { href: "/attendance/schedules", label: "Horarios" },
    { href: "/attendance/reports", label: "Reportes" },
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
  const hasSportsAccess = SPORTS_STAFF_OR_ABOVE.some((roleCode) => roleCodes.includes(roleCode));
  const hasNutritionAccess = NUTRITION_STAFF_OR_ABOVE.some((roleCode) => roleCodes.includes(roleCode));
  const hasAttendanceWriteAccess = ATTENDANCE_STAFF_OR_ABOVE.some((roleCode) => roleCodes.includes(roleCode));
  const hasAttendanceReadAccess = hasAttendanceWriteAccess || roleCodes.includes(APP_ROLES.FRONT_DESK);
  const canManageAttendanceSetup = isDirectorOrAbove || hasSportsAccess;
  const isFrontDesk = roleCodes.includes(APP_ROLES.FRONT_DESK);
  const canAccess = isDirectorOrAbove || isFrontDesk || hasSportsAccess || hasNutritionAccess || hasAttendanceWriteAccess;

  if (!canAccess) redirect("/unauthorized");

  const superAdminItems: NavSection["items"] = [
    { href: "/admin/users", label: "Usuarios y Permisos" },
    { href: "/admin/actividad", label: "Auditoria" },
    { href: "/admin/access-audit", label: "Auditoria accesos" },
    { href: "/admin/finance-sanity", label: "Sanidad financiera" },
    { href: "/attendance/settings", label: "Configuracion Grupos" },
    { href: "/admin/regularizacion-historica", label: "Regularización histórica" },
    ...(debugContext.canManage ? [{ href: "/admin/debug-view", label: "Debug permisos" }] : []),
  ];

  const staffSection: NavSection = {
    label: "Diario",
    items: [
      { href: "/caja", label: "Caja" },
      { href: "/players", label: "Jugadores" },
      { href: "/uniforms", label: "Uniformes" },
    ],
  };

  const competitionSection: NavSection = {
    ...COMPETITION_BASE_SECTION,
    items: [
      ...COMPETITION_BASE_SECTION.items,
      ...(hasSportsAccess && !isDirectorOrAbove && !isFrontDesk
        ? [{ href: "/new-enrollments", label: "Nuevas Inscripciones" }]
        : []),
    ],
  };

  const nutritionSection: NavSection = {
    ...NUTRITION_BASE_SECTION,
    items: [
      ...NUTRITION_BASE_SECTION.items,
      ...(hasNutritionAccess && !isDirectorOrAbove
        ? [{ href: "/new-enrollments", label: "Nuevas Inscripciones" }]
        : []),
    ],
  };

  const attendanceSection: NavSection = {
    ...ATTENDANCE_BASE_SECTION,
    items: canManageAttendanceSetup
      ? ATTENDANCE_BASE_SECTION.items
      : hasAttendanceWriteAccess
        ? ATTENDANCE_BASE_SECTION.items.filter((item) => item.href === "/attendance" || item.href === "/attendance/groups" || item.href === "/attendance/reports")
        : ATTENDANCE_BASE_SECTION.items.filter((item) => item.href === "/attendance/groups" || item.href === "/attendance/reports"),
  };

  const sections: NavSection[] = [
    ...(isDirectorOrAbove || isFrontDesk ? [staffSection] : []),
    ...(isDirectorOrAbove ? [DIRECTOR_GESTION_SECTION] : isFrontDesk ? [FRONT_DESK_GESTION_SECTION] : []),
    ...(isDirectorOrAbove || isFrontDesk || hasSportsAccess ? [competitionSection] : []),
    ...(hasNutritionAccess ? [nutritionSection] : []),
    ...(hasAttendanceReadAccess ? [attendanceSection] : []),
    ...(isDirectorOrAbove ? [DIRECTOR_REPORTES_SECTION, ADMIN_SECTION] : isFrontDesk ? [FRONT_DESK_REPORTES_SECTION] : []),
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

  const mobileNavLinkClass =
    "block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";
  const mobileSectionLabelClass =
    "px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500";

  return (
    <div className="min-h-screen print:min-h-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 md:fixed md:left-0 md:right-0 print:hidden">
        <div className="px-4 py-3 md:flex md:h-14 md:items-center md:justify-between md:px-5 md:py-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <details className="relative md:hidden">
                <summary className="list-none rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                  Menu
                </summary>
                <div className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <nav className="space-y-4">
                    {sections.map((section) => (
                      <div key={section.label} className="space-y-1">
                        <p className={mobileSectionLabelClass}>{section.label}</p>
                        <div className="space-y-1">
                          {section.items.map((item) => (
                            <Link key={item.href} href={item.href} className={mobileNavLinkClass}>
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </nav>
                </div>
              </details>

              <div className="flex items-baseline gap-2">
                <p className="font-[family-name:var(--font-aoboshi)] text-xl tracking-wide text-portoDark dark:text-portoBlue">INVICTA</p>
                <span className="text-xs text-slate-400 dark:text-slate-500">v{version}</span>
                {debugContext.isReadOnly ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                    Solo lectura
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 md:hidden">
              <ThemeToggle />
              <div className="hidden sm:block">
                <PrinterTestButton printerName={printerName} />
              </div>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>

          <div className="mt-3 space-y-3 md:hidden">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {debugContext.actor.email}
                {debugContext.isReadOnly ? " | actor" : ""}
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
              <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
                  Herramientas de debug
                </summary>
                <div className="mt-3 space-y-3">
                  <form action={setDebugViewUserAction} className="space-y-2">
                    <select
                      name="target_user_id"
                      defaultValue={debugContext.activeView?.userId ?? ""}
                      className="w-full rounded border border-amber-300 bg-white px-2 py-2 text-xs text-slate-700 dark:border-amber-700 dark:bg-slate-900 dark:text-slate-200"
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
                      className="rounded bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                    >
                      Ver como
                    </button>
                  </form>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/admin/debug-view"
                      className="rounded border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                    >
                      Panel
                    </Link>
                    {debugContext.isReadOnly ? (
                      <form action={clearDebugViewAction}>
                        <button
                          type="submit"
                          className="rounded border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                        >
                          Reset
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {recentDebugUsers.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
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
                </div>
              </details>
            ) : null}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <div className="max-w-[340px] text-right">
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {debugContext.actor.email}
                {debugContext.isReadOnly ? " | actor" : ""}
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
        </div>
      </header>

      <div className="hidden print:hidden md:block">
        <AppSidebar sections={sections} />
      </div>

      <div className="md:ml-48 md:pt-14 print:ml-0 print:pt-0">
        {debugContext.isReadOnly ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30 sm:px-6 print:hidden">
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
                  {effectiveRoleSummary} | Modo solo lectura en preview
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link href="/caja" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Caja</Link>
                <Link href="/players" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Jugadores</Link>
                <Link href="/new-enrollments" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Nuevas</Link>
                <Link href="/pending" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Pendientes</Link>
                <Link href="/llamadas" className="rounded-md border border-amber-300 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40">Llamadas</Link>
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
