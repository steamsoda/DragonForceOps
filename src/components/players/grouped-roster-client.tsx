"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PlayerRosterGroupsData, RosterTuitionCell } from "@/lib/queries/player-roster-groups";

type GroupedRosterFilters = {
  campusId?: string;
  gender?: string;
  birthYear?: string;
};

type LoadState =
  | { status: "loading"; data: null; message: null }
  | { status: "ready"; data: PlayerRosterGroupsData | null; message: null }
  | { status: "error"; data: null; message: string };

function tuitionCellClass(state: RosterTuitionCell["state"]) {
  if (state === "pending") return "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  if (state === "platform") return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200";
  if (state === "paid") return "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200";
  return "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";
}

function groupedRosterHref({ campusId, gender, birthYear }: { campusId?: string; gender?: string; birthYear?: number | string | null }) {
  const params = new URLSearchParams({ view: "groups" });
  if (campusId) params.set("campus", campusId);
  if (gender) params.set("gender", gender);
  if (birthYear) params.set("year", String(birthYear));
  return `/players?${params.toString()}`;
}

function groupedRosterApiHref(filters: GroupedRosterFilters) {
  const params = new URLSearchParams();
  if (filters.campusId) params.set("campus", filters.campusId);
  if (filters.gender) params.set("gender", filters.gender);
  if (filters.birthYear) params.set("year", filters.birthYear);
  const query = params.toString();
  return query ? `/api/players/grouped-roster?${query}` : "/api/players/grouped-roster";
}

function LoadingRoster() {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-4 py-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
      Cargando roster...
    </div>
  );
}

function ErrorRoster({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
      {message}
    </div>
  );
}

function EmptyRoster() {
  return (
    <div className="rounded-md border border-slate-200 px-4 py-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
      No hay campus disponibles para esta vista.
    </div>
  );
}

function GroupedRosterView({ data }: { data: PlayerRosterGroupsData }) {
  const genderOptions = [
    { value: "", label: "Todos" },
    { value: "male", label: "Varonil" },
    { value: "female", label: "Femenil" },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Campus</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona un campus para mantener la vista ligera y facil de escanear.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {data.totalPlayers} jugadores
            </span>
            {data.unassignedCount > 0 ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                {data.unassignedCount} sin grupo
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.campuses.map((campus) => {
            const active = campus.id === data.selectedCampusId;
            return (
              <Link
                key={campus.id}
                href={groupedRosterHref({ campusId: campus.id, gender: data.selectedGender, birthYear: data.selectedBirthYear })}
                prefetch={false}
                className={`rounded-lg border px-4 py-3 text-left transition ${
                  active
                    ? "border-portoBlue bg-blue-50 text-portoBlue shadow-sm dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-slate-800"
                }`}
              >
                <span className="block text-sm font-semibold">{campus.name}</span>
                <span className="mt-1 block text-xs opacity-75">{active ? "Campus seleccionado" : "Ver roster del campus"}</span>
              </Link>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Genero</p>
          <div className="flex flex-wrap gap-2">
            {genderOptions.map((option) => {
              const active = data.selectedGender === option.value;
              return (
                <Link
                  key={option.value || "all"}
                  href={groupedRosterHref({ campusId: data.selectedCampusId, gender: option.value, birthYear: data.selectedBirthYear })}
                  prefetch={false}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "border-portoBlue bg-portoBlue text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                  }`}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Categoria</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={groupedRosterHref({ campusId: data.selectedCampusId, gender: data.selectedGender })}
              prefetch={false}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                data.selectedBirthYear == null
                  ? "border-portoBlue bg-portoBlue text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              }`}
            >
              Todas
            </Link>
            {data.birthYears.map((year) => (
              <Link
                key={year}
                href={groupedRosterHref({ campusId: data.selectedCampusId, gender: data.selectedGender, birthYear: year })}
                prefetch={false}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                  data.selectedBirthYear === year
                    ? "border-portoBlue bg-portoBlue text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                }`}
              >
                {year}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex min-w-max gap-2">
          {data.sections.map((section) => (
            <a
              key={section.id}
              href={`#grupo-${section.id}`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-700 dark:text-slate-300"
            >
              {section.name} ({section.rows.length})
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-5">
        {data.sections.map((section) => (
          <section key={section.id} id={`grupo-${section.id}`} className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{section.name}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{section.subtitle}</p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {section.rows.length} jugadores
              </span>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
              <table className="min-w-full border-collapse text-xs">
                <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="w-12 border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">#</th>
                    <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">ID</th>
                    <th className="min-w-64 border-b border-slate-200 px-2 py-2 dark:border-slate-700">Nombre</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">CAT</th>
                    <th className="border-b border-slate-200 px-2 py-2 dark:border-slate-700">Nivel/Grupo</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">INSC</th>
                    {data.months.map((month) => (
                      <th key={month.periodMonth} className="border-b border-slate-200 px-2 py-2 text-center dark:border-slate-700">
                        {month.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {section.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6 + data.months.length} className="px-3 py-4 text-slate-500 dark:text-slate-400">
                        Sin jugadores activos en este grupo.
                      </td>
                    </tr>
                  ) : (
                    section.rows.map((row, index) => (
                      <tr key={row.enrollmentId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-2 py-2 text-center text-slate-500 dark:text-slate-400">{index + 1}</td>
                        <td className="px-2 py-2 font-mono text-slate-700 dark:text-slate-300">{row.publicPlayerId}</td>
                        <td className="px-2 py-2">
                          <Link href={`/players/${row.playerId}`} prefetch={false} className="font-medium text-slate-900 hover:text-portoBlue hover:underline dark:text-slate-100">
                            {row.fullName}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">{row.birthYear ?? "-"}</td>
                        <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.levelGroup}</td>
                        <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">{row.inscriptionDate}</td>
                        {row.tuition.map((cell) => (
                          <td key={cell.periodMonth} className="px-2 py-2 text-center">
                            <span className={`inline-flex min-h-6 min-w-20 items-center justify-center rounded border px-2 py-1 font-medium leading-none ${tuitionCellClass(cell.state)}`}>
                              {cell.value}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function GroupedRosterClient({ filters }: { filters: GroupedRosterFilters }) {
  const apiHref = useMemo(() => groupedRosterApiHref(filters), [filters.campusId, filters.gender, filters.birthYear]);
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, message: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", data: null, message: null });

    fetch(apiHref, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(json?.message ?? "No se pudo cargar el roster.");
        }
        setState({ status: "ready", data: json as PlayerRosterGroupsData | null, message: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          message: error instanceof Error ? error.message : "No se pudo cargar el roster.",
        });
      });

    return () => controller.abort();
  }, [apiHref]);

  if (state.status === "loading") return <LoadingRoster />;
  if (state.status === "error") return <ErrorRoster message={state.message} />;
  if (!state.data) return <EmptyRoster />;
  return <GroupedRosterView data={state.data} />;
}
