import { redirect } from "next/navigation";
import { AzureSignInButton } from "@/components/auth/azure-sign-in-button";
import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      redirect("/dashboard");
    }
  } catch {
    return (
      <PageShell title="Error de configuracion de acceso" subtitle="La conexion con Supabase fallo en este entorno">
        <p className="text-sm text-slate-700">
          Verifica las variables de entorno de Preview para URL y llave de Supabase, y vuelve a desplegar.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell title="Iniciar sesion" subtitle="Aplicacion interna de FC Porto Dragon Force Monterrey">
      <div className="space-y-3">
        <p className="text-sm text-slate-700">
          El acceso esta restringido a personal autorizado. Usa tu cuenta de Microsoft 365 para continuar.
        </p>
        <AzureSignInButton />
      </div>
    </PageShell>
  );
}
