import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getNewEnrollmentIntakeData, type NewEnrollmentCampusBoard, type NewEnrollmentIntakeRow, type NewEnrollmentWorkflowFilter } from "@/lib/queries/new-enrollments";
import { formatDateMonterrey, formatDateTimeMonterrey } from "@/lib/time";

type SearchParams = Promise<{
  campus?: string;
  start?: string;
  end?: string;
  birthYear?: string;
  status?: string;
}>;

const WORKFLOW_LABELS: Record<NewEnrollmentWorkflowFilter, string> = {
  all: "Todas",
  pending_sports: "Pendiente deportivo",
  pending_nutrition: "Pendiente nutricion",
  complete: "Completa",
};

const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  ended: "Baja",
  cancelled: "Cancelada",
};

function withParams(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

function chip(label: string, tone: "slate" | "amber" | "emerald" | "rose" | "blue" = "slate") {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
    rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
    blue: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200",
  };
  return (
    <span className={`inline-flex min-h-6 items-center justify-center rounded-full border px-2.5 py-0.5 text-center text-xs font-medium leading-none ${tones[tone]}`}>
      {label}
    </span>
  );
}

function CampusCard({
  board,
  selected,
  href,
}: {
  board: NewEnrollmentCampusBoard & { campusId: string; campusName: string };
  selected: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
        selected
          ? "border-portoBlue bg-blue-50/60 dark:border-blue-500 dark:bg-blue-950/20"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      }`}
    >
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{board.campusName}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight text-portoDark dark:text-slate-100">{board.total}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">inscripciones en rango</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {chip(`Dep: ${board.pendingSports}`, board.pendingSports > 0 ? "amber" : "slate")}
        {chip(`Nut: ${board.pendingNutrition}`, board.pendingNutrition > 0 ? "amber" : "slate")}
        {chip(`OK: ${board.complete}`, "emerald")}
      </div>
    </Link>
  );
}

function ActionLinks({ row }: { row: NewEnrollmentIntakeRow }) {
  const links = [
    row.sportsActionHref ? { href: row.sportsActionHref, label: "Grupo deportivo" } : null,
    row.nutritionActionHref ? { href: row.nutritionActionHref, label: "Nutricion" } : null,
    row.playerActionHref ? { href: row.playerActionHref, label: "Jugador" } : null,
  ].filter((item): item is { href: string; label: string } => Boolean(item));

  if (links.length === 0) return <span className="text-sm text-slate-400">Sin accion</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <Link
          key={`${link.href}:${link.label}`}
          href={link.href}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export default async function NewEnrollmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const data = await getNewEnrollmentIntakeData({
    campusId: params.campus,
    startDate: params.start,
    endDate: params.end,
    birthYear: params.birthYear,
    status: params.status,
  });

  if (!data) redirect("/unauthorized");

  const allCampusBoard = {
    campusId: "",
    campusName: "Todos los campus",
    total: data.campusBoards.reduce((sum, board) => sum + board.total, 0),
    pendingSports: data.campusBoards.reduce((sum, board) => sum + board.pendingSports, 0),
    pendingNutrition: data.campusBoards.reduce((sum, board) => sum + board.pendingNutrition, 0),
    complete: data.campusBoards.reduce((sum, board) => sum + board.complete, 0),
  };

  return (
    <PageShell
      title="Nuevas inscripciones"
      subtitle="Alta reciente compartida para seguimiento deportivo, nutricion y operacion. Sin datos financieros."
      breadcrumbs={[{ label: "Nuevas inscripciones" }]}
      wide
    >
      <div className="space-y-6">
        <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[1fr_1fr_1fr_1fr_auto_auto]">
          {data.selectedCampusId ? <input type="hidden" name="campus" value={data.selectedCampusId} /> : null}
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Desde</span>
            <input name="start" type="date" defaultValue={data.selectedStartDate} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Hasta</span>
            <input name="end" type="date" defaultValue={data.selectedEndDate} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Categoria</span>
            <select name="birthYear" defaultValue={data.selectedBirthYear} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="">Todas</option>
              {data.birthYearOptions.map((birthYear) => (
                <option key={birthYear} value={birthYear}>
                  {birthYear}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Estado</span>
            <select name="status" defaultValue={data.selectedStatus} className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">
              <option value="all">Todas</option>
              <option value="pending_sports">Pendiente deportivo</option>
              <option value="pending_nutrition">Pendiente nutricion</option>
              <option value="complete">Completa</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
              Aplicar
            </button>
          </div>
          <div className="flex items-end">
            <Link href="/new-enrollments" className="w-full rounded-md border border-slate-300 px-4 py-2 text-center text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
              Limpiar
            </Link>
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-400">Inscripciones</p>
            <p className="mt-1 text-3xl font-semibold">{data.totals.total}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateMonterrey(`${data.selectedStartDate}T12:00:00.000Z`)} - {formatDateMonterrey(`${data.selectedEndDate}T12:00:00.000Z`)}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Pendiente deportivo</p>
            <p className="mt-1 text-3xl font-semibold text-amber-900 dark:text-amber-100">{data.totals.pendingSports}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Pendiente nutricion</p>
            <p className="mt-1 text-3xl font-semibold text-amber-900 dark:text-amber-100">{data.totals.pendingNutrition}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
            <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Completas</p>
            <p className="mt-1 text-3xl font-semibold text-emerald-900 dark:text-emerald-100">{data.totals.complete}</p>
          </div>
        </div>

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Campus</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">La seleccion cambia la lista, pero mantiene visible el alcance completo.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <CampusCard
              board={allCampusBoard}
              selected={!data.selectedCampusId}
              href={withParams("/new-enrollments", {
                start: data.selectedStartDate,
                end: data.selectedEndDate,
                birthYear: data.selectedBirthYear,
                status: data.selectedStatus,
              })}
            />
            {data.campusBoards.map((board) => (
              <CampusCard
                key={board.campusId}
                board={board}
                selected={board.campusId === data.selectedCampusId}
                href={withParams("/new-enrollments", {
                  campus: board.campusId,
                  start: data.selectedStartDate,
                  end: data.selectedEndDate,
                  birthYear: data.selectedBirthYear,
                  status: data.selectedStatus,
                })}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Lista - {WORKFLOW_LABELS[data.selectedStatus]}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Acciones rapidas segun el rol activo.</p>
            </div>
            {data.selectedBirthYear ? chip(`Cat. ${data.selectedBirthYear}`, "blue") : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Campus</th>
                  <th className="px-3 py-2">Cat.</th>
                  <th className="px-3 py-2">Genero</th>
                  <th className="px-3 py-2">Alta</th>
                  <th className="px-3 py-2">Nivel / Grupo</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-5 text-slate-600 dark:text-slate-400" colSpan={8}>
                      No hay inscripciones con esos filtros.
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.enrollmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{row.playerName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {ENROLLMENT_STATUS_LABELS[row.status] ?? row.status}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{row.campusName}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{row.birthYear ?? "-"}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">{row.genderLabel}</td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                        <p>{row.inscriptionDate ? formatDateMonterrey(`${row.inscriptionDate}T12:00:00.000Z`) : "-"}</p>
                        <p className="text-xs text-slate-400">{formatDateTimeMonterrey(row.createdAt)}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                        <p>Nivel {row.resolvedLevel ?? "-"}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{row.currentTrainingGroupName ?? "Sin grupo"}</p>
                        {row.currentTeamName ? <p className="text-xs text-slate-400">Comp: {row.currentTeamName}</p> : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {chip(row.sportsComplete ? "Deportivo listo" : "Pendiente deportivo", row.sportsComplete ? "emerald" : "amber")}
                          {chip(row.nutritionComplete ? "Nutricion lista" : "Pendiente nutricion", row.nutritionComplete ? "emerald" : "amber")}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <ActionLinks row={row} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
