import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";
import { mergePlayersAction } from "@/server/actions/merge-players";

type SearchParams = Promise<{
  q1?: string; q2?: string;
  masterId?: string; duplicateId?: string;
  err?: string;
}>;

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: string | null;
  enrollments: { status: string; campuses: { name: string } | null }[];
};

const ERROR_MESSAGES: Record<string, string> = {
  both_active:  "Ambos jugadores tienen inscripción activa. Solo uno puede tenerla para poder fusionar.",
  same_player:  "No puedes fusionar un jugador consigo mismo.",
  merge_failed: "Error al fusionar. Intenta de nuevo.",
  missing_ids:  "Selecciona ambos jugadores antes de fusionar.",
  unauthorized: "Solo directores pueden fusionar jugadores.",
};

async function searchPlayers(supabase: Awaited<ReturnType<typeof createClient>>, q: string): Promise<PlayerRow[]> {
  if (!q.trim()) return [];
  const { data } = await supabase
    .from("players")
    .select("id, first_name, last_name, birth_date, gender, enrollments(status, campuses(name))")
    .or(`first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`)
    .neq("status", "archived")
    .limit(8)
    .returns<PlayerRow[]>();
  return data ?? [];
}

function PlayerCard({ player, role, href }: { player: PlayerRow; role: "master" | "duplicate"; href: string }) {
  const active = player.enrollments.find((e) => e.status === "active");
  const campus = active?.campuses?.name ?? "Sin inscripción activa";
  const label = role === "master" ? "CONSERVAR (master)" : "ELIMINAR (duplicado)";
  const color = role === "master" ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20" : "border-rose-400 bg-rose-50 dark:bg-rose-950/20";
  const badge = role === "master" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
  return (
    <div className={`rounded-lg border-2 ${color} p-4 space-y-2`}>
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>{label}</span>
      <p className="font-semibold text-slate-900 dark:text-slate-100">{player.first_name} {player.last_name}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">Nac: {player.birth_date}</p>
      <p className="text-sm text-slate-600 dark:text-slate-400">Campus: {campus}</p>
      <a href={href} className="text-xs text-portoBlue hover:underline">Cambiar selección</a>
    </div>
  );
}

function PlayerSearchResult({ player, paramKey, currentParams }: {
  player: PlayerRow;
  paramKey: "masterId" | "duplicateId";
  currentParams: Record<string, string>;
}) {
  const active = player.enrollments.find((e) => e.status === "active");
  const campus = active?.campuses?.name ?? "Sin inscripción";
  const params = new URLSearchParams({ ...currentParams, [paramKey]: player.id });
  return (
    <a
      href={`/admin/merge-players?${params.toString()}`}
      className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <span className="font-medium text-slate-900 dark:text-slate-100">{player.first_name} {player.last_name}</span>
      <span className="text-slate-500 text-xs">{player.birth_date} · {campus}</span>
    </a>
  );
}

