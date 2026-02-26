import Link from "next/link";

type CampusOption = {
  id: string;
  name: string;
};

type DashboardFiltersProps = {
  campuses: CampusOption[];
  selectedCampusId: string;
  selectedMonth: string;
};

export function DashboardFilters({ campuses, selectedCampusId, selectedMonth }: DashboardFiltersProps) {
  return (
    <form className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
      <select
        name="campus"
        defaultValue={selectedCampusId}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="">Todos los campus</option>
        {campuses.map((campus) => (
          <option key={campus.id} value={campus.id}>
            {campus.name}
          </option>
        ))}
      </select>
      <input
        type="month"
        name="month"
        defaultValue={selectedMonth}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        className="rounded-md bg-portoBlue px-3 py-2 text-sm font-medium text-white hover:bg-portoDark"
      >
        Aplicar
      </button>
      <Link href="/dashboard" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
        Limpiar
      </Link>
    </form>
  );
}
