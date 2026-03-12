"use client";

import { useState, useTransition } from "react";
import {
  createAreaMapEntryAction,
  closeAreaMapEntryAction,
  deleteAreaMapEntryAction,
  AREA_MAP_TYPE_CODES,
  AREA_MAP_TOPICS,
  EFFECTIVENESS_LABELS,
  type AreaMapEntry
} from "@/server/actions/area-map";

type Campus = { id: string; name: string };

type Props = {
  monthEntries: AreaMapEntry[];
  openPrior: AreaMapEntry[];
  month: string;
  campuses: Campus[];
};

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function TypeBadge({ code }: { code: string }) {
  const colors: Record<string, string> = {
    C:   "bg-blue-100 text-blue-700",
    SM:  "bg-purple-100 text-purple-700",
    R:   "bg-rose-100 text-rose-700",
    NC:  "bg-red-100 text-red-800",
    PNC: "bg-orange-100 text-orange-700",
    AS:  "bg-yellow-100 text-yellow-700",
    OM:  "bg-teal-100 text-teal-700",
    M:   "bg-slate-100 text-slate-600"
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${colors[code] ?? "bg-slate-100 text-slate-600"}`}>
      {code}
    </span>
  );
}

function StatusBadge({ entry }: { entry: AreaMapEntry }) {
  if (!entry.closureDate) {
    return <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">Abierto</span>;
  }
  const eff = entry.effectiveness ?? "";
  const colors: Record<string, string> = {
    E:  "bg-emerald-100 text-emerald-700",
    NE: "bg-red-100 text-red-700",
    SP: "bg-slate-100 text-slate-500"
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[eff] ?? "bg-slate-100 text-slate-500"}`}>
      {EFFECTIVENESS_LABELS[eff] ?? eff}
    </span>
  );
}

