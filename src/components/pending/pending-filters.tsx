type CampusOption = {
  id: string;
  name: string;
};

type TeamOption = {
  id: string;
  name: string;
};

type PendingFiltersProps = {
  q: string;
  campusId: string;
  teamId: string;
  balanceBucket: string;
  overdue: string;
  campuses: CampusOption[];
  teams: TeamOption[];
};

export function PendingFilters({
  q,
  campusId,
  teamId,
  balanceBucket,
  overdue,
  campuses,
  teams
}: PendingFiltersProps) {
  return (
    <form className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-6">
      <input
        type="text"
        name="q"
        defaultValue={q}
        placeholder="Jugador, telefono o equipo"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm md:col-span-2"
      />
      <select name="campus" defaultValue={campusId} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="">Todos los campus</option>
        {campuses.map((campus) => (
          <option key={campus.id} value={campus.id}>
            {campus.name}
          </option>
        ))}
      </select>
      <select name="team" defaultValue={teamId} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="">Todos los equipos</option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
      <select
        name="bucket"
        defaultValue={balanceBucket}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="all">Todos los saldos</option>
        <option value="small">Hasta $1,000</option>
        <option value="medium">$1,001 a $3,000</option>
        <option value="high">Mas de $3,000</option>
      </select>
      <select name="overdue" defaultValue={overdue} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
        <option value="all">Cualquier vencimiento</option>
        <option value="overdue">Solo vencidos</option>
        <option value="7plus">Vencidos +7 dias</option>
        <option value="30plus">Vencidos +30 dias</option>
      </select>
      <button
        type="submit"
        className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark md:col-span-1"
      >
        Aplicar filtros
      </button>
    </form>
  );
}

