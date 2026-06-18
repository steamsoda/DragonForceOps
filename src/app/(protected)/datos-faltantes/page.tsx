import Link from "next/link";
import { requirePlayerDataContext } from "@/lib/auth/permissions";
import {
  getContactCleanupData,
  type ContactCleanupGuardian,
  type ContactCleanupRow,
  type ContactCleanupStatus,
} from "@/lib/queries/contact-cleanup";
import { saveContactCleanupGuardianAction } from "@/server/actions/contact-cleanup";
import { PageShell } from "@/components/ui/page-shell";

type SearchParams = Promise<{
  campus?: string;
  year?: string;
  gender?: string;
  q?: string;
  status?: string;
  ok?: string;
  err?: string;
}>;

const STATUS_LABELS: Record<ContactCleanupStatus, string> = {
  incomplete: "Incompletos",
  missing_primary_phone: "Sin telefono principal",
  missing_secondary_phone: "Sin telefono secundario",
  missing_email: "Sin email",
  missing_guardian: "Sin tutor",
  all: "Todos activos",
};

const ERROR_MESSAGES: Record<string, string> = {
  missing_player: "No se pudo identificar al jugador.",
  empty_contact: "Captura al menos un dato del tutor antes de guardar.",
  unauthorized: "No tienes permiso para editar este contacto.",
  update_failed: "No se pudo actualizar el tutor.",
  create_failed: "No se pudo crear el tutor.",
  link_failed: "El tutor se creo, pero no se pudo vincular al jugador.",
};

function withParams(path: string, params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) qs.set(key, value);
  }
  const query = qs.toString();
  return query ? `${path}?${query}` : path;
}

