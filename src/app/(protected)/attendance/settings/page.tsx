import { redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireAttendanceWriteContext } from "@/lib/auth/permissions";
import { getTrainingGroupsManagementData, type TrainingGroupReviewState, type TrainingGroupSummaryRow } from "@/lib/queries/training-groups";
import {
  createTrainingGroupAction,
  updateTrainingGroupAction,
  assignTrainingGroupAction,
  applySuggestedTrainingGroupsAction,
} from "@/server/actions/training-groups";
import {
  TRAINING_GROUP_GENDER_LABELS,
  TRAINING_GROUP_GENDER_OPTIONS,
  TRAINING_GROUP_PROGRAM_LABELS,
  TRAINING_GROUP_PROGRAM_OPTIONS,
  TRAINING_GROUP_STATUS_LABELS,
  TRAINING_GROUP_STATUS_OPTIONS,
} from "@/lib/training-groups/shared";
import { getMonterreyDateString } from "@/lib/time";

type SearchParams = Promise<{
  campus?: string;
  program?: string;
  status?: string;
  review?: string;
  birthYear?: string;
  ok?: string;
  err?: string;
  count?: string;
}>;

const REVIEW_LABELS: Record<TrainingGroupReviewState, string> = {
  assigned: "Con grupo",
  suggested: "Sugerencia unica",
  ambiguous: "Revision manual",
  unmatched: "Sin grupo",
};

function chip(label: string, tone: "slate" | "amber" | "emerald" | "blue" | "rose" = "slate") {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
    amber: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200",
    blue: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200",
    rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
  };

  return (
    <span className={`inline-flex min-h-6 items-center justify-center rounded-full border px-2.5 py-0.5 text-center text-xs font-medium leading-none ${tones[tone]}`}>
      {label}
    </span>
  );
}

