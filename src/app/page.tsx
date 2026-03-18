import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AzureSignInButton } from "@/components/auth/azure-sign-in-button";

type SearchParams = Promise<{ error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  oauth_exchange_failed: "No se pudo completar el acceso. Intenta de nuevo.",
  missing_code: "Enlace de acceso invalido.",
  supabase_config: "Error de configuracion. Contacta al administrador.",
  unauthorized: "Tu cuenta no tiene acceso a esta aplicacion."
};

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/dashboard");
  } catch {
    // Supabase config error — fall through and show login
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-1">
          <p className="font-[family-name:var(--font-aoboshi)] text-4xl tracking-widest text-portoDark dark:text-portoBlue">
            INVICTA
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">FC Porto Dragon Force Monterrey</p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 shadow-sm space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Bienvenido</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Acceso restringido a personal autorizado.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-400">
              {ERROR_MESSAGES[error] ?? "Ocurrio un error. Intenta de nuevo."}
            </div>
          )}

          <AzureSignInButton />
        </div>
      </div>
    </main>
  );
}
