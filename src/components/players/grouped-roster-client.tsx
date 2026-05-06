"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { PlayerRosterGroupsData, RosterTuitionCell } from "@/lib/queries/player-roster-groups";
import { updatePlayerRosterTrainingGroupsAction } from "@/server/actions/training-groups";

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

function groupedRosterExportHref({ campusId, gender, birthYear }: { campusId?: string; gender?: string; birthYear?: number | string | null }) {
  const params = new URLSearchParams();
  if (campusId) params.set("campus", campusId);
  if (gender) params.set("gender", gender);
  if (birthYear) params.set("year", String(birthYear));
  const query = params.toString();
  return query ? `/api/exports/player-roster-groups?${query}` : "/api/exports/player-roster-groups";
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

const ASSIGNMENT_ERROR_LABELS: Record<string, string> = {
  debug_read_only: "La vista debug esta en modo lectura.",
  unauthorized: "No tienes permiso para editar grupos.",
  invalid_form: "Selecciona al menos un cambio valido.",
  assignment_failed: "No se pudo guardar uno de los cambios.",
};

function GroupedRosterView({ data, onReload }: { data: PlayerRosterGroupsData; onReload: () => Promise<void> }) {
  const initialAssignments = useMemo(() => {
    const entries: Array<[string, string]> = [];
    for (const section of data.sections) {
      for (const row of section.rows) {
        entries.push([row.enrollmentId, row.trainingGroupId ?? ""]);
      }
    }
    return Object.fromEntries(entries);
  }, [data.sections]);
  const [editMode, setEditMode] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, string>>(initialAssignments);
  const [assignmentStart, setAssignmentStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setAssignments(initialAssignments);
    setSaveMessage(null);
  }, [initialAssignments]);

  const changedEnrollmentIds = useMemo(
    () => Object.keys(assignments).filter((enrollmentId) => (assignments[enrollmentId] ?? "") !== (initialAssignments[enrollmentId] ?? "")),
    [assignments, initialAssignments],
  );

  function saveAssignments() {
    if (changedEnrollmentIds.length === 0) {
      setSaveMessage("No hay cambios por guardar.");
      return;
    }

    const formData = new FormData();
    formData.set("assignment_start", assignmentStart);
    for (const enrollmentId of changedEnrollmentIds) {
      formData.append("enrollment_id", enrollmentId);
      formData.set(`current_training_group_id:${enrollmentId}`, initialAssignments[enrollmentId] ?? "");
      formData.set(`training_group_id:${enrollmentId}`, assignments[enrollmentId] ?? "");
    }

    startTransition(async () => {
      const result = await updatePlayerRosterTrainingGroupsAction(formData);
      if (!result.ok) {
        setSaveMessage(ASSIGNMENT_ERROR_LABELS[result.error] ?? "No se pudieron guardar los cambios.");
        return;
      }
      setSaveMessage(`Cambios guardados: ${result.applied}.`);
      await onReload();
      setEditMode(false);
    });
  }

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
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {data.totalPlayers} jugadores
              </span>
              {data.unassignedCount > 0 ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  {data.unassignedCount} sin grupo
                </span>
              ) : null}
            </div>
            {data.canEditTrainingGroups ? (
              <button
                type="button"
                onClick={() => {
                  setEditMode((current) => !current);
                  setSaveMessage(null);
                }}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                  editMode
                    ? "border-amber-300 bg-amber-50 text-amber-800"
                    : "border-slate-300 bg-white text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
                }`}
              >
                {editMode ? "Salir de edicion" : "Editar grupos"}
              </button>
            ) : null}
            <a
              href={groupedRosterExportHref({
                campusId: data.selectedCampusId,
                gender: data.selectedGender,
                birthYear: data.selectedBirthYear,
              })}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
            >
              Exportar Excel
            </a>
          </div>
        </div>

        {editMode ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-semibold">Modo edicion de grupos</p>
                <p className="mt-1 text-xs">Cambia los grupos con el selector de cada jugador y guarda al final. Los cambios aplican desde la fecha indicada.</p>
              </div>
              <label className="text-xs font-semibold">
                Aplicar desde
                <input
                  type="date"
                  value={assignmentStart}
                  onChange={(event) => setAssignmentStart(event.target.value)}
                  className="mt-1 block rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold">{changedEnrollmentIds.length} cambios</span>
                <button
                  type="button"
                  onClick={() => setAssignments(initialAssignments)}
                  disabled={isPending || changedEnrollmentIds.length === 0}
                  className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
                >
                  Deshacer
                </button>
                <button
                  type="button"
                  onClick={saveAssignments}
                  disabled={isPending || changedEnrollmentIds.length === 0}
                  className="rounded-md bg-portoBlue px-3 py-2 text-xs font-semibold text-white hover:bg-portoDark disabled:opacity-50"
                >
                  {isPending ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
            {saveMessage ? <p className="mt-2 text-xs font-medium">{saveMessage}</p> : null}
          </div>
        ) : null}

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
                        <td className="px-2 py-2 text-slate-700 dark:text-slate-300">
                          {editMode ? (
                            <select
                              value={assignments[row.enrollmentId] ?? ""}
                              onChange={(event) => {
                                const next = event.target.value;
                                setAssignments((current) => ({ ...current, [row.enrollmentId]: next }));
                              }}
                              className={`min-w-48 rounded-md border px-2 py-1 text-xs ${
                                (assignments[row.enrollmentId] ?? "") !== (initialAssignments[row.enrollmentId] ?? "")
                                  ? "border-amber-300 bg-amber-50 text-amber-900"
                                  : "border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                              }`}
                            >
                              <option value="">Quitar grupo</option>
                              {data.groupOptions.map((group) => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                              ))}
                            </select>
                          ) : row.levelGroup}
                        </td>
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

  const loadRoster = useCallback(async (signal?: AbortSignal) => {
    setState({ status: "loading", data: null, message: null });

    await fetch(apiHref, {
      signal,
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
        if (signal?.aborted) return;
        setState({
          status: "error",
          data: null,
          message: error instanceof Error ? error.message : "No se pudo cargar el roster.",
        });
      });
  }, [apiHref]);

  useEffect(() => {
    const controller = new AbortController();
    loadRoster(controller.signal);
    return () => controller.abort();
  }, [loadRoster]);

  if (state.status === "loading") return <LoadingRoster />;
  if (state.status === "error") return <ErrorRoster message={state.message} />;
  if (!state.data) return <EmptyRoster />;
  return <GroupedRosterView data={state.data} onReload={loadRoster} />;
}
