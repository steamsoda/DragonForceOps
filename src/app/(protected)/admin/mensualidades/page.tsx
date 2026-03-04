import { PageShell } from "@/components/ui/page-shell";
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
  err?: string;
}>;

function getCurrentMonthValue() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function MensualidadesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const ok = params.ok === "1";
  const created = parseInt(params.created ?? "0", 10);
  const skipped = parseInt(params.skipped ?? "0", 10);
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
                {skipped > 0 && <span className="ml-1">{skipped} inscripcion{skipped !== 1 ? "es" : ""} ya tenia{skipped !== 1 ? "n" : ""} cargo para ese mes (omitida{skipped !== 1 ? "s" : ""}).</span>}
              </>
            ) : (
              <span>Todas las inscripciones activas ya tienen cargo para ese mes. No se generaron cargos nuevos.</span>
            )}
          </div>
        )}

        {err && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {ERROR_MESSAGES[err] ?? `Error: ${err}`}
          </div>
        )}

        <form action={generateMonthlyTuitionAction} className="space-y-4 rounded-md border border-slate-200 bg-white p-6">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Mes a generar</label>
            <input
              type="month"
              name="period_month"
              defaultValue={defaultMonth}
              required
              className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500">
              Se generaran cargos de $750 para todas las inscripciones activas que aun no tengan cargo ese mes.
              Las que ya tengan cargo seran omitidas automaticamente.
            </p>
          </div>

          <button
            type="submit"
            className="rounded-md bg-portoBlue px-5 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Generar mensualidades
          </button>
        </form>

        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
          <p className="font-medium text-slate-700">Notas</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>El cargo se crea a la tarifa regular ($750). El descuento por pago anticipado se aplica al momento del pago (dias 1–10).</li>
            <li>La operacion es segura de repetir — no crea duplicados.</li>
            <li>Solo afecta inscripciones con estatus <strong>activo</strong>.</li>
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
