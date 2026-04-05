import { PageShell } from "@/components/ui/page-shell";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getOperationalCampusAccess } from "@/lib/auth/campuses";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getEnrollmentLedger } from "@/lib/queries/billing";
import { LedgerSummaryCards } from "@/components/billing/ledger-summary-cards";
import { ChargesLedgerTable } from "@/components/billing/charges-ledger-table";
import { PaymentsTable } from "@/components/billing/payments-table";
import { PaymentPostForm } from "@/components/billing/payment-post-form";
import { EnrollmentIncidentsSection } from "@/components/billing/enrollment-incidents-section";
import { postEnrollmentPaymentAction } from "@/server/actions/payments";
import {
  cancelEnrollmentIncidentAction,
  createEnrollmentIncidentAction,
  replaceEnrollmentIncidentAction,
  voidChargeAction,
  voidPaymentAction,
} from "@/server/actions/billing";
import { getPrinterName } from "@/lib/queries/settings";

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del pago son invalidos. Revisa monto y metodo.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  enrollment_not_found: "No se encontro la inscripcion.",
  no_pending_charges: "No hay cargos pendientes en esta cuenta.",
  payment_insert_failed: "No se pudo registrar el pago. Intenta de nuevo.",
  allocation_insert_failed: "No se pudieron guardar las asignaciones del pago. Intenta de nuevo.",
  charge_not_found: "Cargo no encontrado o ya fue anulado.",
  payment_not_found: "Pago no encontrado o ya fue anulado.",
  void_reason_required: "Debes escribir el motivo de anulacion.",
  void_failed: "No se pudo anular. Intenta de nuevo.",
  unauthorized: "No tienes permiso para anular.",
  invalid_incident: "Los datos de la incidencia no son válidos.",
  incident_type_required: "Selecciona un tipo de incidencia.",
  incident_month_required: "Selecciona el mes a omitir.",
  incident_date_invalid: "La fecha de ausencia o lesión no es válida.",
  incident_start_required: "Si capturas una fecha final, también debes capturar la fecha inicial.",
  incident_date_range_invalid: "La fecha final no puede ser anterior a la fecha inicial.",
  incident_past_month: "Solo puedes omitir el mes actual o uno futuro.",
  incident_charge_exists: "Ese mes ya tiene una mensualidad registrada; la omisión ya no aplica.",
  incident_conflict: "Ya existe una omisión activa para ese mes.",
  incident_not_found: "Incidencia no encontrada o ya cerrada.",
  incident_cancel_failed: "No se pudo cancelar la incidencia.",
  incident_replace_failed: "No se pudo reemplazar la incidencia.",
  incident_inactive_enrollment: "Solo se pueden registrar incidencias en inscripciones activas.",
};

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default async function ChargesPage({
  params,
  searchParams
}: {
  params: Promise<{ enrollmentId: string }>;
  searchParams: Promise<{ ok?: string; err?: string }>;
}) {
  const { enrollmentId } = await params;
  const query = await searchParams;
  const ledger = await getEnrollmentLedger(enrollmentId);

  if (!ledger) notFound();

  const permissionContext = await getPermissionContext();
  const printerName = await getPrinterName();
  const campusAccess = await getOperationalCampusAccess();
  const isDirector = permissionContext?.isDirector ?? false;

  const subtitle = `${ledger.enrollment.playerName} | ${ledger.enrollment.campusName} (${ledger.enrollment.campusCode})`;

  const postPayment = postEnrollmentPaymentAction.bind(null, enrollmentId);
  const createIncident = createEnrollmentIncidentAction.bind(null, enrollmentId);
  const cancelIncident = cancelEnrollmentIncidentAction.bind(null, enrollmentId);
  const replaceIncident = replaceEnrollmentIncidentAction.bind(null, enrollmentId);
  const voidCharge = isDirector
    ? voidChargeAction.bind(null, enrollmentId)
    : undefined;
  const voidPayment = isDirector
    ? voidPaymentAction.bind(null, enrollmentId)
    : undefined;

  const successMessage =
    query.ok === "payment_posted"
      ? "Pago registrado correctamente."
      : query.ok === "charge_created"
      ? "Cargo creado correctamente."
      : query.ok === "incident_created"
      ? "Incidencia registrada correctamente."
      : query.ok === "incident_cancelled"
      ? "Incidencia cancelada correctamente."
      : query.ok === "incident_replaced"
      ? "Incidencia reemplazada correctamente."
      : query.ok === "charge_voided"
      ? "Cargo anulado correctamente."
      : query.ok === "payment_voided"
      ? "Pago anulado. Los cargos asociados quedaron pendientes."
      : null;
  const errorMessage = query.err ? errorMessages[query.err] ?? "Ocurrio un error." : null;

  return (
    <PageShell title="Cargos y cuenta" subtitle={subtitle}>
      <div className="space-y-5">
        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {successMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{errorMessage}</div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-sm">
          <p>
            Inscripcion: <span className="font-medium">{ledger.enrollment.id}</span>
          </p>
          <div className="flex gap-2">
            <Link
              href={`/enrollments/${ledger.enrollment.id}/charges/new`}
              className="rounded-md bg-portoBlue px-3 py-1.5 font-medium text-white hover:bg-portoDark"
            >
              Nuevo cargo
            </Link>
          </div>
        </div>

        <LedgerSummaryCards
          currency={ledger.enrollment.currency}
          totalCharges={ledger.totals.totalCharges}
          totalPayments={ledger.totals.totalPayments}
          balance={ledger.totals.balance}
        />

        <EnrollmentIncidentsSection
          rows={ledger.incidents}
          createAction={createIncident}
          cancelAction={cancelIncident}
          replaceAction={replaceIncident}
          canManage={permissionContext?.hasOperationalAccess ?? false}
          defaultMonth={getCurrentMonthValue()}
        />

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Cargos</h2>
          <ChargesLedgerTable rows={ledger.charges} voidChargeAction={voidCharge} />
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Pagos</h2>
          <PaymentPostForm
            currentBalance={ledger.totals.balance}
            currency={ledger.enrollment.currency}
            action={postPayment}
            printerName={printerName}
            playerCampusId={ledger.enrollment.campusId}
            playerCampusName={ledger.enrollment.campusName}
            allowedCampuses={campusAccess?.campuses ?? []}
            defaultCampusId={campusAccess?.defaultCampusId ?? ledger.enrollment.campusId}
          />
          <PaymentsTable rows={ledger.payments} voidPaymentAction={voidPayment} />
        </section>
      </div>
    </PageShell>
  );
}
