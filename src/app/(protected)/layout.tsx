import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { APP_ROLES } from "@/lib/auth/roles";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/players", label: "Players" },
  { href: "/pending", label: "Pending" },
  { href: "/reports/corte-diario", label: "Corte Diario" },
  { href: "/reports/resumen-mensual", label: "Resumen Mensual" }
];

type RoleRow = {
  app_roles: {
    code: string;
  } | null;
};

function isBootstrapAdminEmail(email: string | null | undefined) {
  if (!email) return false;

  const configured = process.env.BOOTSTRAP_ADMIN_EMAILS;
  if (!configured) return false;

  const allowedEmails = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return allowedEmails.includes(email.toLowerCase());
}

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
  const hasAppRoleAccess =
    roleCodes.includes(APP_ROLES.DIRECTOR_ADMIN) || roleCodes.includes(APP_ROLES.ADMIN_RESTRICTED);
  const hasBootstrapAccess = isBootstrapAdminEmail(user.email);
  const canAccess = hasAppRoleAccess || hasBootstrapAccess;

  if (!canAccess) {
    redirect("/unauthorized");
  }

  async function signOut() {
    "use server";
    const serverClient = await createClient();
    await serverClient.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <p className="font-semibold text-portoDark">Dragon Force Ops</p>
          <div className="flex items-center gap-6">
            <nav className="flex gap-4 text-sm text-slate-700">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-portoBlue">
                  {item.label}
                </Link>
              ))}
            </nav>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
