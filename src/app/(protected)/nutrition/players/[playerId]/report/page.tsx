import Link from "next/link";
import { notFound } from "next/navigation";
import { OMSGrowthChart, WaistTrendChart } from "@/components/nutrition/charts";
import { PrintReportButton } from "@/components/nutrition/print-report-button";
import { PageShell } from "@/components/ui/page-shell";
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

export default async function NutritionParentReportPage({ params }: { params: PageParams }) {
  await requireNutritionContext("/unauthorized");
  const { playerId } = await params;
  const profile = await getNutritionPlayerProfile(playerId);

  if (!profile) notFound();

  const latestBmi = profile.growthProfile.latestBmi;

  return (
    <PageShell
      title={`Reporte nutricional - ${profile.playerName}`}
      subtitle="Vista para imprimir o guardar como PDF. No incluye informacion financiera."
      breadcrumbs={[
        { label: "Nutricion", href: "/nutrition" },
        { label: "Ficha", href: `/nutrition/players/${profile.playerId}` },
        { label: "Reporte" },
      ]}
      wide
    >
      <div className="space-y-4 print:bg-white print:text-black">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-4 print:hidden dark:border-slate-700 dark:bg-slate-900">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">Reporte para padres</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Escribe notas si hace falta y usa imprimir para guardar como PDF.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/nutrition/players/${profile.playerId}`}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
            >
              Volver a ficha
            </Link>
            <PrintReportButton />
          </div>
        </div>

        <article className="rounded-md border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 print:border-slate-300">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Dragon Force - Nutricion</p>
              <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{profile.playerName}</h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {profile.campusName} | Cat. {profile.birthYear ?? "-"} | {profile.genderLabel}
              </p>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400">
              <p>Fecha de reporte: {formatDateMonterrey(new Date().toISOString())}</p>
              <p>Ultima inscripcion: {formatDateMonterrey(`${profile.latestEnrollmentDate}T12:00:00.000Z`)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs uppercase text-slate-500">Peso</p>
              <p className="mt-1 font-semibold">{formatValue(profile.latestSession?.weightKg, "kg")}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDelta(profile.deltaWeightKg, "kg")}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs uppercase text-slate-500">Estatura</p>
              <p className="mt-1 font-semibold">{formatValue(profile.latestSession?.heightCm, "cm")}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDelta(profile.deltaHeightCm, "cm")}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs uppercase text-slate-500">Cintura</p>
              <p className="mt-1 font-semibold">{formatValue(profile.latestSession?.waistCircumferenceCm, "cm")}</p>
              <p className="mt-1 text-xs text-slate-500">{formatDelta(profile.deltaWaistCircumferenceCm, "cm")}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs uppercase text-slate-500">IMC OMS</p>
              <p className="mt-1 font-semibold">{latestBmi ? `${latestBmi.value.toFixed(1)} kg/m2` : "-"}</p>
              <p className="mt-1 text-xs text-slate-500">
                {latestBmi ? `P${latestBmi.percentile} | Z ${latestBmi.zScore > 0 ? "+" : ""}${latestBmi.zScore}` : "Sin referencia disponible"}
              </p>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notas y recomendaciones para padres</span>
            <textarea
              rows={5}
              className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 print:min-h-32"
              placeholder="Escribe aqui observaciones, recomendaciones o seguimiento sugerido antes de imprimir."
            />
          </label>
        </article>

        <OMSGrowthChart profile={profile.growthProfile} />

        <WaistTrendChart
          data={profile.chartPoints.map((point) => ({
            label: point.label,
            waistCircumferenceCm: point.waistCircumferenceCm,
          }))}
        />

        <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Historial de mediciones</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Peso</th>
                  <th className="px-3 py-2">Estatura</th>
                  <th className="px-3 py-2">Cintura</th>
                  <th className="px-3 py-2">Notas internas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {profile.history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-slate-500">
                      Sin mediciones registradas.
                    </td>
                  </tr>
                ) : (
                  profile.history.map((session) => (
                    <tr key={session.id}>
                      <td className="px-3 py-2">{formatDateMonterrey(session.measuredAt)}</td>
                      <td className="px-3 py-2">{session.weightKg.toFixed(1)} kg</td>
                      <td className="px-3 py-2">{session.heightCm.toFixed(1)} cm</td>
                      <td className="px-3 py-2">{formatValue(session.waistCircumferenceCm, "cm")}</td>
                      <td className="px-3 py-2">{session.notes?.trim() || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </PageShell>
  );
}
