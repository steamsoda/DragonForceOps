import { canAccessCampus, getOperationalCampusAccess } from "@/lib/auth/campuses";
import { createClient } from "@/lib/supabase/server";
import { getMonterreyWeekBounds } from "@/lib/time";

type UniformOrderRecord = {
  id: string;
  player_id: string;
  enrollment_id: string;
  charge_id: string | null;
  uniform_type: "training" | "game";
  size: string | null;
  status: "pending_order" | "ordered" | "delivered";
  sold_at: string | null;
  ordered_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  players: { first_name: string; last_name: string; birth_date: string | null } | null;
  enrollments: { campus_id: string; campuses: { id: string; name: string; code: string } | null } | null;
};

type ChargePaymentRecord = {
  id: string;
  description: string;
  payment_allocations:
    | Array<{
        amount: number | null;
        payments:
          | {
              id: string;
              folio: string | null;
              status: string;
              paid_at: string;
            }
          | null;
      }>
    | null;
};

export type UniformDashboardFilters = {
  campusId?: string;
  type?: "training" | "game" | "";
  queue?: "all" | "sold_week" | "pending_order" | "ordered" | "pending_delivery" | "delivered_week";
};

export type UniformDashboardRow = {
  id: string;
  playerId: string;
  enrollmentId: string;
  chargeId: string | null;
  playerName: string;
  playerHref: string;
  campusId: string;
  campusName: string;
  campusCode: string | null;
  birthYear: number | null;
  uniformType: "training" | "game";
  uniformTypeLabel: string;
  size: string | null;
  status: "pending_order" | "ordered" | "delivered";
  statusLabel: string;
  soldAt: string | null;
  orderedAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  chargeDescription: string | null;
  paymentId: string | null;
  folio: string | null;
};

export type UniformDashboardSection = {
  key: "sold_week" | "pending_order" | "ordered" | "pending_delivery" | "delivered_week";
  title: string;
  rows: UniformDashboardRow[];
};

export type UniformDashboardData = {
  campuses: Array<{ id: string; name: string }>;
  selectedCampusId: string;
  selectedType: "" | "training" | "game";
  selectedQueue: UniformDashboardFilters["queue"];
  week: { start: string; end: string };
  counts: {
    soldWeek: number;
    pendingOrder: number;
    ordered: number;
    pendingDelivery: number;
    deliveredWeek: number;
  };
  sections: UniformDashboardSection[];
};

function getUniformTypeLabel(uniformType: "training" | "game") {
  return uniformType === "training" ? "Entrenamiento" : "Juego";
}

function getStatusLabel(status: "pending_order" | "ordered" | "delivered") {
  if (status === "pending_order") return "Pendiente por pedir";
  if (status === "ordered") return "Pedido al proveedor";
  return "Entregado";
}

function inRange(value: string | null, start: string, end: string) {
  if (!value) return false;
  return value >= start && value < end;
}

