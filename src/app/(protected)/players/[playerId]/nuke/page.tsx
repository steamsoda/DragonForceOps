import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { requireSuperAdminContext } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { nukePlayerAction } from "@/server/actions/admin";

type NukeStats = {
  enrollments: number;
  payments: number;
  charges: number;
};

const ERROR_MESSAGES: Record<string, string> = {
  name_mismatch: "El nombre no coincide. Escríbelo exactamente como aparece.",
  nuke_failed: "Error al eliminar — intenta de nuevo.",
  unauthenticated: "Sesión expirada.",
  unauthorized: "Sin permisos."
};

export default async function NukePlayerPage({
  params,
  searchParams
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { playerId } = await params;
  const { err } = await searchParams;

  await requireSuperAdminContext("/unauthorized");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .eq("id", playerId)
    .maybeSingle<{ id: string; first_name: string; last_name: string }>();

  if (!player) notFound();

  const fullName = `${player.first_name} ${player.last_name}`.trim();

  // Fetch counts so the admin knows what will be deleted
  const [enrollmentsResult, paymentsResult, chargesResult] = await Promise.all([
    supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("player_id", playerId),
    supabase.from("payments").select("id", { count: "exact", head: true }).in(
      "enrollment_id",
      (await supabase.from("enrollments").select("id").eq("player_id", playerId)).data?.map((e) => e.id) ?? []
    ),
    supabase.from("charges").select("id", { count: "exact", head: true }).in(
      "enrollment_id",
      (await supabase.from("enrollments").select("id").eq("player_id", playerId)).data?.map((e) => e.id) ?? []
    )
  ]);

  const stats: NukeStats = {
    enrollments: enrollmentsResult.count ?? 0,
    payments: paymentsResult.count ?? 0,
    charges: chargesResult.count ?? 0
  };

  return (
    <PageShell
      title="Eliminar jugador"
      breadcrumbs={[
        { label: "Jugadores", href: "/players" },
        { label: fullName, href: `/players/${playerId}` },
        { label: "Eliminar" }
      ]}
    >
      <div className="max-w-lg space-y-6">

        {err && (
          <div className="rounded-md border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950 px-4 py-3 text-sm text-rose-800 dark:text-rose-300">
            {ERROR_MESSAGES[err] ?? `Error: ${err}`}
          </div>
        )}

        {/* Warning banner */}
        <div className="rounded-md border-2 border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 px-5 py-4 space-y-2">
          <p className="font-bold text-rose-800 dark:text-rose-300 text-base">
            ⚠ Acción irreversible
          </p>
          <p className="text-sm text-rose-700 dark:text-rose-400">
            Se eliminarán <strong>permanentemente</strong> todos los datos de{" "}
            <span className="font-semibold">{fullName}</span>, incluyendo:
          </p>
          <ul className="text-sm text-rose-700 dark:text-rose-400 space-y-0.5 pl-4 list-disc">
            <li>{stats.enrollments} inscripción{stats.enrollments !== 1 ? "es" : ""}</li>
            <li>{stats.charges} cargo{stats.charges !== 1 ? "s" : ""}</li>
            <li>{stats.payments} pago{stats.payments !== 1 ? "s" : ""}</li>
            <li>Asignaciones de equipo</li>
            <li>Pedidos de uniforme</li>
            <li>Tutores vinculados únicamente a este jugador</li>
          </ul>
          <p className="text-xs text-rose-500 dark:text-rose-500 pt-1">
            Una entrada queda en el log de auditoría. No hay vuelta atrás.
          </p>
        </div>

        {/* Confirmation form */}
        <form action={nukePlayerAction} className="space-y-4">
          <input type="hidden" name="player_id" value={playerId} />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Escribe el nombre completo del jugador para confirmar:
              <span className="ml-2 font-bold text-slate-900 dark:text-slate-100">{fullName}</span>
            </label>
            <input
              type="text"
              name="confirm_name"
              required
              autoComplete="off"
              placeholder={fullName}
              className="w-full rounded-md border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="rounded-md bg-rose-600 px-5 py-2 text-sm font-semibold text-white hover:bg-rose-700 focus:ring-2 focus:ring-rose-500"
            >
              Eliminar todo — {fullName}
            </button>
            <Link
              href={`/players/${playerId}`}
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
