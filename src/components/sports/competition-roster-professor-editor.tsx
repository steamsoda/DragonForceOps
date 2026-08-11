"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CompetitionRosterSquadProfessorAssignment } from "@/lib/queries/competition-rosters";
import { setCompetitionRosterSquadProfessorsInlineAction } from "@/server/actions/competition-rosters";

type Props = {
  tournamentId: string;
  campusId: string;
  program: string;
  professorOptions: Array<{ id: string; name: string }>;
  assignments: CompetitionRosterSquadProfessorAssignment[];
};

function assignmentLabel(assignment: CompetitionRosterSquadProfessorAssignment) {
  if (assignment.assignmentMode === "inherited") return "Hereda del grupo";
  if (assignment.professors.length === 0) return "Sin profesor";
  return "Asignacion manual";
}

export function CompetitionRosterProfessorEditor({ tournamentId, campusId, program, professorOptions, assignments }: Props) {
  const router = useRouter();
  const [editingSquadId, setEditingSquadId] = useState<string | null>(null);
  const [selectedCoachIds, setSelectedCoachIds] = useState<string[]>([]);
  const [primaryCoachId, setPrimaryCoachId] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function beginEdit(assignment: CompetitionRosterSquadProfessorAssignment) {
    const ids = assignment.professors.map((professor) => professor.id);
    setEditingSquadId(assignment.squadId);
    setSelectedCoachIds(ids);
    setPrimaryCoachId(assignment.professors.find((professor) => professor.isPrimary)?.id ?? ids[0] ?? "");
    setMessage(null);
  }

  function toggleCoach(coachId: string) {
    setSelectedCoachIds((current) => {
      const next = current.includes(coachId) ? current.filter((id) => id !== coachId) : [...current, coachId];
      if (!next.includes(primaryCoachId)) setPrimaryCoachId(next[0] ?? "");
      return next;
    });
  }

  function save(assignment: CompetitionRosterSquadProfessorAssignment, useInherited: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await setCompetitionRosterSquadProfessorsInlineAction({
        tournamentId,
        campusId,
        program,
        squadId: assignment.squadId,
        coachIds: useInherited ? [] : selectedCoachIds,
        primaryCoachId: useInherited ? null : primaryCoachId,
        useInherited,
      });
      setMessage({ tone: result.ok ? "ok" : "error", text: result.message });
      if (result.ok) {
        setEditingSquadId(null);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">Profesores de equipos</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Los equipos normales, Azul y Blanco heredan los profesores de su grupo. Los equipos combinados requieren una seleccion manual.
      </p>

      {message ? (
        <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      ) : null}

      <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        {assignments.map((assignment) => {
          const editing = editingSquadId === assignment.squadId;
          return (
            <div key={assignment.squadId} className="py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950 dark:text-slate-50">{assignment.squadName}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${assignment.requiresManualAssignment && assignment.professors.length === 0 ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>
                      {assignmentLabel(assignment)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{assignment.sourceGroupNames.join(" + ") || "Sin grupo fuente"}</p>
                  <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                    {assignment.professors.length > 0
                      ? assignment.professors.map((professor) => `${professor.name}${professor.isPrimary ? " (principal)" : ""}`).join(", ")
                      : "Selecciona el profesor responsable de este equipo."}
                  </p>
                </div>
                <button type="button" onClick={() => editing ? setEditingSquadId(null) : beginEdit(assignment)} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                  {editing ? "Cerrar" : "Editar profesores"}
                </button>
              </div>

              {editing ? (
                <div className="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-800/60">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {professorOptions.map((professor) => (
                      <label key={professor.id} className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                        <input type="checkbox" checked={selectedCoachIds.includes(professor.id)} onChange={() => toggleCoach(professor.id)} />
                        <span>{professor.name}</span>
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Profesor principal
                    <select value={primaryCoachId} onChange={(event) => setPrimaryCoachId(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 sm:max-w-sm dark:border-slate-600 dark:bg-slate-950">
                      <option value="">Selecciona profesor principal</option>
                      {professorOptions.filter((professor) => selectedCoachIds.includes(professor.id)).map((professor) => (
                        <option key={professor.id} value={professor.id}>{professor.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled={isPending || selectedCoachIds.length === 0 || !primaryCoachId} onClick={() => save(assignment, false)} className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                      {isPending ? "Guardando..." : "Guardar asignacion"}
                    </button>
                    {!assignment.requiresManualAssignment && assignment.assignmentMode === "manual" ? (
                      <button type="button" disabled={isPending} onClick={() => save(assignment, true)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                        Volver a heredar del grupo
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
