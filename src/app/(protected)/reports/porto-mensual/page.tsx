import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { getPortoDatosGenerales } from "@/lib/queries/porto-report";
import { MONTH_NAMES_ES } from "@/lib/billing/generate-monthly-charges";

export const metadata = { title: "Reporte Porto — Dragon Force Ops" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonthParam() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function prevMonthParam() {
  const now = new Date();
  now.setDate(1);
  now.setMonth(now.getMonth() - 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(ym: string) {
  const [year, mon] = ym.split("-");
  return `${MONTH_NAMES_ES[parseInt(mon, 10) - 1]} ${year}`;
}

function fmtMxn(v: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0
  }).format(v);
}

function fmtUsd(v: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(v);
}

const DROPOUT_LABELS: Record<string, string> = {
  cost: "Costo / precio",
  distance: "Distancia / logística",
  injury: "Lesión o salud",
  attitude: "Actitud / disciplina",
  time: "Falta de tiempo",
  level_change: "Cambio de nivel / campus",
  other: "Otro",
  no_reason: "Sin motivo registrado"
};

// ── UI building blocks ────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200 pb-1">
      {children}
    </h2>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type SearchParams = Promise<{ month?: string; rate?: string }>;

export default async function PortoMensualPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const selectedMonth = params.month ?? prevMonthParam();
  const exchangeRate = parseFloat(params.rate ?? "18") || 18;

  const data = await getPortoDatosGenerales(selectedMonth);

  const pendienteUsd = data ? data.deudores.pendienteMxn / exchangeRate : 0;

  return (
    <PageShell
      title="Reporte de Acompañamiento"
      subtitle={`Porto HQ · ${monthLabel(selectedMonth)}`}
    >
      <div className="space-y-8">

        {/* ── Filters ── */}
        <form className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Mes</label>
            <input
              type="month"
              name="month"
              defaultValue={selectedMonth}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">Tipo de cambio (MXN → USD)</label>
            <input
              type="number"
              name="rate"
              defaultValue={exchangeRate}
              min="1"
              step="0.5"
              className="w-28 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Aplicar
          </button>
          <Link
            href={`/reports/porto-mensual?month=${prevMonthParam()}`}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Mes anterior
          </Link>
        </form>

        {!data ? (
          <p className="text-sm text-slate-500">Sin datos para el período seleccionado.</p>
        ) : (
          <>
            {/* ── 1. Nuevas inscripciones ── */}
            <section className="space-y-3">
              <SectionTitle>Nuevas Inscripciones</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Total" value={data.nuevasInscripciones.total} />
                <StatCard label="Varonil" value={data.nuevasInscripciones.varonil} />
                <StatCard label="Femenil" value={data.nuevasInscripciones.femenil} />
              </div>
            </section>

            {/* ── 2. Retiros ── */}
            <section className="space-y-3">
              <SectionTitle>Retiros</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Total retiros" value={data.retiros.total} />
              </div>
              {data.retiros.reasons.length > 0 && (
                <div className="rounded-md border border-slate-200 bg-white overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left">Motivo</th>
                        <th className="px-4 py-2 text-right">Jugadores</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.retiros.reasons.map((r) => (
                        <tr key={r.reason}>
                          <td className="px-4 py-2 text-slate-700">
                            {DROPOUT_LABELS[r.reason] ?? r.reason}
                          </td>
                          <td className="px-4 py-2 text-right font-medium">{r.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.retiros.reasons.length === 0 && data.retiros.total === 0 && (
                <p className="text-sm text-slate-400">Sin retiros en el período.</p>
              )}
            </section>

            {/* ── 3. Jugadores activos ── */}
            <section className="space-y-3">
              <SectionTitle>Jugadores Activos al Fin del Mes</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Total activos" value={data.activos.total} />
                <StatCard label="Varonil" value={data.activos.varonil} />
                <StatCard label="Femenil" value={data.activos.femenil} />
                <StatCard
                  label="Becados"
                  value={data.activos.becados}
                  sub="Incluidos en total, sin cargo de mensualidad"
                />
              </div>
            </section>

            {/* ── 4. Cobranza ── */}
            <section className="space-y-3">
              <SectionTitle>Cobranza Pendiente</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  label="Jugadores con saldo"
                  value={data.deudores.count}
                  sub="Inscripciones activas con cargo pendiente"
                />
                <StatCard
                  label="Total pendiente (MXN)"
                  value={fmtMxn(data.deudores.pendienteMxn)}
                  sub="Balance actual de inscripciones activas"
                />
                <StatCard
                  label={`Total pendiente (USD · $${exchangeRate})`}
                  value={fmtUsd(pendienteUsd)}
                  sub="Conversión al tipo de cambio aplicado"
                />
              </div>
            </section>

            {/* ── 5. Equipos de Competición ── */}
            <section className="space-y-3">
              <SectionTitle>Equipos de Competición</SectionTitle>
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">
                Disponible cuando los equipos estén registrados en el sistema.
              </div>
            </section>

            {/* ── 6. Clases ── */}
            <section className="space-y-3">
              <SectionTitle>Clases</SectionTitle>
              <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-400">
                Disponible cuando los grupos estén registrados en el sistema.
              </div>
            </section>

            {/* ── 7. Eventos ── */}
            <section className="space-y-3">
              <SectionTitle>Eventos del Mes</SectionTitle>
              <p className="text-xs text-slate-400">
                Completar manualmente antes de enviar el reporte a Porto.
              </p>
              <textarea
                rows={5}
                placeholder="Descripción de eventos, fechas, participantes…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300"
                readOnly
              />
            </section>

            {/* ── 8. Mapa de Área ── */}
            <section className="space-y-3">
              <SectionTitle>Mapa de Área</SectionTitle>
              <p className="text-xs text-slate-400">
                Información de área, contactos regionales y alcance geográfico. Completar manualmente.
              </p>
              <textarea
                rows={4}
                placeholder="Contactos, cobertura de área, notas regionales…"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300"
                readOnly
              />
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