function EntryRow({
  entry,
  onClose,
  onDelete,
  isPending
}: {
  entry: AreaMapEntry;
  onClose: (id: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-slate-50 ${entry.closureDate ? "opacity-60" : ""}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2 whitespace-nowrap text-slate-600 text-xs">{fmtDate(entry.entryDate)}</td>
        <td className="px-3 py-2"><TypeBadge code={entry.typeCode} /></td>
        <td className="px-3 py-2 text-xs text-slate-500">{entry.topic}</td>
        <td className="px-3 py-2 text-sm text-slate-800 max-w-xs">
          <p className="truncate">{entry.description}</p>
        </td>
        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{entry.assignedTo ?? "—"}</td>
        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
          {entry.deadlineDays != null ? `${entry.deadlineDays}d` : "—"}
        </td>
        <td className="px-3 py-2"><StatusBadge entry={entry} /></td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          {!entry.closureDate && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(entry.id); }}
              disabled={isPending}
              className="text-xs text-emerald-600 hover:text-emerald-800 mr-3"
            >
              Cerrar
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
            disabled={isPending}
            className="text-xs text-rose-400 hover:text-rose-600"
          >
            Eliminar
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 border-t border-slate-100">
          <td colSpan={8} className="px-4 py-3">
            <div className="grid gap-2 text-xs sm:grid-cols-2">
              {entry.rootCause && (
                <div>
                  <span className="font-medium text-slate-500 uppercase tracking-wide">Análisis de causas</span>
                  <p className="mt-0.5 text-slate-700">{entry.rootCause}</p>
                </div>
              )}
              {entry.correctiveAction && (
                <div>
                  <span className="font-medium text-slate-500 uppercase tracking-wide">Acción correctiva</span>
                  <p className="mt-0.5 text-slate-700">{entry.correctiveAction}</p>
                </div>
              )}
              {entry.correctionAction && (
                <div className="sm:col-span-2">
                  <span className="font-medium text-slate-500 uppercase tracking-wide">Acción de corrección</span>
                  <p className="mt-0.5 text-slate-700">{entry.correctionAction}</p>
                </div>
              )}
              {entry.closureDate && (
                <div>
                  <span className="font-medium text-slate-500 uppercase tracking-wide">Cierre</span>
                  <p className="mt-0.5 text-slate-700">{fmtDate(entry.closureDate)}</p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CloseModal({
  entryId,
  onConfirm,
  onCancel,
  isPending
}: {
  entryId: string;
  onConfirm: (id: string, effectiveness: string, closureDate: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [effectiveness, setEffectiveness] = useState("E");
  const today = new Date().toISOString().slice(0, 10);
  const [closureDate, setClosureDate] = useState(today);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl space-y-4">
        <p className="font-medium text-slate-800">Cerrar incidencia</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Fecha de cierre</label>
            <input
              type="date"
              value={closureDate}
              onChange={(e) => setClosureDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Resultado</label>
            <div className="flex gap-2">
              {(["E", "NE", "SP"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setEffectiveness(v)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    effectiveness === v
                      ? v === "E" ? "bg-emerald-600 text-white border-emerald-600"
                        : v === "NE" ? "bg-red-600 text-white border-red-600"
                        : "bg-slate-600 text-white border-slate-600"
                      : "border-slate-300 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {v} — {EFFECTIVENESS_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onConfirm(entryId, effectiveness, closureDate)}
            disabled={isPending}
            className="flex-1 rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
          >
            {isPending ? "Guardando…" : "Confirmar cierre"}
          </button>
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export function AreaMapPanel({ monthEntries, openPrior, month, campuses }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate(formData: FormData) {
    startTransition(async () => {
      await createAreaMapEntryAction(formData);
      setShowForm(false);
    });
  }

  function handleClose(id: string, effectiveness: string, closureDate: string) {
    startTransition(async () => {
      await closeAreaMapEntryAction(id, effectiveness, closureDate);
      setClosingId(null);
    });
  }

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta entrada?")) return;
    startTransition(async () => {
      await deleteAreaMapEntryAction(id);
    });
  }

  const allEmpty = monthEntries.length === 0 && openPrior.length === 0;

  return (
    <div className="space-y-4">

      {closingId && (
        <CloseModal
          entryId={closingId}
          onConfirm={handleClose}
          onCancel={() => setClosingId(null)}
          isPending={isPending}
        />
      )}

      {/* Open entries from prior months */}
      {openPrior.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">
            {openPrior.length} incidencia{openPrior.length > 1 ? "s" : ""} abierta{openPrior.length > 1 ? "s" : ""} de meses anteriores
          </p>
          <EntriesTable
            entries={openPrior}
            onClose={(id) => setClosingId(id)}
            onDelete={handleDelete}
            isPending={isPending}
          />
        </div>
      )}

      {/* This month's entries */}
      {monthEntries.length > 0 && (
        <EntriesTable
          entries={monthEntries}
          onClose={(id) => setClosingId(id)}
          onDelete={handleDelete}
          isPending={isPending}
        />
      )}

      {allEmpty && !showForm && (
        <p className="text-sm text-slate-400">Sin entradas registradas para este mes.</p>
      )}

      {/* Add form */}
      {showForm ? (
        <form
          action={handleCreate}
          className="rounded-md border border-slate-200 bg-white p-4 space-y-3"
        >
          <p className="text-sm font-medium text-slate-700">Nueva entrada</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Fecha *</label>
              <input
                type="date"
                name="entry_date"
                required
                defaultValue={`${month}-01`}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Tipo *</label>
              <select name="type_code" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Seleccionar…</option>
                {AREA_MAP_TYPE_CODES.map((t) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Tema *</label>
              <select name="topic" required className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Seleccionar…</option>
                {AREA_MAP_TOPICS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Campus</label>
              <select name="campus_id" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
                <option value="">Ambos campus</option>
                {campuses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Descripción *</label>
              <textarea
                name="description"
                required
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Descripción del tema o incidencia"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Análisis de las causas</label>
              <textarea
                name="root_cause"
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="¿Por qué ocurrió?"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Acción correctiva <span className="text-slate-400">(inmediata)</span></label>
              <textarea
                name="corrective_action"
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Acción inmediata para eliminar la no conformidad"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">Acción de corrección <span className="text-slate-400">(sistémica)</span></label>
              <textarea
                name="correction_action"
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Medidas para eliminar la causa raíz y evitar que se repita"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Encaminado para</label>
              <input
                name="assigned_to"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ej. Mireya, Sory"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Plazo (días)</label>
              <input
                type="number"
                name="deadline_days"
                min="1"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Ej. 7"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:opacity-50"
            >
              {isPending ? "Guardando…" : "Guardar entrada"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 hover:border-portoBlue hover:text-portoBlue"
        >
          + Agregar entrada
        </button>
      )}
    </div>
  );
}

function EntriesTable({
  entries,
  onClose,
  onDelete,
  isPending
}: {
  entries: AreaMapEntry[];
  onClose: (id: string) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">Fecha</th>
            <th className="px-3 py-2 text-left">Tipo</th>
            <th className="px-3 py-2 text-left">Tema</th>
            <th className="px-3 py-2 text-left">Descripción</th>
            <th className="px-3 py-2 text-left">Asignado</th>
            <th className="px-3 py-2 text-left">Plazo</th>
            <th className="px-3 py-2 text-left">Estado</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onClose={onClose}
              onDelete={onDelete}
              isPending={isPending}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
