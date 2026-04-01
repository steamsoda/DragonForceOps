import { MONTH_NAMES_ES } from "@/lib/billing/generate-monthly-charges";

export const EXTERNAL_PAYMENT_STATUS_LABELS = {
  unmatched: "Pendiente",
  matched: "Conciliado",
  ignored: "Ignorado",
  refunded: "Reembolsado",
} as const;

export type ExternalPaymentStatus = keyof typeof EXTERNAL_PAYMENT_STATUS_LABELS;

const MONTH_NAME_TO_NUMBER: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

export function normalizeExternalName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenizeExternalName(value: string | null | undefined) {
  return normalizeExternalName(value)
    .split(" ")
    .filter((token) => token.length >= 2);
}

export function parseInvoiceTuitionPeriodMonth(description: string | null | undefined) {
  const normalized = normalizeExternalName(description);
  const match = /mensualidad\s+([a-z]+)\s+(\d{4})/.exec(normalized);
  if (!match) return null;

  const month = MONTH_NAME_TO_NUMBER[match[1]];
  if (!month) return null;

  return `${match[2]}-${month}-01`;
}

export function formatPeriodMonthLabel(periodMonth: string | null | undefined) {
  if (!periodMonth) return "-";
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodMonth);
  if (!match) return periodMonth;

  const monthIndex = Number(match[2]) - 1;
  return `${MONTH_NAMES_ES[monthIndex] ?? match[2]} ${match[1]}`;
}

export function buildExternalPaymentRef(input: {
  providerInvoiceId?: string | null;
  stripeInvoiceId?: string | null;
  stripeChargeId?: string | null;
  invoiceNumber?: string | null;
}) {
  const candidate =
    input.providerInvoiceId?.trim() ||
    input.stripeInvoiceId?.trim() ||
    input.stripeChargeId?.trim() ||
    input.invoiceNumber?.trim() ||
    "";

  return candidate || null;
}

export function strongestExternalProviderRef(input: {
  stripeChargeId?: string | null;
  providerInvoiceId?: string | null;
  stripeInvoiceId?: string | null;
  invoiceNumber?: string | null;
}) {
  return (
    input.stripeChargeId?.trim() ||
    input.providerInvoiceId?.trim() ||
    input.stripeInvoiceId?.trim() ||
    input.invoiceNumber?.trim() ||
    null
  );
}

export function calculateExternalNetAmount(input: {
  grossAmount: number;
  stripeFeeAmount?: number | null;
  platformFeeAmount?: number | null;
}) {
  return Math.round(
    (input.grossAmount - (input.stripeFeeAmount ?? 0) - (input.platformFeeAmount ?? 0)) * 100
  ) / 100;
}
