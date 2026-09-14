import type { AttendanceRosterPlayer } from "@/lib/queries/attendance";

const STATUS_LABELS = {
  present: "Asistio",
  absent: "Falta",
  injury: "Lesion",
  justified: "Justificada",
};

// Server-only display: no bound actions, form state, or default-present inference.
export function AttendanceReadOnlyRoster({ roster }: { roster: AttendanceRosterPlayer[] }) {
  return (
    <section className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="px-3 py-2">Jugador</th>
            <th className="px-3 py-2">Categoria</th>
            <th className="px-3 py-2">Asistencia registrada</th>
          </tr>
        </thead>
        <tbody>
          {roster.map((player) => (
            <tr key={player.enrollmentId} className="border-b border-slate-200 dark:border-slate-700">
              <td className="px-3 py-2">{player.playerName}</td>
              <td className="px-3 py-2">{player.birthYear ?? "-"}</td>
              <td className="px-3 py-2">{player.recordId ? STATUS_LABELS[player.currentStatus] : "Sin registrar"}</td>
            </tr>
          ))}
          {roster.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">Sin jugadores.</td></tr> : null}
        </tbody>
      </table>
    </section>
  );
}