function buildHref(params: {
  campus?: string;
  program?: string;
  status?: string;
  review?: string;
  birthYear?: string;
}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/attendance/settings?${query}` : "/attendance/settings";
}

function GroupEditor({
  group,
  coachOptions,
  canManage,
}: {
  group: TrainingGroupSummaryRow;
  coachOptions: Array<{ id: string; campusId: string; name: string }>;
  canManage: boolean;
}) {
  const campusCoachOptions = coachOptions.filter((coach) => coach.campusId === group.campusId);

  return (
    <details className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{group.name}</p>
            {chip(group.programLabel, "blue")}
            {chip(group.statusLabel, group.status === "active" ? "emerald" : group.status === "projected" ? "amber" : "slate")}
            {group.groupCode ? chip(group.groupCode, "slate") : null}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {group.campusName} | Cat. {group.birthYearLabel} | {group.genderLabel}
            {group.startTime && group.endTime ? ` | ${group.startTime}-${group.endTime}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {chip(`${group.activeAssignments} activos`, group.activeAssignments > 0 ? "emerald" : "slate")}
            {group.levelLabel ? chip(group.levelLabel, "slate") : null}
            {group.coachNamesLabel ? chip(`Coach ${group.coachNamesLabel}`, "slate") : chip("Sin coach", "rose")}
          </div>
          {group.notes ? <p className="text-xs text-slate-500 dark:text-slate-400">{group.notes}</p> : null}
        </div>
        <span className="text-sm font-medium text-portoBlue">Editar</span>
      </summary>
      <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-700">
        {canManage ? (
          <form action={updateTrainingGroupAction.bind(null, group.id)} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Nombre</span>
              <input name="name" defaultValue={group.name} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Programa</span>
              <select name="program" defaultValue={group.program} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                {TRAINING_GROUP_PROGRAM_OPTIONS.map((value) => (
                  <option key={value} value={value}>{TRAINING_GROUP_PROGRAM_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Nivel</span>
              <input name="level_label" defaultValue={group.levelLabel ?? ""} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Codigo</span>
              <input name="group_code" defaultValue={group.groupCode ?? ""} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Genero</span>
              <select name="gender" defaultValue={group.gender} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                {TRAINING_GROUP_GENDER_OPTIONS.map((value) => (
                  <option key={value} value={value}>{TRAINING_GROUP_GENDER_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Ano minimo</span>
              <input name="birth_year_min" type="number" defaultValue={group.birthYearMin ?? ""} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Ano maximo</span>
              <input name="birth_year_max" type="number" defaultValue={group.birthYearMax ?? ""} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Estado</span>
              <select name="status" defaultValue={group.status} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                {TRAINING_GROUP_STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>{TRAINING_GROUP_STATUS_LABELS[value]}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Inicio</span>
              <input name="start_time" type="time" defaultValue={group.startTime ?? ""} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Fin</span>
              <input name="end_time" type="time" defaultValue={group.endTime ?? ""} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <label className="grid gap-1 text-sm xl:col-span-2">
              <span className="font-medium">Coach principal</span>
              <select name="primary_coach_id" defaultValue={group.primaryCoachId ?? ""} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                <option value="">Sin coach principal</option>
                {campusCoachOptions.map((coach) => (
                  <option key={coach.id} value={coach.id}>{coach.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm xl:col-span-2">
              <span className="font-medium">Coaches vinculados</span>
              <select name="coach_ids" multiple defaultValue={group.coachIds} size={Math.min(6, Math.max(3, campusCoachOptions.length))} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                {campusCoachOptions.map((coach) => (
                  <option key={coach.id} value={coach.id}>{coach.name}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm xl:col-span-4">
              <span className="font-medium">Notas</span>
              <textarea name="notes" defaultValue={group.notes ?? ""} rows={2} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
            </label>
            <div className="xl:col-span-4">
              <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Guardar grupo</button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Solo directores y Director Deportivo pueden editar grupos.</p>
        )}
      </div>
    </details>
  );
}

export default async function TrainingGroupsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireAttendanceWriteContext("/unauthorized");
  if (!context.isDirector && !context.isSportsDirector) redirect("/unauthorized");

  const params = await searchParams;
  const data = await getTrainingGroupsManagementData({
    campusId: params.campus,
    program: params.program,
    status: params.status,
    review: params.review,
    birthYear: params.birthYear,
  });

  if (!data) redirect("/unauthorized");

  const successMessage =
    params.ok === "group_created"
      ? "Grupo creado correctamente."
      : params.ok === "group_updated"
        ? "Grupo actualizado correctamente."
        : params.ok === "assignment_saved"
          ? "Asignacion guardada correctamente."
          : params.ok === "suggestions_applied"
            ? `Sugerencias aplicadas: ${params.count ?? "0"}`
            : null;

  const today = getMonterreyDateString();

  return (
    <PageShell
      title="Configuracion de grupos"
      subtitle="Catalogo editable para asistencia y seguimiento deportivo. No cambia el flujo de competencias."
      breadcrumbs={[{ label: "Asistencia", href: "/attendance" }, { label: "Configuracion" }]}
      wide
    >
      <div className="space-y-6">
        {params.err ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">Error: {params.err}</div>
        ) : null}
        {successMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{successMessage}</div>
        ) : null}

        <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_auto]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Campus</span>
            <select name="campus" defaultValue={data.selectedCampusId} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
              <option value="">Todos</option>
              {data.campuses.map((campus) => (
                <option key={campus.id} value={campus.id}>{campus.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Programa</span>
            <select name="program" defaultValue={data.selectedProgram} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
              <option value="">Todos</option>
              {TRAINING_GROUP_PROGRAM_OPTIONS.map((value) => (
                <option key={value} value={value}>{TRAINING_GROUP_PROGRAM_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Estado grupo</span>
            <select name="status" defaultValue={data.selectedStatus} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
              <option value="">Todos</option>
              {TRAINING_GROUP_STATUS_OPTIONS.map((value) => (
                <option key={value} value={value}>{TRAINING_GROUP_STATUS_LABELS[value]}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Revision</span>
            <select name="review" defaultValue={data.selectedReview} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
              <option value="all">Todas</option>
              <option value="assigned">Con grupo</option>
              <option value="suggested">Sugerencia unica</option>
              <option value="ambiguous">Revision manual</option>
              <option value="unmatched">Sin grupo</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Categoria</span>
            <input name="birthYear" type="number" defaultValue={data.selectedBirthYear} placeholder="2014" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
          </label>
          <div className="flex items-end">
            <button className="w-full rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Aplicar</button>
          </div>
          <div className="flex items-end">
            <a href="/attendance/settings" className="w-full rounded-md border border-slate-300 px-4 py-2 text-center text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
              Limpiar
            </a>
          </div>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs uppercase tracking-wide text-slate-400">Grupos visibles</p>
            <p className="mt-1 text-3xl font-semibold">{data.groups.length}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
            <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Con grupo</p>
            <p className="mt-1 text-3xl font-semibold text-emerald-900 dark:text-emerald-100">{data.reviewCounts.assigned}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-300">Sugerencia unica</p>
            <p className="mt-1 text-3xl font-semibold text-amber-900 dark:text-amber-100">{data.reviewCounts.suggested}</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-800 dark:bg-rose-950/20">
            <p className="text-xs uppercase tracking-wide text-rose-700 dark:text-rose-300">Revision / sin grupo</p>
            <p className="mt-1 text-3xl font-semibold text-rose-900 dark:text-rose-100">{data.reviewCounts.ambiguous + data.reviewCounts.unmatched}</p>
          </div>
        </div>

        {data.canManage ? (
          <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900 dark:text-slate-100">Crear grupo</summary>
            <form action={createTrainingGroupAction} className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Campus</span>
                <select name="campus_id" required className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  {data.campuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>{campus.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Nombre</span>
                <input name="name" required className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Programa</span>
                <select name="program" defaultValue="futbol_para_todos" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  {TRAINING_GROUP_PROGRAM_OPTIONS.map((value) => (
                    <option key={value} value={value}>{TRAINING_GROUP_PROGRAM_LABELS[value]}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Nivel</span>
                <input name="level_label" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Codigo</span>
                <input name="group_code" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Genero</span>
                <select name="gender" defaultValue="mixed" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  {TRAINING_GROUP_GENDER_OPTIONS.map((value) => (
                    <option key={value} value={value}>{TRAINING_GROUP_GENDER_LABELS[value]}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Ano minimo</span>
                <input name="birth_year_min" type="number" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Ano maximo</span>
                <input name="birth_year_max" type="number" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Inicio</span>
                <input name="start_time" type="time" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Fin</span>
                <input name="end_time" type="time" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Estado</span>
                <select name="status" defaultValue="active" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  {TRAINING_GROUP_STATUS_OPTIONS.map((value) => (
                    <option key={value} value={value}>{TRAINING_GROUP_STATUS_LABELS[value]}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="font-medium">Coach principal</span>
                <select name="primary_coach_id" className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  <option value="">Sin coach principal</option>
                  {data.coachOptions.map((coach) => (
                    <option key={coach.id} value={coach.id}>{coach.campusName} | {coach.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm xl:col-span-2">
                <span className="font-medium">Coaches vinculados</span>
                <select name="coach_ids" multiple size={6} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950">
                  {data.coachOptions.map((coach) => (
                    <option key={coach.id} value={coach.id}>{coach.campusName} | {coach.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm xl:col-span-4">
                <span className="font-medium">Notas</span>
                <textarea name="notes" rows={2} className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950" />
              </label>
              <div className="xl:col-span-4">
                <button className="rounded-md bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark">Crear grupo</button>
              </div>
            </form>
          </details>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Catalogo de grupos</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Modelo operativo para asistencia y asignacion deportiva.</p>
            </div>
          </div>
          <div className="grid gap-3">
            {data.groups.map((group) => (
              <GroupEditor
                key={group.id}
                group={group}
                coachOptions={data.coachOptions.map((coach) => ({ id: coach.id, campusId: coach.campusId, name: coach.name }))}
                canManage={data.canManage}
              />
            ))}
            {data.groups.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                No hay grupos con esos filtros.
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Revision de asignaciones</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Autoasigna solo coincidencias unicas; el resto queda en revision manual.</p>
            </div>
            {data.canManage ? (
              <form action={applySuggestedTrainingGroupsAction}>
                {data.selectedCampusId ? <input type="hidden" name="campus_id" value={data.selectedCampusId} /> : null}
                {data.selectedBirthYear ? <input type="hidden" name="birth_year" value={data.selectedBirthYear} /> : null}
                <button className="rounded-md border border-emerald-300 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                  Aplicar sugerencias unicas
                </button>
              </form>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <a href={buildHref({ campus: data.selectedCampusId || undefined, program: data.selectedProgram || undefined, status: data.selectedStatus || undefined, birthYear: data.selectedBirthYear || undefined, review: "assigned" })}>{chip(`Con grupo ${data.reviewCounts.assigned}`, "emerald")}</a>
            <a href={buildHref({ campus: data.selectedCampusId || undefined, program: data.selectedProgram || undefined, status: data.selectedStatus || undefined, birthYear: data.selectedBirthYear || undefined, review: "suggested" })}>{chip(`Sugerencia ${data.reviewCounts.suggested}`, "amber")}</a>
            <a href={buildHref({ campus: data.selectedCampusId || undefined, program: data.selectedProgram || undefined, status: data.selectedStatus || undefined, birthYear: data.selectedBirthYear || undefined, review: "ambiguous" })}>{chip(`Revision manual ${data.reviewCounts.ambiguous}`, "rose")}</a>
            <a href={buildHref({ campus: data.selectedCampusId || undefined, program: data.selectedProgram || undefined, status: data.selectedStatus || undefined, birthYear: data.selectedBirthYear || undefined, review: "unmatched" })}>{chip(`Sin grupo ${data.reviewCounts.unmatched}`, "rose")}</a>
            <a href={buildHref({ campus: data.selectedCampusId || undefined, program: data.selectedProgram || undefined, status: data.selectedStatus || undefined, birthYear: data.selectedBirthYear || undefined })}>{chip("Ver todo", "slate")}</a>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">Jugador</th>
                  <th className="px-3 py-2">Contexto</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Sugerencia</th>
                  <th className="px-3 py-2">Asignacion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.reviewRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-slate-500 dark:text-slate-400">No hay jugadores con esos filtros.</td>
                  </tr>
                ) : (
                  data.reviewRows.map((row) => (
                    <tr key={row.enrollmentId} className="align-top">
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{row.playerName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{row.campusName} | Cat. {row.birthYear ?? "-"}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                        <p>{row.genderLabel}</p>
                        <p className="text-xs">Programa {row.resolvedProgramLabel}</p>
                        <p className="text-xs">Nivel {row.resolvedLevel ?? row.playerLevel ?? "-"}</p>
                        <p className="text-xs">{row.competitionTeamNames.length > 0 ? row.competitionTeamNames.join(", ") : "Sin equipo de competencia"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {chip(REVIEW_LABELS[row.reviewState], row.reviewState === "assigned" ? "emerald" : row.reviewState === "suggested" ? "amber" : "rose")}
                          {row.currentTrainingGroupName ? chip(row.currentTrainingGroupName, "blue") : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-600 dark:text-slate-400">
                        <p>{row.suggestionGroupName ?? "Sin sugerencia"}</p>
                        <p className="text-xs">{row.suggestionReason}</p>
                      </td>
                      <td className="px-3 py-3">
                        {data.canManage ? (
                          <form action={assignTrainingGroupAction} className="grid gap-2">
                            <input type="hidden" name="enrollment_id" value={row.enrollmentId} />
                            <input type="hidden" name="assignment_start" value={row.enrollmentStartDate || today} />
                            <select
                              name="training_group_id"
                              defaultValue={row.currentTrainingGroupId ?? row.suggestionGroupId ?? ""}
                              className="rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-950"
                            >
                              <option value="">Selecciona grupo</option>
                              {row.manualOptions.map((option) => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                            </select>
                            <button className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
                              Guardar
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs text-slate-400">Solo lectura</span>
                        )}
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