export async function getUniformDashboardData(filters: UniformDashboardFilters = {}): Promise<UniformDashboardData> {
  const campusAccess = await getOperationalCampusAccess();
  const campuses = campusAccess?.campuses ?? [];
  const selectedCampusId =
    filters.campusId && canAccessCampus(campusAccess, filters.campusId)
      ? filters.campusId
      : campusAccess?.defaultCampusId ?? campuses[0]?.id ?? "";
  const selectedType = filters.type === "training" || filters.type === "game" ? filters.type : "";
  const selectedQueue = filters.queue ?? "all";

  if (!campusAccess || campuses.length === 0) {
    return {
      campuses: [],
      selectedCampusId: "",
      selectedType,
      selectedQueue,
      week: { start: "", end: "" },
      counts: { soldWeek: 0, pendingOrder: 0, ordered: 0, pendingDelivery: 0, deliveredWeek: 0 },
      sections: [],
    };
  }

  const supabase = await createClient();
  const weekBounds = getMonterreyWeekBounds();
  const { data: orderRows } = await supabase
    .from("uniform_orders")
    .select(
      "id, player_id, enrollment_id, charge_id, uniform_type, size, status, sold_at, ordered_at, delivered_at, notes, players(first_name, last_name, birth_date), enrollments(campus_id, campuses(id, name, code))"
    )
    .returns<UniformOrderRecord[]>();

  const filteredOrders = (orderRows ?? [])
    .filter((row) => row.enrollments?.campus_id && canAccessCampus(campusAccess, row.enrollments.campus_id))
    .filter((row) => !selectedCampusId || row.enrollments?.campus_id === selectedCampusId)
    .filter((row) => !selectedType || row.uniform_type === selectedType);

  const chargeIds = Array.from(new Set(filteredOrders.map((row) => row.charge_id).filter(Boolean))) as string[];
  const chargeMap = new Map<string, { description: string; paymentId: string | null; folio: string | null }>();

  if (chargeIds.length > 0) {
    const { data: chargeRows } = await supabase
      .from("charges")
      .select("id, description, payment_allocations(amount, payments(id, folio, status, paid_at))")
      .in("id", chargeIds)
      .returns<ChargePaymentRecord[]>();

    for (const charge of chargeRows ?? []) {
      const latestPostedPayment = (charge.payment_allocations ?? [])
        .map((allocation) => allocation.payments)
        .filter(
          (
            payment
          ): payment is {
            id: string;
            folio: string | null;
            status: string;
            paid_at: string;
          } => payment !== null && payment.status === "posted"
        )
        .sort((a, b) => b.paid_at.localeCompare(a.paid_at))[0];

      chargeMap.set(charge.id, {
        description: charge.description,
        paymentId: latestPostedPayment?.id ?? null,
        folio: latestPostedPayment?.folio ?? null,
      });
    }
  }

  const rows: UniformDashboardRow[] = filteredOrders.map((row) => {
    const charge = row.charge_id ? chargeMap.get(row.charge_id) : null;
    return {
      id: row.id,
      playerId: row.player_id,
      enrollmentId: row.enrollment_id,
      chargeId: row.charge_id,
      playerName: `${row.players?.first_name ?? ""} ${row.players?.last_name ?? ""}`.trim(),
      playerHref: `/players/${row.player_id}`,
      campusId: row.enrollments?.campus_id ?? "",
      campusName: row.enrollments?.campuses?.name ?? "-",
      campusCode: row.enrollments?.campuses?.code ?? null,
      birthYear: row.players?.birth_date ? Number.parseInt(row.players.birth_date.slice(0, 4), 10) : null,
      uniformType: row.uniform_type,
      uniformTypeLabel: getUniformTypeLabel(row.uniform_type),
      size: row.size,
      status: row.status,
      statusLabel: getStatusLabel(row.status),
      soldAt: row.sold_at,
      orderedAt: row.ordered_at,
      deliveredAt: row.delivered_at,
      notes: row.notes,
      chargeDescription: charge?.description ?? null,
      paymentId: charge?.paymentId ?? null,
      folio: charge?.folio ?? null,
    };
  });

  const soldWeek = rows
    .filter((row) => inRange(row.soldAt, weekBounds.start, weekBounds.end))
    .sort((a, b) => (b.soldAt ?? "").localeCompare(a.soldAt ?? ""));
  const pendingOrder = rows
    .filter((row) => row.status === "pending_order")
    .sort((a, b) => (a.soldAt ?? "").localeCompare(b.soldAt ?? ""));
  const ordered = rows
    .filter((row) => row.status === "ordered")
    .sort((a, b) => (a.orderedAt ?? a.soldAt ?? "").localeCompare(b.orderedAt ?? b.soldAt ?? ""));
  const pendingDelivery = rows
    .filter((row) => row.status !== "delivered")
    .sort((a, b) => {
      const aDate = a.orderedAt ?? a.soldAt ?? "";
      const bDate = b.orderedAt ?? b.soldAt ?? "";
      return aDate.localeCompare(bDate);
    });
  const deliveredWeek = rows
    .filter((row) => inRange(row.deliveredAt, weekBounds.start, weekBounds.end))
    .sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""));

  const sectionMap: UniformDashboardSection[] = [
    { key: "sold_week", title: "Vendidos esta semana", rows: soldWeek },
    { key: "pending_order", title: "Pendientes por pedir", rows: pendingOrder },
    { key: "ordered", title: "Pedidos al proveedor", rows: ordered },
    { key: "pending_delivery", title: "Pendientes por entregar", rows: pendingDelivery },
    { key: "delivered_week", title: "Entregados esta semana", rows: deliveredWeek },
  ];

  const sections =
    selectedQueue && selectedQueue !== "all"
      ? sectionMap.filter((section) => section.key === selectedQueue)
      : sectionMap;

  return {
    campuses: campuses.map((campus) => ({ id: campus.id, name: campus.name })),
    selectedCampusId,
    selectedType,
    selectedQueue,
    week: { start: weekBounds.start, end: weekBounds.end },
    counts: {
      soldWeek: soldWeek.length,
      pendingOrder: pendingOrder.length,
      ordered: ordered.length,
      pendingDelivery: pendingDelivery.length,
      deliveredWeek: deliveredWeek.length,
    },
    sections,
  };
}
