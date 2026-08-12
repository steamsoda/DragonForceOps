"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createOrSyncCombinedCompetitionSquadAction } from "@/server/actions/competition-rosters";

type CombinedGroup = {
  id: string;
  name: string;
  subtitle: string;
  candidateCount: number;
  canCombine: boolean;
  combinedSquadId: string | null;
};

type ExistingCombinedSquad = {
  id: string;
  name: string;
  displayName: string;
  sourceGroupIds: string[];
  memberCount: number;
};

function CombinedSubmitButton({ disabled, editing }: { disabled: boolean; editing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="min-h-10 rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Guardando equipo..." : editing ? "Actualizar equipo combinado" : "Crear equipo combinado"}
    </button>
  );
}

export function CompetitionRosterCombinedEditor({
  tournamentId,
  campusId,
  program,
  groups,
  combinedSquads,
}: {
  tournamentId: string;
  campusId: string;
  program: string;
  groups: CombinedGroup[];
  combinedSquads: ExistingCombinedSquad[];
}) {
  const initialSquad = combinedSquads[0] ?? null;
  const [mode, setMode] = useState(initialSquad?.id ?? "new");
  const [name, setName] = useState(initialSquad?.name ?? "");
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    () => new Set(initialSquad?.sourceGroupIds ?? []),
  );
  const editing = mode !== "new";
  const selectedGroups = useMemo(
    () => groups.filter((group) => selectedGroupIds.has(group.id)),
    [groups, selectedGroupIds],
  );
  const playerCount = selectedGroups.reduce((total, group) => total + group.candidateCount, 0);
  const invalid = selectedGroups.length < 2 || name.trim().length < 3 || name.trim().length > 80;

  function selectMode(nextMode: string) {
    setMode(nextMode);
    if (nextMode === "new") {
      setName("");
      setSelectedGroupIds(new Set());
      return;
    }
    const squad = combinedSquads.find((candidate) => candidate.id === nextMode);
    setName(squad?.name ?? "");
    setSelectedGroupIds(new Set(squad?.sourceGroupIds ?? []));
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <details className="overflow-hidden rounded-md border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20" open={combinedSquads.length > 0 || undefined}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-blue-900 marker:text-blue-500 dark:text-blue-100">
        Combinar varios grupos en un equipo
      </summary>
      <form
        action={createOrSyncCombinedCompetitionSquadAction}
        className="space-y-4 border-t border-blue-200 px-4 py-4 dark:border-blue-900"
        onSubmit={(event) => {
          if (invalid || !window.confirm(`Guardar ${name.trim()} con ${selectedGroups.length} grupos y ${playerCount} jugadores confirmados?`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <input type="hidden" name="campusId" value={campusId} />
        <input type="hidden" name="program" value={program} />
        <input type="hidden" name="squadId" value={editing ? mode : ""} />

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-800 dark:text-slate-100">
            Equipo a configurar
            <select
              value={mode}
              onChange={(event) => selectMode(event.target.value)}
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="new">Nuevo equipo combinado</option>
              {combinedSquads.map((squad) => (
                <option key={squad.id} value={squad.id}>
                  Editar {squad.displayName} ({squad.memberCount} jugadores)
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-800 dark:text-slate-100">
            Nombre del equipo
            <input
              name="squadName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="Ej. Femenil 2014/2015/2016"
              className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-950 dark:text-slate-50">
            Selecciona dos o mas grupos de origen
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Se incluiran sus jugadores confirmados. Los grupos y su asistencia no cambian.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const selected = selectedGroupIds.has(group.id);
            const available = group.canCombine && (!group.combinedSquadId || group.combinedSquadId === mode);
            return (
              <label
                key={group.id}
                className={`flex min-h-20 items-start gap-3 rounded-md border px-3 py-3 ${
                  available
                    ? "cursor-pointer border-slate-300 bg-white hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900"
                    : "cursor-not-allowed border-slate-200 bg-slate-100 opacity-60 dark:border-slate-800 dark:bg-slate-950"
                }`}
              >
                <input
                  type="checkbox"
                  name="trainingGroupId"
                  value={group.id}
                  checked={selected}
                  disabled={!available}
                  onChange={() => toggleGroup(group.id)}
                  className="mt-1 h-4 w-4 accent-portoBlue"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-950 dark:text-slate-50">{group.name}</span>
                  <span className="block text-xs text-slate-500">{group.subtitle || "Grupo de entrenamiento"}</span>
                  <span className="block text-xs text-slate-500">
                    {group.candidateCount} confirmados{available ? "" : " | Asignado a otra estructura"}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {selectedGroups.length} grupos | {playerCount} jugadores confirmados
          </p>
          <CombinedSubmitButton disabled={invalid} editing={editing} />
        </div>
        {selectedGroups.length > 0 && selectedGroups.length < 2 ? (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Selecciona por lo menos dos grupos para crear un equipo combinado.
          </p>
        ) : null}
      </form>
    </details>
  );
}
