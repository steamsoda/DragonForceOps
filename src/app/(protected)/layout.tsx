import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_ROLES, DIRECTOR_OR_ABOVE } from "@/lib/auth/roles";
import { version } from "../../../package.json";
import { AppSidebar, type NavSection } from "@/components/ui/app-sidebar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { PrinterTestButton } from "@/components/ui/printer-test-button";
import { getPrinterName } from "@/lib/queries/settings";

const STAFF_SECTION: NavSection = {
  label: "Diario",
  items: [
    { href: "/caja", label: "Caja" },
    { href: "/players", label: "Jugadores" },
  ]
};

const GESTION_SECTION: NavSection = {
  label: "Gestión",
  items: [
    { href: "/dashboard", label: "Panel" },
    { href: "/pending", label: "Pendientes" }
  ]
};

const FRONT_DESK_REPORTES_SECTION: NavSection = {
  label: "Reportes",
  items: [
    { href: "/reports/corte-diario", label: "Corte Diario" },
    { href: "/receipts", label: "Recibos" }
  ]
};

const DIRECTOR_REPORTES_SECTION: NavSection = {
  label: "Reportes",
  items: [
    { href: "/reports/corte-diario", label: "Corte Diario" },
    { href: "/reports/corte-semanal", label: "Corte Semanal" },
    { href: "/reports/resumen-mensual", label: "Res. Mensual" },
    { href: "/reports/porto-mensual", label: "Reporte Porto" },
    { href: "/receipts", label: "Recibos" }
  ]
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
    { href: "/admin/configuracion", label: "Configuración" }
  ]
};

type RoleRow = {
  app_roles: {
    code: string;
  } | null;
};

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    redirect("/login?error=supabase_config");
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("app_roles(code)")
    .eq("user_id", user.id)
    .returns<RoleRow[]>();

  if (rolesError) {
    redirect("/unauthorized");
  }

  const roleCodes = (roleRows ?? []).map((row) => row.app_roles?.code).filter(Boolean);
  const isSuperAdmin = roleCodes.includes(APP_ROLES.SUPERADMIN);
  const isDirectorOrAbove = DIRECTOR_OR_ABOVE.some((r) => roleCodes.includes(r));
  const isFrontDesk = roleCodes.includes(APP_ROLES.FRONT_DESK);
  const canAccess = isDirectorOrAbove || isFrontDesk;

  if (!canAccess) {
    redirect("/unauthorized");
  }

  const superAdminSection: NavSection = {
    label: "Super Admin",
    items: [
      { href: "/admin/users", label: "Usuarios y Permisos" },
      { href: "/admin/actividad", label: "Auditoría" }
    ]
  };

  const sections: NavSection[] = [
    STAFF_SECTION,
    GESTION_SECTION,
    ...(isDirectorOrAbove ? [DIRECTOR_REPORTES_SECTION, ADMIN_SECTION] : [FRONT_DESK_REPORTES_SECTION]),
    ...(isSuperAdmin ? [superAdminSection] : [])
  ];

  const printerName = await getPrinterName();

  async function signOut() {
    "use server";
    const serverClient = await createClient();
    await serverClient.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-baseline gap-2">
          <p className="font-[family-name:var(--font-aoboshi)] text-xl tracking-wide text-portoDark dark:text-portoBlue">INVICTA</p>
          <span className="text-xs text-slate-400 dark:text-slate-500">v{version}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="max-w-[200px] truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</span>
          <ThemeToggle />
          <PrinterTestButton printerName={printerName} />
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>

      {/* Sidebar */}
      <AppSidebar sections={sections} />

      {/* Main content — offset for fixed header + sidebar */}
      <div className="ml-48 pt-14">
        {children}
      </div>
    </div>
  );
}