function statusTone(status: ContactCleanupStatus) {
  if (status === "missing_guardian") return "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200";
  if (status === "missing_primary_phone") return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200";
  if (status === "incomplete") return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200";
  return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function chipClass(active: boolean) {
  return active
    ? "border-portoBlue bg-blue-50 text-portoBlue dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200"
    : "border-slate-200 bg-slate-50 text-slate-700 hover:border-portoBlue dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

function MissingBadge({ children, active = true }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
        active
          ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
      }`}
    >
      {children}
    </span>
  );
}

function inputClass() {
  return "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
}

function ContactForm({
  row,
  guardian,
  returnTo,
  createAsPrimary = !guardian,
  title,
  submitLabel,
  showAdditionalTutor = false,
}: {
  row: ContactCleanupRow;
  guardian: ContactCleanupGuardian | null;
  returnTo: string;
  createAsPrimary?: boolean;
  title?: string;
  submitLabel?: string;
  showAdditionalTutor?: boolean;
}) {
  return (
    <form action={saveContactCleanupGuardianAction} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60 md:grid-cols-2 xl:grid-cols-6 xl:items-end">
      <input type="hidden" name="playerId" value={row.playerId} />
      <input type="hidden" name="guardianId" value={guardian?.id ?? ""} />
      <input type="hidden" name="createAsPrimary" value={createAsPrimary ? "true" : "false"} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {title ? <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2 xl:col-span-6">{title}</p> : null}
      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Nombre opcional
        <input name="firstName" defaultValue={guardian?.firstName ?? ""} placeholder="Si lo tienen" className={inputClass()} />
      </label>
      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Apellido opcional
        <input name="lastName" defaultValue={guardian?.lastName ?? ""} placeholder="Si lo tienen" className={inputClass()} />
      </label>
      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Telefono principal
        <input name="phonePrimary" type="tel" defaultValue={guardian?.phonePrimary ?? ""} className={inputClass()} />
      </label>
      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Telefono secundario
        <input name="phoneSecondary" type="tel" defaultValue={guardian?.phoneSecondary ?? ""} className={inputClass()} />
      </label>
      <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Email
        <input name="email" type="email" defaultValue={guardian?.email ?? ""} className={inputClass()} />
      </label>
      <div className="grid gap-2">
        <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Parentesco
          <input name="relationshipLabel" defaultValue={guardian?.relationshipLabel ?? ""} placeholder="Mama, Papa, Tutor" className={inputClass()} />
        </label>
        <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
          {submitLabel ?? (guardian ? "Guardar" : "Crear tutor")}
        </button>
      </div>
      {showAdditionalTutor ? (
        <div className="grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-700 md:col-span-2 md:grid-cols-2 xl:col-span-6 xl:grid-cols-6 xl:items-end">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 md:col-span-2 xl:col-span-6">Segundo tutor opcional</p>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Nombre opcional
            <input name="additionalFirstName" placeholder="Si lo tienen" className={inputClass()} />
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Apellido opcional
            <input name="additionalLastName" placeholder="Si lo tienen" className={inputClass()} />
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Telefono principal
            <input name="additionalPhonePrimary" type="tel" className={inputClass()} />
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Telefono secundario
            <input name="additionalPhoneSecondary" type="tel" className={inputClass()} />
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Email
            <input name="additionalEmail" type="email" className={inputClass()} />
          </label>
          <label className="grid gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Parentesco
            <input name="additionalRelationshipLabel" placeholder="Mama, Papa, Tutor" className={inputClass()} />
          </label>
        </div>
      ) : null}
    </form>
  );
}

function PlayerContactCard({ row, returnTo }: { row: ContactCleanupRow; returnTo: string }) {
  const badges = [
    row.missingGuardian ? "Sin tutor" : null,
    row.missingGuardianName ? "Nombre tutor incompleto" : null,
    row.missingPrimaryPhone ? "Sin telefono principal" : null,
    row.missingSecondaryPhone ? "Sin telefono secundario" : null,
    row.missingEmail ? "Sin email" : null,
  ].filter((badge): badge is string => Boolean(badge));

  return (
    <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/players/${row.playerId}`} className="text-base font-semibold text-portoBlue hover:underline">
              {row.playerName}
            </Link>
            <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {row.publicPlayerId}
            </span>
            {row.birthYear ? (
              <span className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                Cat. {row.birthYear}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {row.campusName} | {row.trainingGroupName}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-500">{row.trainingGroupSubtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {badges.length > 0 ? badges.map((badge) => <MissingBadge key={badge}>{badge}</MissingBadge>) : <MissingBadge active={false}>Completo</MissingBadge>}
        </div>
      </div>

      {row.guardians.length > 0 ? (
        <div className="space-y-2">
          {row.guardians.map((guardian) => (
            <div key={guardian.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <span className="font-medium">{guardian.fullName}</span>
                {guardian.isPrimary ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-portoBlue dark:bg-blue-950/30 dark:text-blue-200">Principal</span> : null}
                {guardian.relationshipLabel ? <span className="text-slate-500 dark:text-slate-400">{guardian.relationshipLabel}</span> : null}
              </div>
              <ContactForm row={row} guardian={guardian} returnTo={returnTo} />
            </div>
          ))}
          {row.guardians.length < 2 ? (
            <ContactForm row={row} guardian={null} returnTo={returnTo} createAsPrimary={false} title="Agregar segundo tutor" submitLabel="Crear segundo tutor" />
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-400">No hay tutor vinculado. Captura un contacto principal para este jugador.</p>
          <ContactForm row={row} guardian={null} returnTo={returnTo} createAsPrimary title="Tutor principal" submitLabel="Crear tutor(es)" showAdditionalTutor />
        </div>
      )}
    </article>
  );
}

export default async function DatosFaltantesPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePlayerDataContext("/unauthorized");
  const params = await searchParams;
  const data = await getContactCleanupData({
    campusId: params.campus,
    birthYear: params.year,
    gender: params.gender,
    q: params.q,
    status: params.status,
  });
  const selectedYearParam = data.selectedBirthYear ? String(data.selectedBirthYear) : "all";
  const returnTo = withParams("/datos-faltantes", {
    campus: data.selectedCampusId,
    year: selectedYearParam,
    gender: data.selectedGender || undefined,
    q: data.q,
    status: data.status,
  });

  return (
    <PageShell
      title="Datos faltantes"
      subtitle="Cola rapida para completar telefonos y datos de tutores sin mostrar informacion financiera."
      breadcrumbs={[{ label: "Datos faltantes" }]}
      wide
    >
      <div className="space-y-4">
        {params.ok === "contact_saved" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            Contacto guardado correctamente.
          </div>
        ) : null}
        {params.err ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
            {ERROR_MESSAGES[params.err] ?? "No se pudo guardar el contacto."}
          </div>
        ) : null}

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Campus</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.campuses.map((campus) => (
                <Link
                  key={campus.id}
                  href={withParams("/datos-faltantes", {
                    campus: campus.id,
                    year: selectedYearParam,
                    gender: data.selectedGender || undefined,
                    q: data.q,
                    status: data.status,
                  })}
                  className={`rounded-md border px-4 py-3 text-sm font-semibold ${chipClass(campus.id === data.selectedCampusId)}`}
                >
                  {campus.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Categoria</p>
              <div className="flex flex-wrap gap-2">
                {data.birthYears.map((year) => (
                  <Link
                    key={year}
                    href={withParams("/datos-faltantes", {
                      campus: data.selectedCampusId,
                      year: String(year),
                      gender: data.selectedGender || undefined,
                      q: data.q,
                      status: data.status,
                    })}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${chipClass(data.selectedBirthYear === year)}`}
                  >
                    {year}
                  </Link>
                ))}
                <Link
                  href={withParams("/datos-faltantes", {
                    campus: data.selectedCampusId,
                    year: "all",
                    gender: data.selectedGender || undefined,
                    q: data.q,
                    status: data.status,
                  })}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${chipClass(data.selectedBirthYear === null)}`}
                >
                  Todas
                </Link>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Genero</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "", label: "Todos" },
                  { value: "male", label: "Varonil" },
                  { value: "female", label: "Femenil" },
                ].map((option) => (
                  <Link
                    key={option.label}
                    href={withParams("/datos-faltantes", {
                      campus: data.selectedCampusId,
                      year: selectedYearParam,
                      gender: option.value || undefined,
                      q: data.q,
                      status: data.status,
                    })}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${chipClass(data.selectedGender === option.value)}`}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[220px_minmax(220px,1fr)_auto] md:items-end">
          <input type="hidden" name="campus" value={data.selectedCampusId} />
          <input type="hidden" name="year" value={selectedYearParam} />
          {data.selectedGender ? <input type="hidden" name="gender" value={data.selectedGender} /> : null}
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Cola</span>
            <select name="status" defaultValue={data.status} className={inputClass()}>
              {(Object.keys(STATUS_LABELS) as ContactCleanupStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">Buscar</span>
            <input name="q" type="search" defaultValue={data.q} placeholder="Jugador, tutor, telefono o grupo" className={inputClass()} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark">
              Aplicar
            </button>
            <Link href={withParams("/datos-faltantes", { campus: data.selectedCampusId, year: selectedYearParam, gender: data.selectedGender || undefined })} className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">
              Limpiar
            </Link>
          </div>
        </form>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as ContactCleanupStatus[]).map((status) => (
            <Link
              key={status}
              href={withParams("/datos-faltantes", {
                campus: data.selectedCampusId,
                year: selectedYearParam,
                gender: data.selectedGender || undefined,
                q: data.q,
                status,
              })}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(status)} ${data.status === status ? "ring-2 ring-portoBlue/30" : ""}`}
            >
              {STATUS_LABELS[status]}: {data.counts[status]}
            </Link>
          ))}
        </div>

        <p className="text-sm text-slate-600 dark:text-slate-400">
          {data.rows.length} {data.rows.length === 1 ? "jugador en la cola" : "jugadores en la cola"}.
        </p>

        {data.rows.length > 0 ? (
          <div className="space-y-3">
            {data.rows.map((row) => (
              <PlayerContactCard key={row.enrollmentId} row={row} returnTo={returnTo} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            No hay jugadores que coincidan con esta cola.
          </div>
        )}
      </div>
    </PageShell>
  );
}
