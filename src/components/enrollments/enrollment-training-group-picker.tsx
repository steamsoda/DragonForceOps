"use client";

import { useEffect, useMemo, useState } from "react";
import {
  rankEnrollmentTrainingGroups,
  trainingGroupMatchesBirthYear,
  type EnrollmentTrainingGroupOption,
  type EnrollmentTrainingProgram,
} from "@/lib/training-groups/enrollment-selection";
import {
  TRAINING_GROUP_GENDER_LABELS,
  TRAINING_GROUP_PROGRAM_LABELS,
  formatTrainingGroupBirthYearRange,
} from "@/lib/training-groups/shared";

type Props = {
  campuses: Array<{ id: string; code: string; name: string }>;
  groups: EnrollmentTrainingGroupOption[];
  campusId: string;
  birthDate: string | null;
  gender: string | null;
  initialGroupId?: string | null;
  onValidityChange?: (valid: boolean) => void;
  onSelectionChange?: (selection: EnrollmentTrainingGroupSelection) => void;
};

export type EnrollmentTrainingGroupSelection = {
  program: EnrollmentTrainingProgram;
  group: EnrollmentTrainingGroupOption | null;
};

const PROGRAMS: EnrollmentTrainingProgram[] = ["futbol_para_todos", "selectivo", "little_dragons"];

function formatTime(value: string | null) {
  return value ? value.slice(0, 5) : null;
}

export function EnrollmentTrainingGroupPicker({
  campuses,
  groups,
  campusId,
  birthDate,
  gender,
  initialGroupId = null,
  onValidityChange,
  onSelectionChange,
}: Props) {
  const initialGroup = initialGroupId ? groups.find((group) => group.id === initialGroupId) ?? null : null;
  const [program, setProgram] = useState<EnrollmentTrainingProgram>(initialGroup?.program ?? "futbol_para_todos");
  const [trainingGroupId, setTrainingGroupId] = useState(initialGroup?.id ?? "");
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const selectedCampus = campuses.find((campus) => campus.id === campusId) ?? null;
  const birthYear = birthDate ? Number(birthDate.slice(0, 4)) : null;

  const availablePrograms = useMemo(
    () => PROGRAMS.filter((option) => option !== "little_dragons" || selectedCampus?.code === "LINDA_VISTA"),
    [selectedCampus?.code],
  );

  useEffect(() => {
    if (!availablePrograms.includes(program)) {
      setProgram("futbol_para_todos");
      setTrainingGroupId("");
      setOverrideConfirmed(false);
    }
  }, [availablePrograms, program]);

  const rankedGroups = useMemo(
    () => rankEnrollmentTrainingGroups({ groups, campusId, program, birthYear, gender }),
    [birthYear, campusId, gender, groups, program],
  );

  useEffect(() => {
    const currentStillAvailable = rankedGroups.some((group) => group.id === trainingGroupId);
    if (currentStillAvailable) return;
    setTrainingGroupId(rankedGroups[0]?.id ?? "");
    setOverrideConfirmed(false);
  }, [rankedGroups, trainingGroupId]);

  const selectedGroup = rankedGroups.find((group) => group.id === trainingGroupId) ?? null;
  const exactBirthYear = selectedGroup ? trainingGroupMatchesBirthYear(selectedGroup, birthYear) : false;
  const valid = Boolean(selectedGroup && (exactBirthYear || overrideConfirmed));

  useEffect(() => {
    onValidityChange?.(valid);
  }, [onValidityChange, valid]);

  useEffect(() => {
    onSelectionChange?.({ program, group: selectedGroup });
  }, [onSelectionChange, program, selectedGroup]);

  return (
    <section className="space-y-4 rounded-md border border-sky-200 bg-sky-50 p-4">
      <input type="hidden" name="trainingProgram" value={program} />
      <input type="hidden" name="trainingGroupOverrideConfirmed" value={overrideConfirmed ? "1" : "0"} />

      <div>
        <h2 className="text-sm font-semibold text-slate-800">Programa y grupo de entrenamiento</h2>
        <p className="mt-1 text-sm text-slate-600">
          Confirma dónde entrenará el jugador. La inscripción no puede terminar sin un grupo activo.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Programa</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {availablePrograms.map((option) => (
            <button
              key={option}
              type="button"
              disabled={!campusId}
              onClick={() => {
                setProgram(option);
                setTrainingGroupId("");
                setOverrideConfirmed(false);
              }}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                program === option
                  ? "border-portoBlue bg-portoBlue text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {TRAINING_GROUP_PROGRAM_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      {!campusId || !birthDate || !gender ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Selecciona campus y captura fecha de nacimiento y género para proponer el grupo.
        </div>
      ) : rankedGroups.length === 0 ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          No hay un grupo activo compatible con este campus, programa y género. Revisa la configuración antes de crear la inscripción.
        </div>
      ) : (
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700">Grupo confirmado</span>
          <select
            required
            name="trainingGroupId"
            value={trainingGroupId}
            onChange={(event) => {
              setTrainingGroupId(event.target.value);
              setOverrideConfirmed(false);
            }}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2"
          >
            {rankedGroups.map((group, index) => {
              const category = formatTrainingGroupBirthYearRange(group.birthYearMin, group.birthYearMax);
              const time = [formatTime(group.startTime), formatTime(group.endTime)].filter(Boolean).join("-");
              const exact = trainingGroupMatchesBirthYear(group, birthYear);
              return (
                <option key={group.id} value={group.id}>
                  {index === 0 ? "Sugerido: " : ""}{group.name} | Cat. {category} | {TRAINING_GROUP_GENDER_LABELS[group.gender] ?? group.gender}{time ? ` | ${time}` : ""}{exact ? "" : " | categoría distinta"}
                </option>
              );
            })}
          </select>
          <p className="text-xs text-slate-500">
            La primera opción es la coincidencia más cercana. Puedes elegir otro grupo compatible de este programa.
          </p>
        </label>
      )}

      {selectedGroup && !exactBirthYear ? (
        <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <input
            required
            type="checkbox"
            checked={overrideConfirmed}
            onChange={(event) => setOverrideConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-amber-400"
          />
          <span>
            Confirmo que este grupo no coincide exactamente con la categoría {birthYear}, pero es la asignación operativa correcta.
          </span>
        </label>
      ) : selectedGroup ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Coincidencia confirmada por campus, programa, categoría y género.
        </div>
      ) : null}
    </section>
  );
}