export default async function MergePlayersPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: isDirector } = await supabase.rpc("is_director_admin");
  if (!isDirector) redirect("/players?err=unauthorized");

  const sp = await searchParams;
  const { q1 = "", q2 = "", masterId, duplicateId, err } = sp;

  const currentParams: Record<string, string> = {};
  if (q1) currentParams.q1 = q1;
  if (q2) currentParams.q2 = q2;
  if (masterId) currentParams.masterId = masterId;
  if (duplicateId) currentParams.duplicateId = duplicateId;

  // Fetch selected players and search results in parallel
  const [masterPlayer, duplicatePlayer, search1Results, search2Results] = await Promise.all([
    masterId
      ? supabase.from("players").select("id, first_name, last_name, birth_date, gender, enrollments(status, campuses(name))").eq("id", masterId).maybeSingle().returns<PlayerRow | null>().then((r) => r.data)
      : Promise.resolve(null),
    duplicateId
      ? supabase.from("players").select("id, first_name, last_name, birth_date, gender, enrollments(status, campuses(name))").eq("id", duplicateId).maybeSingle().returns<PlayerRow | null>().then((r) => r.data)
      : Promise.resolve(null),
    searchPlayers(supabase, q1),
    searchPlayers(supabase, q2),
  ]);

  const canMerge = !!masterPlayer && !!duplicatePlayer && masterId !== duplicateId;

  return (
    <PageShell
      title="Fusionar jugadores duplicados"
      breadcrumbs={[
        { label: "Admin" },
        { label: "Fusionar jugadores" },
      ]}
    >
      <div className="max-w-2xl space-y-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Busca y selecciona dos jugadores duplicados. El <strong>master</strong> conserva todos los datos; el <strong>duplicado</strong> se elimina permanentemente.
        </p>

        {err && (
          <div className="rounded-md border border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/20 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {ERROR_MESSAGES[err] ?? "Error inesperado."}
          </div>
        )}

        {/* Step 1: Select master */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">1. Jugador a conservar (master)</h2>
          {masterPlayer ? (
            <PlayerCard
              player={masterPlayer}
              role="master"
              href={`/admin/merge-players?${new URLSearchParams({ ...currentParams, masterId: "" }).toString()}`}
            />
          ) : (
            <div className="space-y-2">
              <form method="GET" action="/admin/merge-players" className="flex gap-2">
                {duplicateId && <input type="hidden" name="duplicateId" value={duplicateId} />}
                {q2 && <input type="hidden" name="q2" value={q2} />}
                <input
                  type="text"
                  name="q1"
                  defaultValue={q1}
                  placeholder="Buscar por nombre..."
                  autoFocus
                  className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
                <button type="submit" className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark">Buscar</button>
              </form>
              {search1Results.length > 0 && (
                <div className="space-y-1">
                  {search1Results.map((p) => (
                    <PlayerSearchResult key={p.id} player={p} paramKey="masterId" currentParams={currentParams} />
                  ))}
                </div>
              )}
              {q1 && search1Results.length === 0 && (
                <p className="text-sm text-slate-500">Sin resultados para &quot;{q1}&quot;.</p>
              )}
            </div>
          )}
        </section>

        {/* Step 2: Select duplicate */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">2. Jugador a eliminar (duplicado)</h2>
          {duplicatePlayer ? (
            <PlayerCard
              player={duplicatePlayer}
              role="duplicate"
              href={`/admin/merge-players?${new URLSearchParams({ ...currentParams, duplicateId: "" }).toString()}`}
            />
          ) : (
            <div className="space-y-2">
              <form method="GET" action="/admin/merge-players" className="flex gap-2">
                {masterId && <input type="hidden" name="masterId" value={masterId} />}
                {q1 && <input type="hidden" name="q1" value={q1} />}
                <input
                  type="text"
                  name="q2"
                  defaultValue={q2}
                  placeholder="Buscar por nombre..."
                  className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
                <button type="submit" className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark">Buscar</button>
              </form>
              {search2Results.length > 0 && (
                <div className="space-y-1">
                  {search2Results.filter((p) => p.id !== masterId).map((p) => (
                    <PlayerSearchResult key={p.id} player={p} paramKey="duplicateId" currentParams={currentParams} />
                  ))}
                </div>
              )}
              {q2 && search2Results.length === 0 && (
                <p className="text-sm text-slate-500">Sin resultados para &quot;{q2}&quot;.</p>
              )}
            </div>
          )}
        </section>

        {/* Confirm merge */}
        {canMerge && (
          <section className="rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20 p-4 space-y-4">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              ⚠ Esta acción es permanente. El duplicado será eliminado y sus datos transferidos al master.
            </p>
            <form action={mergePlayersAction} className="space-y-3">
              <input type="hidden" name="masterId" value={masterId} />
              <input type="hidden" name="duplicateId" value={duplicateId} />
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Razón (opcional)</span>
                <input
                  type="text"
                  name="reason"
                  defaultValue="Fusión de jugadores duplicados"
                  className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
                >
                  Fusionar — eliminar duplicado
                </button>
                <a
                  href="/admin/merge-players"
                  className="rounded-md border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancelar
                </a>
              </div>
            </form>
          </section>
        )}
      </div>
    </PageShell>
  );
}
