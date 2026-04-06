import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPlayerDetail } from "@/lib/queries/players";
import { getUniformOrdersAction } from "@/server/actions/uniforms";
import { UniformOrdersSection } from "@/components/players/uniform-orders-section";
import { LedgerSummaryCards } from "@/components/billing/ledger-summary-cards";
import { ChargesLedgerTable } from "@/components/billing/charges-ledger-table";
import { PaymentsTable } from "@/components/billing/payments-table";
import { PaymentPostForm } from "@/components/billing/payment-post-form";
import { EnrollmentIncidentsSection } from "@/components/billing/enrollment-incidents-section";
import { getPrinterName } from "@/lib/queries/settings";
import { postEnrollmentPaymentAction } from "@/server/actions/payments";
import {
  cancelEnrollmentIncidentAction,
  createEnrollmentIncidentAction,
  replaceEnrollmentIncidentAction,
  voidChargeAction,
  voidPaymentAction,
} from "@/server/actions/billing";
import type { ActiveIncident } from "@/lib/incidents";

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return d ? `${d}/${m}/${y}` : dateStr;
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  });
}

function formatDuration(startDate: string | null | undefined, endDate: string | null | undefined) {
  if (!startDate || !endDate) return "-";
  const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "-";
  return `${Math.floor(diffMs / (1000 * 60 * 60 * 24))} dias`;
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function activeIncidentSummary(
  incident: {
    label: string;
    startsOn: string | null;
    endsOn: string | null;
  } | null,
) {
  if (!incident) return null;
  if (incident.startsOn && incident.endsOn) {
    return `${incident.label} del ${fmtDate(incident.startsOn)} al ${fmtDate(incident.endsOn)}`;
  }
  if (incident.endsOn) {
    return `${incident.label} hasta ${fmtDate(incident.endsOn)}`;
  }
  return incident.label;
}

const DROPOUT_LABELS: Record<string, string> = {
  coach_capability: "Falta de capacidad del entrenador",
  exercise_difficulty: "Dificultad para realizar los ejercicios",
  financial: "Financiero",
  training_quality: "Falta de calidad en el entrenamiento",
  school_disorganization: "Desorganizacion de la escuela",
  facility_safety: "Falta de seguridad en instalaciones",
  transport: "Incompatibilidad de transportes",
  family_health: "Salud de familiares",
  player_health: "Salud del alumno",
  schedule_conflict: "Incompatibilidad de horarios",
  coach_communication: "Comunicacion del entrenador",
  wants_competition: "Quiere pasar a competicion",
  lack_of_information: "Falta de informacion",
  pedagogy: "Falta de pedagogia",
  moved_to_competition_club: "Cambio a club de competicion",
  player_coach_relationship: "Relacion alumno-entrenador",
  unattractive_exercises: "Ejercicios poco atractivos",
  moved_residence: "Cambio de residencia",
  school_performance_punishment: "Castigo por rendimiento escolar",
  home_behavior_punishment: "Castigo por comportamiento en casa",
  personal: "Motivos personales",
  distance: "Distancia / logistica",
  parent_work: "Trabajo del padre o madre",
  injury: "Lesion",
  dislikes_football: "No le gusta el futbol",
  lost_contact: "Sin contacto con los padres",
  low_peer_attendance: "Poca asistencia de companeros",
  changed_sport: "Cambio de deporte",
  did_not_return: "Ya no regreso",
  temporary_leave: "Baja temporal - piensa regresar",
  moved_to_another_academy: "Cambio a otra academia",
  school_schedule_conflict: "Complicaciones horario escolar",
  coach_change: "Cambio de profe",
  cold_weather: "Clima frio",
  other: "Otros",
};

function SummaryChip({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";
}) {
  const styles: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  };

  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>{label}</span>;
}

function getUniformSummary(orders: Array<{ status: string }>) {
  if (orders.length === 0) return { label: "Sin uniformes", tone: "slate" as const };
  if (orders.some((order) => order.status === "pending_order" || order.status === "ordered")) {
    return { label: "Uniforme pendiente", tone: "amber" as const };
  }
  return { label: "Uniforme OK", tone: "emerald" as const };
}

