import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isAllowedPortoEmail,
  isPortoEmailProofEnabled,
} from "@/lib/auth/porto-email-proof";

export const dynamic = "force-dynamic";

export default async function EmailConfirmedPage() {
  if (!isPortoEmailProofEnabled()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !isAllowedPortoEmail(user.email)) {
    await supabase.auth.signOut();
    redirect("/?error=unauthorized");
  }

  async function signOut() {
    "use server";
    const serverClient = await createClient();
    await serverClient.auth.signOut();
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold uppercase text-portoBlue">Prueba completada</p>
        <h1 className="mt-2 text-xl font-semibold text-slate-950 dark:text-white">
          Acceso por correo confirmado
        </h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Supabase autentico correctamente a <strong>{user.email}</strong>.
        </p>
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Esta prueba no concede acceso a datos ni permisos de INVICTA.
        </div>
        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-portoBlue px-4 text-sm font-medium text-white hover:bg-portoDark"
          >
            Cerrar prueba
          </button>
        </form>
      </section>
    </main>
  );
}
