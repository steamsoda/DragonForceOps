import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageShell } from "@/components/ui/page-shell";
import { getAllSettings } from "@/lib/queries/settings";
import { updateTagSettingsAction } from "@/server/actions/settings";

const TAG_DESCRIPTIONS: Record<string, string> = {
  tag_payment:    "Muestra 'Al corriente' o 'Pendiente' según el saldo del jugador.",
  tag_team_type:  "Muestra 'Selectivo' o 'Clases' según el tipo de equipo asignado.",
  tag_goalkeeper: "Muestra 'Portero' si el jugador tiene el atributo de portero activado.",
  tag_uniform:    "Muestra el estado del uniforme pedido/entregado.",
};

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_director_admin");
  if (!isAdmin) redirect("/dashboard");

  const { tags } = await getAllSettings();

  return (
    <PageShell
      title="Configuración"
      subtitle="Ajustes generales de la aplicación"
      breadcrumbs={[{ label: "Configuración" }]}
    >
      <div className="max-w-lg space-y-6">
        <section className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Tags de jugadores
          </h2>
          <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
            Controla qué tags se muestran en la columna Estado de la lista de jugadores.
          </p>

          <form action={updateTagSettingsAction} className="space-y-4">
            <TagToggle
              name="tag_payment"
              label="Al corriente / Pendiente"
              description={TAG_DESCRIPTIONS.tag_payment}
              defaultChecked={tags.payment}
            />
            <TagToggle
              name="tag_team_type"
              label="Selectivo / Clases"
              description={TAG_DESCRIPTIONS.tag_team_type}
              defaultChecked={tags.teamType}
            />
            <TagToggle
              name="tag_goalkeeper"
              label="Portero"
              description={TAG_DESCRIPTIONS.tag_goalkeeper}
              defaultChecked={tags.goalkeeper}
            />
            <TagToggle
              name="tag_uniform"
              label="Estado de uniforme"
              description={TAG_DESCRIPTIONS.tag_uniform}
              defaultChecked={tags.uniform}
            />

            <div className="pt-2">
              <button
                type="submit"
                className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
              >
                Guardar cambios
              </button>
            </div>
          </form>
        </section>
      </div>
    </PageShell>
  );
}

function TagToggle({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="relative mt-0.5 shrink-0">
        <input
          type="checkbox"
          name={name}
          value="1"
          defaultChecked={defaultChecked}
          className="peer sr-only"
        />
        <div className="h-5 w-9 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-200 dark:bg-slate-700 transition-colors peer-checked:border-portoBlue peer-checked:bg-portoBlue" />
        <div className="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      </div>
    </label>
  );
}
