import { createPlayerNoteAction } from "@/server/actions/player-notes";
import type { PlayerNote } from "@/lib/queries/player-notes";

function formatNoteDate(value: string) {
  return new Date(value).toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Monterrey",
  });
}

function sourceLabel(source: PlayerNote["sourceSurface"]) {
  return source === "caja" ? "Caja" : "Ficha";
}

export function PlayerNotesPanel({
  playerId,
  enrollmentId,
  notes,
}: {
  playerId: string;
  enrollmentId: string | null;
  notes: PlayerNote[];
}) {
  async function addNote(formData: FormData) {
    "use server";
    await createPlayerNoteAction({
      playerId,
      enrollmentId,
      sourceSurface: "player_profile",
      body: String(formData.get("body") ?? ""),
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Notas operativas</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Contexto general visible para el equipo operativo. No reemplaza flujos de lesion, asistencia, pagos o baja.
        </p>
      </div>

      <form action={addNote} className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Nueva nota</span>
          <textarea
            name="body"
            rows={3}
            maxLength={2000}
            required
            placeholder="Ej. Papa aviso que llegaran tarde esta semana."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-portoBlue focus:outline-none dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
        >
          Guardar nota
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Sin notas registradas.
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <article key={note.id} className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {sourceLabel(note.sourceSurface)}
                </span>
                <span>{formatNoteDate(note.createdAt)}</span>
                {note.createdByEmail ? <span>{note.createdByEmail}</span> : null}
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-200">{note.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
