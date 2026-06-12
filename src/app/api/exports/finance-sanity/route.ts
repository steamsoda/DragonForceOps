import { NextResponse } from "next/server";
import {
  ENROLLMENT_FINANCE_ANOMALY_CODES,
  type EnrollmentFinanceAnomalyCode,
  type EnrollmentFinanceAnomalySeverity,
} from "@/lib/finance/enrollment-anomalies";
import { getPermissionContext } from "@/lib/auth/permissions";
import { getFinanceSanityData, type FinanceSanityScanMode } from "@/lib/queries/finance-sanity";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function escapeCsv(value: string | number | null | undefined) {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  return normalized;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function formatDateForFilename(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeAnomalyCode(value: string | null): EnrollmentFinanceAnomalyCode | undefined {
  return ENROLLMENT_FINANCE_ANOMALY_CODES.includes((value ?? "") as EnrollmentFinanceAnomalyCode)
    ? ((value ?? "") as EnrollmentFinanceAnomalyCode)
    : undefined;
}

function normalizeSeverity(value: string | null): EnrollmentFinanceAnomalySeverity | undefined {
  return value === "warning" || value === "needs_correction" ? value : undefined;
}

function normalizeScanMode(value: string | null): FinanceSanityScanMode {
  return value === "deep" ? "deep" : "recent";
}

function toCsvRows(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ message: "No autenticado." }, { status: 401 });
  }

  const permissionContext = await getPermissionContext();
  if (!permissionContext?.isSuperAdmin) {
    return NextResponse.json({ message: "Sin permisos." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const campusId = searchParams.get("campus")?.trim() || undefined;
  const anomalyCode = normalizeAnomalyCode(searchParams.get("anomaly"));
  const severity = normalizeSeverity(searchParams.get("severity"));
  const scanMode = normalizeScanMode(searchParams.get("scan"));
  const sanity = await getFinanceSanityData(
    campusId,
    {
      anomalyCode,
      severity,
      scanMode,
    },
    permissionContext,
  );

  const exportedAt = new Date().toISOString();
  const rows: Array<Array<string | number | null | undefined>> = [
    [
      "seccion",
      "tipo",
      "fecha_exportacion",
      "jugador",
      "categoria",
      "campus",
      "inscripcion_id",
      "codigo",
      "severidad",
      "titulo",
      "detalle",
      "canonico",
      "derivado",
      "pendientes",
      "drift",
      "evento",
      "disparador",
    ],
    [
      "resumen",
      "balance_global",
      exportedAt,
      "",
      "",
      campusId ? "campus_filtrado" : "todos_los_campus_visibles",
      "",
      "",
      "",
      "Canonico vs Pendientes vs Panel",
      `scan=${scanMode}`,
      sanity.summary.canonicalPendingBalance,
      "",
      sanity.summary.pendingRpcBalance,
      sanity.summary.pendingVsCanonicalBalanceDrift,
      "",
      "",
    ],
    [
      "resumen",
      "panel_kpi",
      exportedAt,
      "",
      "",
      campusId ? "campus_filtrado" : "todos_los_campus_visibles",
      "",
      "",
      "",
      "Canonico vs Panel",
      `inscripciones_con_saldo=${sanity.summary.canonicalEnrollmentsWithBalance}`,
      sanity.summary.canonicalPendingBalance,
      "",
      sanity.summary.dashboardPendingBalance,
      sanity.summary.dashboardVsCanonicalBalanceDrift,
      "",
      "",
    ],
  ];

  for (const row of sanity.activeAnomalyRows) {
    for (const anomaly of row.anomalies) {
      rows.push([
        "anomalias_activas",
        "anomalia",
        exportedAt,
        row.playerName,
        row.birthYear,
        row.campusName,
        row.enrollmentId,
        anomaly.code,
        anomaly.severity,
        anomaly.title,
        anomaly.detail,
        row.canonicalBalance,
        row.derivedBalance,
        "",
        row.canonicalBalance - row.derivedBalance,
        "",
        "",
      ]);
    }
  }

  for (const row of sanity.driftRows) {
    rows.push([
      "mismatches",
      "drift_pendientes",
      exportedAt,
      row.playerName,
      "",
      row.campusName,
      row.enrollmentId,
      "canonical_vs_pending_drift",
      "needs_correction",
      "Saldo canonico distinto de Pendientes",
      "El saldo mostrado por Pendientes no coincide con el saldo canonico.",
      row.canonicalBalance,
      "",
      row.pendingRpcBalance,
      row.balanceDrift,
      "",
      "",
    ]);
  }

  for (const event of sanity.recentAnomalyEvents) {
    rows.push([
      "eventos_recientes",
      "evento_anomalia",
      exportedAt,
      event.playerName,
      event.birthYear,
      event.campusName,
      event.enrollmentId,
      event.code,
      event.severity,
      event.title,
      event.detail,
      "",
      "",
      "",
      "",
      event.action === "finance.anomaly_detected" ? "detectada" : "resuelta",
      event.triggerAction,
    ]);
  }

  const csv = `\uFEFF${toCsvRows(rows)}`;
  const filename = `sanidad-financiera-${slugify(scanMode)}-${formatDateForFilename(new Date())}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
