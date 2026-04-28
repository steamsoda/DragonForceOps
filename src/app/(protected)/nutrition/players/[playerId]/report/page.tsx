import Link from "next/link";
import { notFound } from "next/navigation";
import { CompactOMSGrowthCharts } from "@/components/nutrition/charts";
import { PrintReportButton } from "@/components/nutrition/print-report-button";
import { requireNutritionContext } from "@/lib/auth/permissions";
import { getNutritionPlayerProfile } from "@/lib/queries/nutrition";
import { formatDateMonterrey } from "@/lib/time";

type PageParams = Promise<{ playerId: string }>;

function formatValue(value: number | null | undefined, suffix: string) {
  return value == null ? "-" : `${value.toFixed(1)} ${suffix}`;
}

function formatDelta(value: number | null, suffix: string) {
  if (value == null) return "Sin comparacion previa";
  if (value === 0) return `Sin cambio (${suffix})`;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} ${suffix}`;
}

function MetricRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border-b border-slate-200 py-1.5 last:border-b-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
      {detail ? <p className="text-[10px] text-slate-500">{detail}</p> : null}
    </div>
  );
}

function getPercentilePosition(percentile: number | null | undefined) {
  if (percentile == null || !Number.isFinite(percentile)) return 50;
  return Math.max(2, Math.min(98, percentile));
}

export default async function NutritionParentReportPage({ params }: { params: PageParams }) {
  await requireNutritionContext("/unauthorized");
  const { playerId } = await params;
  const profile = await getNutritionPlayerProfile(playerId);

  if (!profile) notFound();

  const latestBmi = profile.growthProfile.latestBmi;
  const latest = profile.latestSession;
  const bmiClassification = latestBmi?.classification?.label ?? null;
  const percentilePosition = getPercentilePosition(latestBmi?.percentile);

  return (
    <main className="mx-auto max-w-[980px] px-4 py-5 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4 print:hidden">
        <div>
          <p className="font-semibold text-slate-900">Reporte para padres</p>
          <p className="text-sm text-slate-600">Escribe notas si hace falta y usa imprimir para guardar como PDF.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/nutrition/players/${profile.playerId}`} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
            Volver a ficha
          </Link>
          <PrintReportButton />
        </div>
      </div>

      <article className="min-h-[10.5in] rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm print:min-h-0 print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="border-b-2 border-slate-300 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-portoBlue">Dragon Force</p>
              <h1 className="text-2xl font-black uppercase tracking-wide text-slate-900">Resumen de nutricion</h1>
              <p className="text-xs text-slate-500">Reporte informativo para padres</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black uppercase tracking-[0.14em] text-portoBlue">Dragon Force Monterrey</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Nutricion</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_120px_120px] gap-4 text-xs">
            <div>
              <p className="font-semibold uppercase text-slate-500">Nombre</p>
              <p className="border-b border-slate-300 pb-1 text-sm font-semibold text-slate-900">{profile.playerName}</p>
            </div>
            <div>
              <p className="font-semibold uppercase text-slate-500">Reporte</p>
              <p className="border-b border-slate-300 pb-1 text-sm font-semibold">{formatDateMonterrey(new Date().toISOString())}</p>
            </div>
            <div>
              <p className="font-semibold uppercase text-slate-500">Ult. medicion</p>
              <p className="border-b border-slate-300 pb-1 text-sm font-semibold">{latest ? formatDateMonterrey(latest.measuredAt) : "-"}</p>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-[minmax(0,1fr)_190px] gap-5 border-b border-slate-300 py-4">
          <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-5">
            <div className="flex flex-col items-center justify-center">
              <div className="w-full rounded-md border border-slate-200 p-3">
                <p className="text-center text-[10px] font-bold uppercase tracking-wide text-portoBlue">Percentil IMC</p>
                <p className="mt-1 text-center text-3xl font-black text-slate-900">{latestBmi ? latestBmi.percentile : "-"}</p>
                <div className="relative mt-5 h-5 overflow-visible rounded-full bg-gradient-to-r from-rose-500 via-amber-400 via-emerald-300 to-rose-500">
                  {latestBmi ? (
                    <div
                      className="absolute -top-4 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[12px] border-x-transparent border-t-slate-900"
                      style={{ left: `${percentilePosition}%` }}
                    />
                  ) : null}
                </div>
                <div className="mt-2 flex justify-between text-[9px] font-semibold text-slate-500">
                  <span>P3</span>
                  <span>P50</span>
                  <span>P97</span>
                </div>
              </div>
              <div className="mt-3 grid w-full grid-cols-3 gap-1 text-center text-[9px] font-semibold text-slate-600">
                <span className="rounded bg-emerald-100 px-1 py-1 text-emerald-800">Rango OMS</span>
                <span className="rounded bg-amber-100 px-1 py-1 text-amber-800">Seguimiento</span>
                <span className="rounded bg-rose-100 px-1 py-1 text-rose-800">Atencion</span>
              </div>
            </div>

            <div>
              <p className="text-xl font-black text-amber-500">
                {latestBmi ? `IMC Percentil ${latestBmi.percentile}${bmiClassification ? ` (${bmiClassification})` : ""}` : "Seguimiento nutricional"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Este reporte resume las mediciones registradas por nutricion y las compara contra referencias OMS cuando la edad y genero lo permiten.
              </p>
              <label className="mt-3 block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Observaciones y recomendaciones</span>
                <textarea
                  rows={5}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-5 print:border-0 print:px-0 print:shadow-none print:outline-none"
                  placeholder="Escribe aqui observaciones, recomendaciones o seguimiento sugerido antes de imprimir."
                />
              </label>
            </div>
          </div>

          <aside className="border-l border-slate-200 pl-4">
            <MetricRow label="Campus" value={profile.campusName} />
            <MetricRow label="Categoria" value={profile.birthYear ? String(profile.birthYear) : "-"} />
            <MetricRow label="Genero" value={profile.genderLabel} />
            <MetricRow label="Peso" value={formatValue(latest?.weightKg, "kg")} detail={formatDelta(profile.deltaWeightKg, "kg")} />
            <MetricRow label="Estatura" value={formatValue(latest?.heightCm, "cm")} detail={formatDelta(profile.deltaHeightCm, "cm")} />
            <MetricRow label="Cintura" value={formatValue(latest?.waistCircumferenceCm, "cm")} detail={formatDelta(profile.deltaWaistCircumferenceCm, "cm")} />
            <MetricRow
              label="IMC"
              value={latestBmi ? `${latestBmi.value.toFixed(1)} kg/m2` : "-"}
              detail={latestBmi ? `P${latestBmi.percentile} | Z ${latestBmi.zScore > 0 ? "+" : ""}${latestBmi.zScore}` : "Sin referencia"}
            />
          </aside>
        </section>

        <section className="border-b border-slate-300 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-wide text-portoBlue">Curvas OMS</h2>
            <p className="text-[10px] text-slate-500">IMC, peso y estatura por edad</p>
          </div>
          <CompactOMSGrowthCharts profile={profile.growthProfile} height={132} />
        </section>

        <section className="py-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-portoBlue">Historial reciente</h2>
            <table className="mt-2 min-w-full text-xs">
              <thead className="border-b border-slate-300 text-left uppercase text-slate-500">
                <tr>
                  <th className="py-1">Fecha</th>
                  <th className="py-1">Peso</th>
                  <th className="py-1">Estatura</th>
                  <th className="py-1">Cintura</th>
                  <th className="py-1">Tipo</th>
                </tr>
              </thead>
              <tbody>
                {profile.history.slice(0, 5).map((session) => (
                  <tr key={session.id} className="border-b border-slate-100">
                    <td className="py-1">{formatDateMonterrey(session.measuredAt)}</td>
                    <td className="py-1">{session.weightKg.toFixed(1)} kg</td>
                    <td className="py-1">{session.heightCm.toFixed(1)} cm</td>
                    <td className="py-1">{formatValue(session.waistCircumferenceCm, "cm")}</td>
                    <td className="py-1">{session.source === "initial_intake" ? "Primera" : "Seguimiento"}</td>
                  </tr>
                ))}
                {profile.history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-slate-500">Sin mediciones registradas.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[10px] leading-4 text-slate-500">
            Reporte informativo de seguimiento nutricional. No sustituye una valoracion medica ni diagnostico clinico.
          </p>
        </section>
      </article>
    </main>
  );
}
