import { formatPeriodMonthLabel } from "@/lib/pricing/plans";
import { formatDateTimeMonterrey } from "@/lib/time";
import type {
  EnrollmentFinanceAllocationWarning,
  EnrollmentFinanceChargeDiagnostic,
  EnrollmentFinanceDiagnostics,
  EnrollmentFinanceMonthlyWarning,
  EnrollmentFinancePaymentDiagnostic,
  EnrollmentFinanceSummaryFlag,
} from "@/lib/queries/enrollment-finance-diagnostics";
import { EnrollmentFinanceCorrectionToolkit } from "@/components/billing/enrollment-finance-correction-toolkit";

function formatMoney(amount: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function healthTone(health: EnrollmentFinanceDiagnostics["health"]) {
  switch (health) {
    case "healthy":
      return {
        badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
        border: "border-emerald-200 dark:border-emerald-800",
      };
    case "warning":
      return {
        badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-800",
      };
    default:
      return {
        badge: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
        border: "border-rose-200 dark:border-rose-800",
      };
  }
}

function healthLabel(health: EnrollmentFinanceDiagnostics["health"]) {
  switch (health) {
    case "healthy":
      return "Sano";
    case "warning":
      return "Advertencia";
    default:
      return "Requiere correccion";
  }
}

function toneClass(tone: EnrollmentFinanceSummaryFlag["tone"]) {
  const tones: Record<EnrollmentFinanceSummaryFlag["tone"], string> = {
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300",
    rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300",
  };
  return tones[tone];
}

function severityClass(severity: "warning" | "needs_correction") {
  return severity === "needs_correction"
    ? "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30"
    : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30";
}

function getPaymentMethodLabel(method: string) {
  switch (method) {
    case "cash":
      return "Efectivo";
    case "transfer":
      return "Transferencia";
    case "card":
      return "Tarjeta";
    case "stripe_360player":
      return "360Player";
    case "other":
      return "Otro";
    default:
      return method;
  }
}

function DiagnosticSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-700">
      <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</h4>
      {children}
    </section>
  );
}

function PaymentDiagnosticItem({ item }: { item: EnrollmentFinancePaymentDiagnostic }) {
  return (
    <div className={`rounded-md border p-3 ${severityClass(item.severity)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Pago {item.paymentId}</span>
      </div>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.detail}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {formatDateTimeMonterrey(item.paidAt)} · {getPaymentMethodLabel(item.method)} · {formatMoney(item.amount)} · aplicado {formatMoney(item.allocatedAmount)}
      </p>
    </div>
  );
}

function ChargeDiagnosticItem({ item }: { item: EnrollmentFinanceChargeDiagnostic }) {
  return (
    <div className={`rounded-md border p-3 ${severityClass(item.severity)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Cargo {item.chargeId}</span>
      </div>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.description}</p>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.detail}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        {item.periodMonth ? `${formatPeriodMonthLabel(item.periodMonth)} · ` : ""}
        estatus {item.status} · {formatMoney(item.amount)} · aplicado {formatMoney(item.allocatedAmount)} · pendiente {formatMoney(item.pendingAmount)}
      </p>
    </div>
  );
}

