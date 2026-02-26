import Link from "next/link";

type PendingRow = {
  enrollmentId: string;
  playerName: string;
  campusName: string;
  campusCode: string;
  teamName: string;
  primaryPhone: string | null;
  balance: number;
  dueDate: string | null;
  overdueDays: number;
};

type PendingTableProps = {
  rows: PendingRow[];
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-MX").format(new Date(value));
}

export function PendingTable({ rows }: PendingTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">Jugador</th>
            <th className="px-3 py-2">Campus</th>
            <th className="px-3 py-2">Equipo</th>
            <th className="px-3 py-2">Telefono</th>
            <th className="px-3 py-2">Saldo</th>
            <th className="px-3 py-2">Vence</th>
            <th className="px-3 py-2">Dias vencidos</th>
            <th className="px-3 py-2">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-4 text-slate-600" colSpan={8}>
                No hay inscripciones pendientes con los filtros actuales.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.enrollmentId}>
                <td className="px-3 py-2">{row.playerName}</td>
                <td className="px-3 py-2">
                  {row.campusName} ({row.campusCode})
                </td>
                <td className="px-3 py-2">{row.teamName}</td>
                <td className="px-3 py-2">{row.primaryPhone ?? "-"}</td>
                <td className="px-3 py-2 font-medium">{formatMoney(row.balance)}</td>
                <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
                <td className="px-3 py-2">{row.overdueDays}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-3">
                    {row.primaryPhone ? (
                      <a href={`tel:${row.primaryPhone}`} className="text-portoBlue hover:underline">
                        Llamar
                      </a>
                    ) : (
                      <span className="text-slate-400">Sin telefono</span>
                    )}
                    <Link href={`/enrollments/${row.enrollmentId}/charges`} className="text-portoBlue hover:underline">
                      Abrir cuenta
                    </Link>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

