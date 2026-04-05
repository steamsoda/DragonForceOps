import { PageShell } from "@/components/ui/page-shell";
import { requireDirectorContext } from "@/lib/auth/permissions";
import { generateMonthlyTuitionAction } from "@/server/actions/billing";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_month: "Mes invalido. Selecciona un mes valido.",
  unauthenticated: "No autenticado.",
  charge_type_missing: "Tipo de cargo 'mensualidad' no encontrado en el sistema.",
  no_rate_found: "No se encontro tarifa de mensualidad en el plan de precios.",
  insert_failed: "Error al insertar cargos. Intenta de nuevo."
};

type SearchParams = Promise<{
  ok?: string;
  created?: string;
  skipped?: string;
  skipped_existing_charge?: string;
  skipped_scholarship?: string;
  skipped_by_incident?: string;
  skipped_other?: string;
  err?: string;
}>;

function getCurrentMonthValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function MensualidadesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireDirectorContext("/unauthorized");
  const params = await searchParams;
  const ok = params.ok === "1";
  const created = parseInt(params.created ?? "0", 10);
  const skipped = parseInt(params.skipped ?? "0", 10);
  const skippedExistingCharge = parseInt(params.skipped_existing_charge ?? "0", 10);
  const skippedScholarship = parseInt(params.skipped_scholarship ?? "0", 10);
  const skippedByIncident = parseInt(params.skipped_by_incident ?? "0", 10);
  const skippedOther = parseInt(params.skipped_other ?? "0", 10);
  const err = params.err;
  const defaultMonth = getCurrentMonthValue();

  return (
    <PageShell
      title="Generar mensualidades"
      subtitle="Crea los cargos de mensualidad para todas las inscripciones activas de un mes."
      breadcrumbs={[{ label: "Admin" }, { label: "Mensualidades" }]}
    >
      <div className="max-w-lg space-y-6">
        {ok && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {created > 0 ? (
              <>
                <span className="font-semibold">{created} cargo{created !== 1 ? "s" : ""} generado{created !== 1 ? "s" : ""}.</span>
                {skipped > 0 ? (
                  <span className="ml-1">
                    Omitidas: {skippedExistingCharge} por cargo existente, {skippedScholarship} con beca, {skippedByIncident} por incidencia
                    {skippedOther > 0 ? ` y ${skippedOther} por otras causas` : ""}.
                  </span>
                ) : null}
              </>
            ) : (
              <span>
                No se generaron cargos nuevos.
                {skipped > 0
                  ? ` Omitidas: ${skippedExistingCharge} por cargo existente, ${skippedScholarship} con beca, ${skippedByIncident} por incidencia${skippedOther > 0 ? ` y ${skippedOther} por otras causas` : ""}.`
                  : " Todas las inscripciones activas ya tenían una condición que impidió generar cargos."}
              </span>
            )}
          </div>
        )}

        {err && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {ERROR_MESSAGES[err] ?? `Error: ${err}`}
          </div>
        )}

        <form action={generateMonthlyTuitionAction} className="space-y-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Mes a generar</label>
            <input
              type="month"
              name="period_month"
              defaultValue={defaultMonth}
              required
              className="block w-full rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Se generarán cargos de mensualidad para las inscripciones activas que no tengan beca, cargo existente ni una incidencia con omisión para ese mes.
            </p>
          </div>

          <button
            type="submit"
            className="rounded-md bg-portoBlue px-5 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Generar mensualidades
          </button>
        </form>

        <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <p className="font-medium text-slate-700 dark:text-slate-300">Notas</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>La operación usa la versión de tarifa vigente para el mes seleccionado.</li>
            <li>La operación es segura de repetir, no crea duplicados.</li>
            <li>Solo afecta inscripciones con estatus <strong>activo</strong> y sin beca (<code>has_scholarship = false</code>).</li>
            <li>Las incidencias con omisión activa para ese mes también se respetan automáticamente.</li>
            <li>Este botón es para uso manual (meses atrasados, pruebas). El día 1 de cada mes los cargos se generan <strong>automáticamente</strong> a las 06:00 UTC vía pg_cron en Supabase.</li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