function EnrollmentHistoryCard({
  enrollment,
  playerId,
}: {
  enrollment: {
    id: string;
    status: string;
    startDate: string;
    endDate: string | null;
    inscriptionDate: string;
    dropoutReason: string | null;
    dropoutNotes: string | null;
    campusName: string;
    campusCode: string;
    pricingPlanName: string;
    currency: string;
    totalCharges: number;
    totalPayments: number;
    balance: number;
  };
  playerId: string;
}) {
  const balanceTone =
    enrollment.balance > 0 ? "amber" : enrollment.balance < 0 ? "emerald" : "slate";

  return (
    <details className="group rounded-md border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900 dark:text-slate-100">{enrollment.campusName}</p>
            <SummaryChip label={enrollment.status === "active" ? "Activa" : "Historica"} tone="slate" />
            <SummaryChip
              label={enrollment.balance > 0 ? "Saldo pendiente" : enrollment.balance < 0 ? "Credito" : "Al corriente"}
              tone={balanceTone}
            />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {fmtDate(enrollment.startDate)} - {fmtDate(enrollment.endDate)} | {enrollment.pricingPlanName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          <span>{formatDuration(enrollment.startDate, enrollment.endDate)}</span>
          <span>{formatMoney(enrollment.balance, enrollment.currency)}</span>
          <span className="text-portoBlue group-open:hidden">Expandir</span>
          <span className="hidden text-portoBlue group-open:inline">Ocultar</span>
        </div>
      </summary>
      <div className="grid gap-4 border-t border-slate-200 px-4 py-4 dark:border-slate-700 md:grid-cols-4">
        <div>
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Campus</p>
          <p className="font-medium">
            {enrollment.campusName} ({enrollment.campusCode})
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inscripcion</p>
          <p className="font-medium">{fmtDate(enrollment.inscriptionDate)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Total cargos</p>
          <p className="font-medium">{formatMoney(enrollment.totalCharges, enrollment.currency)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Total pagos</p>
          <p className="font-medium">{formatMoney(enrollment.totalPayments, enrollment.currency)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Saldo final</p>
          <p className={`font-semibold ${enrollment.balance > 0 ? "text-rose-600" : enrollment.balance < 0 ? "text-emerald-600" : ""}`}>
            {formatMoney(enrollment.balance, enrollment.currency)}
          </p>
        </div>
        <div className="md:col-span-3">
          <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Motivo de baja</p>
          <p className="font-medium">
            {enrollment.dropoutReason
              ? DROPOUT_LABELS[enrollment.dropoutReason] ?? enrollment.dropoutReason
              : "Sin motivo registrado"}
          </p>
          {enrollment.dropoutNotes ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{enrollment.dropoutNotes}</p>
          ) : null}
        </div>
        <div className="md:col-span-4">
          <Link
            href={`/enrollments/${enrollment.id}/charges`}
            className="text-sm font-medium text-portoBlue hover:underline"
          >
            Abrir cuenta historica
          </Link>
        </div>
      </div>
    </details>
  );
}

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ ok?: string; err?: string; nuked?: string }>;
}) {
  const { playerId } = await params;
  const sp = await searchParams;
  const player = await getPlayerDetail(playerId);
  const permissionContext = await getPermissionContext();
  const campusAccess = await getOperationalCampusAccess();
  const printerName = await getPrinterName();
  const isSuperAdmin = permissionContext?.isSuperAdmin ?? false;
  const isDirector = permissionContext?.isDirector ?? false;

  if (!player) notFound();

  const activeEnrollment = player.activeEnrollment;
  const archiveEnrollment = player.latestEndedEnrollment;
  const activeEnrollmentId = activeEnrollment?.id ?? null;
  const activeLedger = player.activeEnrollmentLedger;
  const uniformOrders = activeEnrollmentId ? await getUniformOrdersAction(activeEnrollmentId) : [];
  const activeIncident = player.activeIncident as ActiveIncident | null;
  const incidentSummary = activeIncidentSummary(activeIncident);
  const primaryGuardian = player.guardians[0] ?? null;
  const uniformSummary = getUniformSummary(uniformOrders);
  const profileBalance = activeLedger?.totals.balance ?? activeEnrollment?.balance ?? archiveEnrollment?.balance ?? 0;
  const balanceTone =
    profileBalance > 0
      ? "amber"
      : profileBalance < 0
        ? "emerald"
        : "slate";

  const successMessage =
    sp.ok === "updated"
      ? "Datos del jugador actualizados."
      : sp.ok === "guardian_updated"
        ? "Datos del tutor actualizados."
        : sp.ok === "merged"
          ? "Jugadores fusionados correctamente. Este es el registro master."
          : sp.ok === "dropped"
            ? "Inscripcion dada de baja correctamente."
          : null;

  const postPayment = activeEnrollmentId ? postEnrollmentPaymentAction.bind(null, activeEnrollmentId) : null;
  const createIncident = activeEnrollmentId ? createEnrollmentIncidentAction.bind(null, activeEnrollmentId) : null;
  const cancelIncident = activeEnrollmentId ? cancelEnrollmentIncidentAction.bind(null, activeEnrollmentId) : null;
  const replaceIncident = activeEnrollmentId ? replaceEnrollmentIncidentAction.bind(null, activeEnrollmentId) : null;
  const voidCharge = activeEnrollmentId && isDirector ? voidChargeAction.bind(null, activeEnrollmentId) : undefined;
  const voidPayment = activeEnrollmentId && isDirector ? voidPaymentAction.bind(null, activeEnrollmentId) : undefined;

  return (
    <PageShell
      title={player.fullName}
      wide
      breadcrumbs={[{ label: "Jugadores", href: "/players" }, { label: player.fullName }]}
    >
      <div className="space-y-6">
        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200">
            {successMessage}
          </div>
        ) : null}

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {activeEnrollment
                    ? `${activeEnrollment.campusName} (${activeEnrollment.campusCode})`
                    : archiveEnrollment
                      ? `${archiveEnrollment.campusName} (${archiveEnrollment.campusCode})`
                      : "Sin inscripcion activa"}
                </p>
                <h2 className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{player.fullName}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Nacimiento: {fmtDate(player.birthDate)} {primaryGuardian ? `| Tutor principal: ${primaryGuardian.first_name} ${primaryGuardian.last_name}` : ""}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <SummaryChip label={activeEnrollment ? "Activo" : "Baja"} tone={activeEnrollment ? "emerald" : "slate"} />
                {(activeEnrollment ?? archiveEnrollment) ? (
                  <SummaryChip label={(activeEnrollment ?? archiveEnrollment)!.campusName} tone="blue" />
                ) : null}
                {player.activeTeam?.name ? <SummaryChip label={player.activeTeam.name} tone="blue" /> : null}
                {player.activeTeam?.level ? <SummaryChip label={`Nivel ${player.activeTeam.level}`} tone="violet" /> : null}
                {player.isGoalkeeper ? <SummaryChip label="Portero" tone="violet" /> : null}
                {activeIncident ? (
                  <SummaryChip label={activeIncident.type === "injury" ? "Lesion activa" : "Ausencia activa"} tone={activeIncident.type === "injury" ? "rose" : "blue"} />
                ) : null}
                {activeEnrollment ? <SummaryChip label={uniformSummary.label} tone={uniformSummary.tone} /> : null}
                <SummaryChip
                  label={
                    profileBalance > 0
                      ? "Saldo pendiente"
                      : profileBalance < 0
                        ? "Credito"
                        : "Al corriente"
                  }
                  tone={balanceTone}
                />
              </div>

              {incidentSummary ? (
                <div
                  className={`inline-flex rounded-md border px-3 py-2 text-sm ${
                    activeIncident?.type === "injury"
                      ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200"
                      : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-sky-200"
                  }`}
                >
                  {incidentSummary}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 xl:max-w-[30rem] xl:justify-end">
              {activeEnrollmentId ? (
                <a
                  href="#cuenta-actual"
                  className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
                >
                  Registrar pago
                </a>
              ) : (
                <Link
                  href={`/players/${player.id}/enrollments/new`}
                  className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
                >
                  Nueva inscripcion
                </Link>
              )}
              {activeEnrollmentId ? (
                <Link
                  href={`/caja?enrollmentId=${activeEnrollmentId}`}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Abrir Caja
                </Link>
              ) : null}
              {activeEnrollmentId ? (
                <Link
                  href={`/players/${player.id}/enrollments/${activeEnrollmentId}/edit`}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Editar inscripcion
                </Link>
              ) : null}
              {activeEnrollmentId ? (
                <Link
                  href={`/players/${player.id}/enrollments/${activeEnrollmentId}/dropout`}
                  className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950"
                >
                  Dar de baja
                </Link>
              ) : null}
              {!activeEnrollmentId && archiveEnrollment ? (
                <Link
                  href={`/enrollments/${archiveEnrollment.id}/charges`}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Ver cuenta anterior
                </Link>
              ) : null}
              {!activeEnrollmentId && archiveEnrollment?.balance && archiveEnrollment.balance > 0 ? (
                <Link
                  href="/pending/bajas"
                  className="rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
                >
                  Ir a Bajas y saldos pendientes
                </Link>
              ) : null}
              <Link
                href={`/players/${player.id}/edit`}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Editar jugador
              </Link>
              {isSuperAdmin ? (
                <Link
                  href={`/players/${player.id}/nuke`}
                  className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950"
                >
                  Eliminar todo
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ficha del jugador</h3>
              {primaryGuardian?.phone_primary ? (
                <a
                  href={`tel:${primaryGuardian.phone_primary}`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Llamar tutor
                </a>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Genero</p>
                <p className="font-medium">
                  {player.gender === "male" ? "Masculino" : player.gender === "female" ? "Femenino" : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Talla de uniforme</p>
                <p className="font-medium">{player.uniformSize ?? "Sin registrar"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Numero</p>
                <p className="font-medium">{player.jerseyNumber != null ? `#${player.jerseyNumber}` : "-"}</p>
              </div>
              <div className="md:col-span-2 xl:col-span-3">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Notas medicas</p>
                <p className="font-medium">{player.medicalNotes ?? "-"}</p>
              </div>
              {activeEnrollment ? (
                <>
                  <div>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Equipo</p>
                    <p className="font-medium">{player.activeTeam?.name ?? "Sin equipo"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Coach</p>
                    <p className="font-medium">{player.activeTeam?.coachName ?? "Sin asignar"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Plan actual</p>
                    <p className="font-medium">{activeEnrollment.pricingPlanName}</p>
                  </div>
                </>
              ) : archiveEnrollment ? (
                <>
                  <div>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Ultimo campus</p>
                    <p className="font-medium">
                      {archiveEnrollment.campusName} ({archiveEnrollment.campusCode})
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Periodo</p>
                    <p className="font-medium">
                      {fmtDate(archiveEnrollment.startDate)} - {fmtDate(archiveEnrollment.endDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Saldo pendiente</p>
                    <p className={`font-medium ${archiveEnrollment.balance > 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>
                      {formatMoney(archiveEnrollment.balance, archiveEnrollment.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Motivo de baja</p>
                    <p className="font-medium">
                      {archiveEnrollment.dropoutReason
                        ? DROPOUT_LABELS[archiveEnrollment.dropoutReason] ?? archiveEnrollment.dropoutReason
                        : "Sin motivo registrado"}
                    </p>
                  </div>
                  <div className="md:col-span-2 xl:col-span-2">
                    <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Notas de baja</p>
                    <p className="font-medium">{archiveEnrollment.dropoutNotes ?? "-"}</p>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Tutores y contacto</h3>
              {player.guardians.length > 0 ? (
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {player.guardians.length} tutor{player.guardians.length !== 1 ? "es" : ""}
                </span>
              ) : null}
            </div>
            {player.guardians.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No hay tutores vinculados.</p>
            ) : (
              <div className="grid gap-3">
                {player.guardians.map((guardian) => (
                  <div key={guardian.id} className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-slate-900 dark:text-slate-100">
                          {guardian.first_name} {guardian.last_name}
                        </p>
                        {guardian.isPrimary ? <SummaryChip label="Principal" tone="blue" /> : null}
                      </div>
                      <Link
                        href={`/players/${player.id}/guardians/${guardian.id}/edit`}
                        className="text-sm font-medium text-portoBlue hover:underline"
                      >
                        Editar
                      </Link>
                    </div>
                    <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                      <div>
                        <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Telefono principal</p>
                        <p className="font-medium">{guardian.phone_primary}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Telefono secundario</p>
                        <p className="font-medium">{guardian.phone_secondary ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Email</p>
                        <p className="font-medium">{guardian.email ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Parentesco</p>
                        <p className="font-medium">{guardian.relationship_label ?? "-"}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {activeLedger ? (
          <section id="cuenta-actual" className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cuenta actual</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Vista completa de la inscripcion activa, cargos, pagos e incidencias.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/enrollments/${activeEnrollmentId}/charges`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Ver cuenta dedicada
                </Link>
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 md:grid-cols-4">
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Campus</p>
                  <p className="font-medium">{activeLedger.enrollment.campusName}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Plan</p>
                  <p className="font-medium">{activeEnrollment?.pricingPlanName ?? "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inicio</p>
                  <p className="font-medium">{fmtDate(activeLedger.enrollment.startDate)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Ultimo pago</p>
                  <p className="font-medium">{activeLedger.payments[0] ? fmtDateTime(activeLedger.payments[0].paidAt) : "-"}</p>
                </div>
              </div>

              <LedgerSummaryCards
                currency={activeLedger.enrollment.currency}
                totalCharges={activeLedger.totals.totalCharges}
                totalPayments={activeLedger.totals.totalPayments}
                balance={activeLedger.totals.balance}
              />

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <div className="space-y-5">
                  {postPayment && campusAccess ? (
                    <PaymentPostForm
                      currentBalance={activeLedger.totals.balance}
                      currency={activeLedger.enrollment.currency}
                      action={postPayment}
                      printerName={printerName}
                      playerCampusId={activeLedger.enrollment.campusId}
                      playerCampusName={activeLedger.enrollment.campusName}
                      allowedCampuses={campusAccess.campuses}
                      defaultCampusId={campusAccess.defaultCampusId ?? activeLedger.enrollment.campusId}
                    />
                  ) : null}
                </div>

                {createIncident && cancelIncident && replaceIncident ? (
                  <EnrollmentIncidentsSection
                    rows={activeLedger.incidents}
                    createAction={createIncident}
                    cancelAction={cancelIncident}
                    replaceAction={replaceIncident}
                    canManage={permissionContext?.hasOperationalAccess ?? false}
                    defaultMonth={getCurrentMonthValue()}
                  />
                ) : null}
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <section className="space-y-2">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">Cargos</h4>
                  <ChargesLedgerTable rows={activeLedger.charges} voidChargeAction={voidCharge} />
                </section>
                <section className="space-y-2">
                  <h4 className="text-base font-semibold text-slate-900 dark:text-slate-100">Pagos</h4>
                  <PaymentsTable rows={activeLedger.payments} voidPaymentAction={voidPayment} />
                </section>
              </div>
            </div>
          </section>
        ) : archiveEnrollment ? (
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Archivo del jugador</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Esta ficha ya no tiene inscripcion activa. Usa este resumen para contexto historico y reingreso.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/enrollments/${archiveEnrollment.id}/charges`}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                >
                  Ver cuenta anterior
                </Link>
                <Link
                  href={`/players/${player.id}/enrollments/new`}
                  className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
                >
                  Nueva inscripcion
                </Link>
              </div>
            </div>

            <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60 md:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Ultimo campus</p>
                <p className="font-medium">{archiveEnrollment.campusName}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Inicio</p>
                <p className="font-medium">{fmtDate(archiveEnrollment.startDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Baja</p>
                <p className="font-medium">{fmtDate(archiveEnrollment.endDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Saldo pendiente</p>
                <p className={`font-medium ${archiveEnrollment.balance > 0 ? "text-amber-700 dark:text-amber-300" : ""}`}>
                  {formatMoney(archiveEnrollment.balance, archiveEnrollment.currency)}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
              <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Motivo de baja</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                  {archiveEnrollment.dropoutReason
                    ? DROPOUT_LABELS[archiveEnrollment.dropoutReason] ?? archiveEnrollment.dropoutReason
                    : "Sin motivo registrado"}
                </p>
                {archiveEnrollment.dropoutNotes ? (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{archiveEnrollment.dropoutNotes}</p>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Siguiente paso</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {archiveEnrollment.balance > 0
                    ? "Este jugador ya esta de baja, pero aun conserva saldo pendiente. La baja no anula cargos automaticamente."
                    : "Este jugador ya esta archivado y sin saldo pendiente. Si regresa, crea una nueva inscripcion."}
                </p>
                {archiveEnrollment.balance > 0 ? (
                  <Link
                    href="/pending/bajas"
                    className="mt-3 inline-flex rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
                  >
                    Ir a Bajas y saldos pendientes
                  </Link>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {activeEnrollmentId ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
            <UniformOrdersSection enrollmentId={activeEnrollmentId} initialOrders={uniformOrders} />
          </div>
        ) : null}

        {!activeEnrollment ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Historial de inscripciones</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Resumen historico del jugador. Expande cada tarjeta solo cuando necesites mas contexto.
              </p>
            </div>
            {!activeEnrollment ? (
              <Link
                href={`/players/${player.id}/enrollments/new`}
                className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
              >
                Nueva inscripcion
              </Link>
            ) : null}
          </div>

          {player.historicalEnrollments.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Aun no hay inscripciones historicas visibles.</p>
          ) : (
            <div className="space-y-3">
              {player.historicalEnrollments.map((enrollment) => (
                <EnrollmentHistoryCard key={enrollment.id} enrollment={enrollment} playerId={player.id} />
              ))}
            </div>
          )}
        </section>
        ) : null}
      </div>
    </PageShell>
  );
}
