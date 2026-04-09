"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  batchAssignBaseTeamAction,
  createBaseTeamOnDemandAction,
} from "@/server/actions/teams";
import type { BaseTeamBoardData } from "@/lib/queries/teams";
import { BASE_TEAM_LEVELS, TEAM_GENDER_LABELS } from "@/lib/teams/shared";

type Props = {
  data: BaseTeamBoardData;
};

const LEVEL_TONES: Record<string, string> = {
  "Little Dragons": "border-amber-200 bg-amber-50 text-amber-900",
  B3: "border-slate-200 bg-slate-50 text-slate-900",
  B2: "border-emerald-200 bg-emerald-50 text-emerald-900",
  B1: "border-sky-200 bg-sky-50 text-sky-900",
  Selectivo: "border-violet-200 bg-violet-50 text-violet-900",
};

const ERROR_MESSAGES: Record<string, string> = {
  debug_read_only: "La vista actual esta en modo solo lectura.",
  unauthorized: "No tienes permisos para modificar equipos base.",
  invalid_form: "Completa correctamente la seleccion del bloque.",
  invalid_team: "El equipo base seleccionado ya no es valido.",
  no_valid_players: "No hubo jugadores compatibles para mover en ese bloque.",
  assign_failed: "No se pudo actualizar el equipo base.",
  create_failed: "No se pudo crear el equipo base.",
};

export function BaseTeamBoardClient({ data }: Props) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allSelected = data.players.length > 0 && data.players.every((player) => selectedSet.has(player.enrollmentId));
  const selectedCount = selectedIds.length;

  function toggleAll() {
    setSelectedIds(allSelected ? [] : data.players.map((player) => player.enrollmentId));
  }

  function toggleOne(enrollmentId: string) {
    setSelectedIds((current) =>
      current.includes(enrollmentId)
        ? current.filter((value) => value !== enrollmentId)
        : [...current, enrollmentId],
    );
  }

  function showError(code: string) {
    setBanner({ tone: "error", text: ERROR_MESSAGES[code] ?? "No se pudo actualizar el bloque deportivo." });
  }

  function handleCreate(level: string) {
    setBanner(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("campusId", data.selectedCampusId ?? "");
      formData.set("birthYear", data.selectedBirthYear ? String(data.selectedBirthYear) : "");
      formData.set("gender", data.selectedGender);
      formData.set("level", level);
      const result = await createBaseTeamOnDemandAction(formData);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setBanner({ tone: "success", text: `Equipo base ${level} creado.` });
      router.refresh();
    });
  }

  function handleMove(teamId: string, level: string) {
    if (selectedIds.length === 0) {
      setBanner({ tone: "error", text: `Selecciona al menos un jugador antes de moverlo a ${level}.` });
      return;
    }

    setBanner(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("teamId", teamId);
      for (const enrollmentId of selectedIds) {
        formData.append("enrollmentIds", enrollmentId);
      }
      const result = await batchAssignBaseTeamAction(formData);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      setSelectedIds([]);
      setBanner({ tone: "success", text: `Jugadores movidos a ${level}.` });
      router.refresh();
    });
  }

  if (!data.selectedCampusId || !data.selectedBirthYear) {
    return (
      <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Todavia no hay suficientes jugadores activos para construir el tablero de equipos base.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {banner ? (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            banner.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Jugadores del bloque</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {data.selectedCampusName} · Cat. {data.selectedBirthYear} · {TEAM_GENDER_LABELS[data.selectedGender] ?? data.selectedGender}
              </p>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/70">
              <p className="text-xs uppercase text-slate-500 dark:text-slate-400">Seleccionados</p>
              <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedCount}</p>
            </div>
          </div>

          <div className="mb-3 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-slate-300"
              />
              Seleccionar todos
            </label>
            <span className="text-slate-500 dark:text-slate-400">{data.players.length} jugadores visibles</span>
          </div>

          <div className="space-y-2">
            {data.players.map((player) => (
              <label
                key={player.enrollmentId}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(player.enrollmentId)}
                  onChange={() => toggleOne(player.enrollmentId)}
                  className="mt-1 rounded border-slate-300"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{player.playerName}</p>
                    {player.currentLevel ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {player.currentLevel}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Sin equipo base
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">
                    {player.currentTeamName ?? "Sin equipo base asignado"}
                  </p>
                </div>
                <Link
                  href={`/players/${player.playerId}`}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Ver ficha
                </Link>
              </label>
            ))}

            {data.players.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No hay jugadores activos en este bloque. Ajusta el campus, categoria o genero.
              </p>
            ) : null}
          </div>
        </article>

        <article className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Equipos base</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              El jugador conserva un solo equipo base primario. Su nivel sigue el equipo asignado.
            </p>
          </div>

          {BASE_TEAM_LEVELS.map((level) => {
            const slot = data.slots.find((value) => value.level === level);
            if (!slot) return null;
            return (
              <div
                key={level}
                className={`rounded-lg border p-4 ${LEVEL_TONES[level] ?? "border-slate-200 bg-slate-50 text-slate-900"}`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{level}</h3>
                    <p className="text-sm opacity-80">
                      {slot.team ? slot.team.name : "Todavia no existe un equipo base para este nivel."}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs uppercase opacity-70">Plantilla</p>
                    <p className="text-lg font-semibold">{slot.roster.length}</p>
                  </div>
                </div>

                {slot.team ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs opacity-80">
                      <span>{TEAM_GENDER_LABELS[slot.team.gender ?? ""] ?? "Sin genero"}</span>
                      <span>·</span>
                      <span>{slot.team.birthYear ?? "Sin categoria"}</span>
                      <span>·</span>
                      <span>{slot.team.campusName}</span>
                    </div>

                    <div className="space-y-1">
                      {slot.roster.slice(0, 5).map((player) => (
                        <p key={player.enrollmentId} className="text-sm opacity-90">
                          {player.playerName}
                        </p>
                      ))}
                      {slot.roster.length > 5 ? (
                        <p className="text-xs opacity-70">+ {slot.roster.length - 5} mas</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isPending || selectedCount === 0}
                        onClick={() => handleMove(slot.team!.id, level)}
                        className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {selectedCount > 0 ? `Mover ${selectedCount} aqui` : "Selecciona jugadores"}
                      </button>
                      <Link
                        href={`/teams/${slot.team.id}`}
                        className="rounded-md border border-current px-3 py-2 text-sm font-medium hover:bg-white/40"
                      >
                        Ver equipo
                      </Link>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => handleCreate(level)}
                    className="rounded-md border border-current px-3 py-2 text-sm font-medium hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Crear equipo base {level}
                  </button>
                )}
              </div>
            );
          })}
        </article>
      </section>
    </div>
  );
}
