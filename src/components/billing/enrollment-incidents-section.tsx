"use client";

import { useState } from "react";

type IncidentRow = {
  id: string;
  typeCode: string;
  typeName: string;
  note: string | null;
  omitPeriodMonth: string | null;
  startsOn: string | null;
  endsOn: string | null;
  status: "record_only" | "omission_active" | "used" | "cancelled";
  createdAt: string;
  cancelledAt: string | null;
  consumedAt: string | null;
};

type EnrollmentIncidentsSectionProps = {
  rows: IncidentRow[];
  createAction: (formData: FormData) => Promise<void>;
  cancelAction: (incidentId: string) => Promise<void>;
  replaceAction: (incidentId: string, formData: FormData) => Promise<void>;
  canManage: boolean;
  defaultMonth: string;
};

const INCIDENT_OPTIONS = [
  { value: "absence", label: "Ausencia" },
  { value: "injury", label: "Lesión" },
  { value: "other", label: "Otro" },
] as const;

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  });
}

function formatPeriodMonth(value: string | null) {
  if (!value) return "-";
  const [year, month] = value.split("-");
  const monthLabels = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];
  const monthIndex = Number(month) - 1;
  return `${monthLabels[monthIndex] ?? month} ${year}`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return day ? `${day}/${month}/${year}` : value;
}

function statusBadge(status: IncidentRow["status"]) {
  switch (status) {
    case "omission_active":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
    case "used":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "cancelled":
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    default:
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  }
}

function statusLabel(status: IncidentRow["status"]) {
  switch (status) {
    case "omission_active":
      return "Omisión activa";
    case "used":
      return "Usada";
    case "cancelled":
      return "Cancelada";
    default:
      return "Solo registro";
  }
}

function IncidentFormFields({
  defaultMonth,
  initialType = "absence",
  initialMode = "record_only",
  initialNote = "",
  initialStartsOn = "",
  initialEndsOn = "",
}: {
  defaultMonth: string;
  initialType?: string;
  initialMode?: "record_only" | "omit_month";
  initialNote?: string;
  initialStartsOn?: string;
  initialEndsOn?: string;
}) {
  const [mode, setMode] = useState<"record_only" | "omit_month">(initialMode);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Tipo</span>
          <select
            name="incident_type"
            defaultValue={initialType}
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          >
            {INCIDENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="space-y-1 text-sm md:col-span-2">
          <legend className="font-medium text-slate-700 dark:text-slate-300">Acción</legend>
          <div className="flex flex-wrap gap-2">
            <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600">
              <input
                type="radio"
                name="mode"
                value="record_only"
                defaultChecked={initialMode === "record_only"}
                onChange={() => setMode("record_only")}
              />
              <span>Solo registrar</span>
            </label>
            <label className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600">
              <input
                type="radio"
                name="mode"
                value="omit_month"
                defaultChecked={initialMode === "omit_month"}
                onChange={() => setMode("omit_month")}
              />
              <span>Omitir mensualidad</span>
            </label>
          </div>
        </fieldset>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700 dark:text-slate-300">Nota (opcional)</span>
          <input
            type="text"
            name="note"
            defaultValue={initialNote}
            placeholder="Ej: yeso por 4 semanas, viaje familiar, etc."
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Desde (opcional)</span>
          <input
            type="date"
            name="starts_on"
            defaultValue={initialStartsOn}
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Hasta (opcional)</span>
          <input
            type="date"
            name="ends_on"
            defaultValue={initialEndsOn}
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Mes a omitir</span>
          <input
            type="month"
            name="omit_period_month"
            defaultValue={defaultMonth}
            required={mode === "omit_month"}
            disabled={mode !== "omit_month"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:disabled:bg-slate-800"
          />
        </label>
      </div>
    </div>
  );
}

export function EnrollmentIncidentsSection({
  rows,
  createAction,
  cancelAction,
  replaceAction,
  canManage,
  defaultMonth,
}: EnrollmentIncidentsSectionProps) {
  const activeRows = rows.filter((row) => row.status === "record_only" || row.status === "omission_active");
  const historyRows = rows.filter((row) => row.status === "used" || row.status === "cancelled");

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Ausencias / lesiones</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Registra incidencias operativas y, solo si aplica, omite una mensualidad futura o del mes actual.
        </p>
      </div>

      {canManage ? (
        <form
          action={createAction}
          className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
        >
          <IncidentFormFields defaultMonth={defaultMonth} />
          <button
            type="submit"
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
          >
            Registrar incidencia
          </button>
        </form>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Activas / próximas</h3>
            <span className="text-xs text-slate-400">{activeRows.length} registro{activeRows.length !== 1 ? "s" : ""}</span>
          </div>
          {activeRows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No hay incidencias activas.</p>
          ) : (
            <div className="space-y-3">
              {activeRows.map((row) => (
                <div key={row.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{row.typeName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    <p>Creada: {formatDateTime(row.createdAt)}</p>
                    {row.startsOn || row.endsOn ? (
                      <p>
                        Ausencia: {formatDate(row.startsOn)}
                        {row.endsOn ? ` al ${formatDate(row.endsOn)}` : ""}
                      </p>
                    ) : null}
                    {row.omitPeriodMonth ? <p>Mes omitido: {formatPeriodMonth(row.omitPeriodMonth)}</p> : null}
                    {row.note ? <p>Nota: {row.note}</p> : null}
                  </div>
                  {canManage ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={cancelAction.bind(null, row.id)}>
                        <button
                          type="submit"
                          className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-900/20"
                        >
                          Cancelar
                        </button>
                      </form>
                      <details className="group">
                        <summary className="cursor-pointer list-none rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                          Reemplazar
                        </summary>
                        <form
                          action={replaceAction.bind(null, row.id)}
                          className="mt-2 w-full max-w-xl space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/30"
                        >
                          <IncidentFormFields
                            defaultMonth={row.omitPeriodMonth ? row.omitPeriodMonth.slice(0, 7) : defaultMonth}
                            initialType={row.typeCode}
                            initialMode={row.omitPeriodMonth ? "omit_month" : "record_only"}
                            initialNote={row.note ?? ""}
                            initialStartsOn={row.startsOn ?? ""}
                            initialEndsOn={row.endsOn ?? ""}
                          />
                          <button
                            type="submit"
                            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                          >
                            Guardar reemplazo
                          </button>
                        </form>
                      </details>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Historial</h3>
            <span className="text-xs text-slate-400">{historyRows.length} registro{historyRows.length !== 1 ? "s" : ""}</span>
          </div>
          {historyRows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Aún no hay historial.</p>
          ) : (
            <div className="space-y-3">
              {historyRows.map((row) => (
                <div key={row.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{row.typeName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                    <p>Creada: {formatDateTime(row.createdAt)}</p>
                    {row.startsOn || row.endsOn ? (
                      <p>
                        Ausencia: {formatDate(row.startsOn)}
                        {row.endsOn ? ` al ${formatDate(row.endsOn)}` : ""}
                      </p>
                    ) : null}
                    {row.omitPeriodMonth ? <p>Mes omitido: {formatPeriodMonth(row.omitPeriodMonth)}</p> : null}
                    {row.consumedAt ? <p>Usada: {formatDateTime(row.consumedAt)}</p> : null}
                    {row.cancelledAt ? <p>Cancelada: {formatDateTime(row.cancelledAt)}</p> : null}
                    {row.note ? <p>Nota: {row.note}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
