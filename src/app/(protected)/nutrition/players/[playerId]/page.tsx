import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { OMSGrowthChart, WaistTrendChart } from "@/components/nutrition/charts";
import { recordPlayerMeasurementAction } from "@/server/actions/nutrition";
import { requireNutritionContext } from "@/lib/auth/permissions";
import { getNutritionPlayerProfile } from "@/lib/queries/nutrition";
import type { GrowthClassificationTone } from "@/lib/nutrition/growth";
import { formatDateMonterrey, getMonterreyDateString } from "@/lib/time";

function formatDelta(value: number | null, suffix: string) {
  if (value == null) return "Sin comparacion previa";
  if (value === 0) return `Sin cambio (${suffix})`;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} ${suffix}`;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_form: "Completa fecha, peso y estatura para guardar la medicion.",
  invalid_enrollment: "La inscripcion activa ya no es valida para registrar esta medicion.",
  unauthorized: "No tienes permiso para registrar mediciones en este jugador.",
  save_failed: "No se pudo guardar la medicion.",
};

const CLASSIFICATION_CLASSES: Record<GrowthClassificationTone, string> = {
  normal: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

type PageParams = Promise<{ playerId: string }>;
type SearchParams = Promise<{ ok?: string; err?: string }>;

export default async function NutritionPlayerProfilePage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const context = await requireNutritionContext("/unauthorized");
  const { playerId } = await params;
  const query = await searchParams;
  const profile = await getNutritionPlayerProfile(playerId);

  if (!profile) notFound();

  const successMessage = query.ok === "saved" ? "Medicion registrada." : null;
  const errorMessage = query.err ? ERROR_MESSAGES[query.err] ?? "Ocurrio un error." : null;
  const canRecordMeasurement = context.isNutritionist || context.isSuperAdmin;

  return (
    <PageShell
      title={profile.playerName}
      subtitle="Ficha segura de nutricion. No muestra datos financieros ni permite cambios operativos."
      breadcrumbs={[
        { label: "Nutricion", href: "/nutrition" },
        { label: "Toma de medidas", href: "/nutrition/measurements" },
        { label: profile.playerName },
      ]}
      wide
    >
      <div className="space-y-4">
        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <article className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Jugador</p>
                <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{profile.playerName}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {profile.campusName} | Cat. {profile.birthYear ?? "-"} | {profile.genderLabel} | Nivel {profile.level ?? "Sin nivel"}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  profile.currentEnrollmentHasMeasurement
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
              >
                {profile.currentEnrollmentHasMeasurement ? "Toma actual completada" : "Primera toma pendiente"}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ultima inscripcion</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {formatDateMonterrey(`${profile.latestEnrollmentDate}T12:00:00.000Z`)}
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ultimo peso</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {profile.latestSession ? `${profile.latestSession.weightKg.toFixed(1)} kg` : "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDelta(profile.deltaWeightKg, "kg")}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ultima estatura</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {profile.latestSession ? `${profile.latestSession.heightCm.toFixed(1)} cm` : "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDelta(profile.deltaHeightCm, "cm")}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Ultima cintura</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {profile.latestSession?.waistCircumferenceCm != null ? `${profile.latestSession.waistCircumferenceCm.toFixed(1)} cm` : "-"}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDelta(profile.deltaWaistCircumferenceCm, "cm")}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Tutor</p>
                {profile.guardianContact ? (
                  <div className="mt-1 space-y-1 text-sm text-slate-700 dark:text-slate-300">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{profile.guardianContact.name}</p>
                    <p>{profile.guardianContact.relationshipLabel ?? "Relacion no capturada"}</p>
                    <p>{profile.guardianContact.phonePrimary ?? "Sin telefono principal"}</p>
                    {profile.guardianContact.phoneSecondary ? <p>{profile.guardianContact.phoneSecondary}</p> : null}
                    {profile.guardianContact.email ? <p>{profile.guardianContact.email}</p> : null}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sin tutor capturado.</p>
                )}
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Notas medicas</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                  {profile.medicalNotes?.trim() || "Sin notas medicas."}
                </p>
              </div>
            </div>
          </article>

          <article id="new-measurement" className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Nueva medicion</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  La primera captura del ciclo actual se registra como `initial_intake`; las siguientes como seguimiento.
                </p>
              </div>
              <Link href="/nutrition/measurements" className="text-sm text-portoBlue hover:underline">
                Volver a lista
              </Link>
            </div>

            {canRecordMeasurement ? (
            <form action={recordPlayerMeasurementAction} className="mt-4 grid gap-3">
              <input type="hidden" name="player_id" value={profile.playerId} />
              <input type="hidden" name="enrollment_id" value={profile.activeEnrollmentId} />
              <input type="hidden" name="return_to" value={`/nutrition/players/${profile.playerId}`} />

              <div className="grid gap-3 md:grid-cols-4">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Fecha</span>
                  <input
                    type="date"
                    name="measurement_date"
                    defaultValue={getMonterreyDateString()}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Peso (kg)</span>
                  <input
                    type="number"
                    name="weight_kg"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Estatura (cm)</span>
                  <input
                    type="number"
                    name="height_cm"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                    required
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Circunferencia de cintura (cm)</span>
                  <input
                    type="number"
                    name="waist_circumference_cm"
                    step="0.1"
                    min="0"
                    inputMode="decimal"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                </label>
              </div>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Notas</span>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                  placeholder="Observaciones opcionales"
                />
              </label>

              <div className="flex justify-end">
                <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
                  Guardar medicion
                </button>
              </div>
            </form>
            ) : (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
                Tu rol puede revisar nutricion, pero no registrar nuevas mediciones.
              </div>
            )}
          </article>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <OMSGrowthChart profile={profile.growthProfile} />

          <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Resumen actual</p>
            {profile.latestSession ? (
              <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                <p>Fecha: {formatDateMonterrey(profile.latestSession.measuredAt)}</p>
                <p>Tipo: {profile.latestSession.source === "initial_intake" ? "Primera toma" : "Seguimiento"}</p>
                <p>Peso: {profile.latestSession.weightKg.toFixed(1)} kg</p>
                <p>Estatura: {profile.latestSession.heightCm.toFixed(1)} cm</p>
                <p>Cintura: {profile.latestSession.waistCircumferenceCm != null ? `${profile.latestSession.waistCircumferenceCm.toFixed(1)} cm` : "-"}</p>
                {profile.growthProfile.latestBmi ? (
                  <>
                    <p>IMC: {profile.growthProfile.latestBmi.value.toFixed(1)} kg/m2</p>
                    <p>Percentil IMC: P{profile.growthProfile.latestBmi.percentile}</p>
                    <p>
                      Z-score IMC: {profile.growthProfile.latestBmi.zScore > 0 ? "+" : ""}
                      {profile.growthProfile.latestBmi.zScore}
                    </p>
                    {profile.growthProfile.latestBmi.classification ? (
                      <p>
                        Clasificacion:{" "}
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                            CLASSIFICATION_CLASSES[profile.growthProfile.latestBmi.classification.tone]
                          }`}
                        >
                          {profile.growthProfile.latestBmi.classification.label}
                        </span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">IMC OMS: requiere edad y genero dentro del rango OMS.</p>
                )}
                <p>Notas: {profile.latestSession.notes?.trim() || "-"}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Aun no hay mediciones registradas.</p>
            )}
          </article>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)]">
          <WaistTrendChart
            data={profile.chartPoints.map((point) => ({
              label: point.label,
              waistCircumferenceCm: point.waistCircumferenceCm,
            }))}
          />
          <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Reporte para padres</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Abre una vista limpia con curvas OMS, resumen nutricional e historial para imprimir o guardar como PDF.
            </p>
            <Link
              href={`/nutrition/players/${profile.playerId}/report`}
              className="mt-4 inline-flex rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
            >
              Abrir reporte
            </Link>
          </article>
        </div>

        <article className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Historial</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Sesiones registradas para este jugador.</p>
            </div>
            <a href="#new-measurement" className="text-sm text-portoBlue hover:underline">
              Registrar nueva
            </a>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Peso</th>
                  <th className="px-3 py-2">Estatura</th>
                  <th className="px-3 py-2">Cintura</th>
                  <th className="px-3 py-2">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {profile.history.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-600 dark:text-slate-400" colSpan={6}>
                      No hay sesiones registradas.
                    </td>
                  </tr>
                ) : (
                  profile.history.map((session) => (
                    <tr key={session.id}>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{formatDateMonterrey(session.measuredAt)}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {session.source === "initial_intake" ? "Primera toma" : "Seguimiento"}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{session.weightKg.toFixed(1)} kg</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{session.heightCm.toFixed(1)} cm</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                        {session.waistCircumferenceCm != null ? `${session.waistCircumferenceCm.toFixed(1)} cm` : "-"}
                      </td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{session.notes?.trim() || "-"}</td>
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
