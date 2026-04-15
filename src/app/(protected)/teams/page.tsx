import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { BaseTeamBoardClient } from "@/components/teams/base-team-board-client";
import { requireSportsDirectorContext } from "@/lib/auth/permissions";
import { getBaseTeamBoardData } from "@/lib/queries/teams";
import { TEAM_GENDER_LABELS } from "@/lib/teams/shared";

export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<{ campusId?: string; birthYear?: string; gender?: string }>;
}) {
  await requireSportsDirectorContext("/unauthorized");
  const query = await searchParams;
  const board = await getBaseTeamBoardData(query);

  return (
    <PageShell
      title="Equipos Base"
      subtitle="Tablero deportivo para crear, asignar y mover jugadores entre sus equipos base."
      breadcrumbs={[{ label: "Equipos Base" }]}
      wide
    >
      <div className="space-y-6">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/40">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Filtro del bloque</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Elige campus, categoria y genero para trabajar el armado base del dia.
              </p>
            </div>
            <Link
              href="/teams/new"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Crear equipo manual
            </Link>
          </div>

          <form method="get" className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Campus</span>
              <select
                name="campusId"
                defaultValue={board.selectedCampusId ?? ""}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                {board.campuses.map((campus) => (
                  <option key={campus.id} value={campus.id}>
                    {campus.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Categoria</span>
              <select
                name="birthYear"
                defaultValue={board.selectedBirthYear ? String(board.selectedBirthYear) : ""}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                {board.birthYearOptions.map((birthYear) => (
                  <option key={birthYear} value={birthYear}>
                    {birthYear}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Genero</span>
              <select
                name="gender"
                defaultValue={board.selectedGender}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
              >
                {board.genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
              >
                Abrir bloque
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Campus</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{board.selectedCampusName ?? "Sin campus"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Categoria activa</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{board.selectedBirthYear ?? "Sin categoria"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Genero activo</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {TEAM_GENDER_LABELS[board.selectedGender] ?? board.selectedGender}
            </p>
          </div>
        </section>

        <BaseTeamBoardClient data={board} />
      </div>
    </PageShell>
  );
}