function MonthlyWarningItem({ item }: { item: EnrollmentFinanceMonthlyWarning }) {
  return (
    <div className={`rounded-md border p-3 ${severityClass(item.severity)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{formatPeriodMonthLabel(item.periodMonth)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.detail}</p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Cargos: {item.chargeIds.join(", ")}</p>
    </div>
  );
}

function AllocationWarningItem({ item }: { item: EnrollmentFinanceAllocationWarning }) {
  return (
    <div className={`rounded-md border p-3 ${severityClass(item.severity)}`}>
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{item.detail}</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
      {label}
    </div>
  );
}

export function EnrollmentFinanceDiagnosticPanel({
  enrollmentId,
  diagnostics,
  compact = false,
  toolkit,
}: {
  enrollmentId: string;
  diagnostics: EnrollmentFinanceDiagnostics;
  compact?: boolean;
  toolkit?: {
    currency: string;
    charges: Array<{
      id: string;
      typeCode: string;
      typeName: string;
      description: string;
      amount: number;
      currency: string;
      status: string;
      allocatedAmount: number;
      pendingAmount: number;
      isCorrection: boolean;
      correctionKind: "corrective_charge" | "balance_adjustment" | null;
      isNonCash: boolean;
    }>;
    payments: Array<{
      id: string;
      paidAt: string;
      method: string;
      amount: number;
      allocatedAmount: number;
      status: string;
      refundStatus: "not_refunded" | "refunded";
      sourceCharges: Array<{
        chargeId: string;
        description: string;
        amount: number;
        allocatedAmount: number;
      }>;
    }>;
    createCorrectiveChargeAction: (formData: FormData) => Promise<void>;
    createBalanceAdjustmentAction: (formData: FormData) => Promise<void>;
    repairPaymentAllocationsAction: (formData: FormData) => Promise<void>;
  };
}) {
  const health = healthTone(diagnostics.health);
  const allAlerts = [
    ...diagnostics.paymentDiagnostics.map((item) => ({
      key: `payment-${item.paymentId}`,
      severity: item.severity,
      title: item.title,
      detail: item.detail,
    })),
    ...diagnostics.chargeDiagnostics.map((item) => ({
      key: `charge-${item.chargeId}`,
      severity: item.severity,
      title: item.title,
      detail: item.detail,
    })),
    ...diagnostics.monthlyTuitionWarnings.map((item) => ({
      key: item.key,
      severity: item.severity,
      title: item.title,
      detail: item.detail,
    })),
    ...diagnostics.allocationWarnings.map((item) => ({
      key: item.key,
      severity: item.severity,
      title: item.title,
      detail: item.detail,
    })),
  ];
  const prefilledPaymentIds = diagnostics.paymentDiagnostics.map((item) => item.paymentId);
  const prefilledChargeIds = Array.from(
    new Set([
      ...diagnostics.chargeDiagnostics.map((item) => item.chargeId),
      ...diagnostics.monthlyTuitionWarnings.flatMap((item) => item.chargeIds),
      ...(toolkit?.payments ?? [])
        .filter((payment) => prefilledPaymentIds.includes(payment.id))
        .flatMap((payment) => payment.sourceCharges.map((charge) => charge.chargeId)),
    ]),
  );

  return (
    <details className={`rounded-xl border bg-white dark:bg-slate-900 ${health.border} ${compact ? "p-0" : "p-0"}`}>
      <summary className={`flex cursor-pointer list-none flex-col gap-3 px-4 py-3 ${compact ? "sm:flex-col" : "sm:flex-row sm:items-center sm:justify-between"}`}>
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Diagn\u00f3stico financiero</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Lectura can\u00f3nica de la cuenta para entender por qu\u00e9 el ledger puede sentirse raro.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${health.badge}`}>{healthLabel(diagnostics.health)}</span>
          <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">
            {diagnostics.issueCount} alerta{diagnostics.issueCount === 1 ? "" : "s"}
          </span>
          <span className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 dark:border-slate-600 dark:text-slate-300">
            Saldo can\u00f3nico {formatMoney(diagnostics.canonicalBalance)}
          </span>
        </div>
      </summary>

      <div className="space-y-4 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
        <DiagnosticSection title="Resumen canonico">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldo can\u00f3nico</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{formatMoney(diagnostics.canonicalBalance)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldo ledger</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{formatMoney(diagnostics.ledgerTotals.currentBalance)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldo derivado</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{formatMoney(diagnostics.ledgerTotals.derivedOperationalBalance)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Cr\u00e9dito libre</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{formatMoney(diagnostics.ledgerTotals.unappliedPostedAmount)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Reembolsos</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{formatMoney(diagnostics.ledgerTotals.refundedPaymentTotal)}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Cargos anulados</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{diagnostics.ledgerTotals.voidedChargeCount}</p>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {diagnostics.summaryFlags.map((flag) => (
              <div key={flag.key} className={`rounded-md border px-3 py-2 ${toneClass(flag.tone)}`}>
                <p className="text-sm font-semibold">{flag.label}</p>
                <p className="mt-1 text-sm opacity-90">{flag.detail}</p>
              </div>
            ))}
          </div>
        </DiagnosticSection>

        <DiagnosticSection title="Pagos y asignaciones">
          <div className="space-y-3">
            {diagnostics.paymentDiagnostics.map((item) => (
              <PaymentDiagnosticItem key={item.paymentId} item={item} />
            ))}
            {diagnostics.allocationWarnings.map((item) => (
              <AllocationWarningItem key={item.key} item={item} />
            ))}
            {diagnostics.paymentDiagnostics.length === 0 && diagnostics.allocationWarnings.length === 0 ? (
              <EmptyState label="Sin alertas activas en pagos y asignaciones." />
            ) : null}
          </div>
        </DiagnosticSection>

        <DiagnosticSection title="Cargos y mensualidades">
          <div className="space-y-3">
            {diagnostics.chargeDiagnostics.map((item) => (
              <ChargeDiagnosticItem key={item.chargeId} item={item} />
            ))}
            {diagnostics.monthlyTuitionWarnings.map((item) => (
              <MonthlyWarningItem key={item.key} item={item} />
            ))}
            {diagnostics.chargeDiagnostics.length === 0 && diagnostics.monthlyTuitionWarnings.length === 0 ? (
              <EmptyState label="Sin alertas activas en cargos y mensualidades." />
            ) : null}
          </div>
        </DiagnosticSection>

        <DiagnosticSection title="Alertas de correccion">
          {allAlerts.length === 0 ? (
            <EmptyState label="No hay alertas abiertas; esta cuenta no requiere correcci\u00f3n manual en esta revisi\u00f3n." />
          ) : (
            <div className="space-y-2">
              {allAlerts.map((alert) => (
                <div key={`${enrollmentId}-${alert.key}`} className={`rounded-md border px-3 py-2 ${severityClass(alert.severity)}`}>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{alert.title}</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{alert.detail}</p>
                </div>
              ))}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Esta vista solo diagnostica. Las correcciones quedan para el toolkit restringido de superadmin.
              </p>
            </div>
          )}
        </DiagnosticSection>

        {toolkit ? (
          <EnrollmentFinanceCorrectionToolkit
            currency={toolkit.currency}
            canonicalBalance={diagnostics.canonicalBalance}
            charges={toolkit.charges}
            payments={toolkit.payments}
            prefilledPaymentIds={prefilledPaymentIds}
            prefilledChargeIds={prefilledChargeIds}
            createCorrectiveChargeAction={toolkit.createCorrectiveChargeAction}
            createBalanceAdjustmentAction={toolkit.createBalanceAdjustmentAction}
            repairPaymentAllocationsAction={toolkit.repairPaymentAllocationsAction}
          />
        ) : null}
      </div>
    </details>
  );
}
