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
  const campusOptions = [{ id: "", name: "Todos" }, ...campuses];

  return (
    <form className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Campus</p>
        <div className="grid gap-2 md:grid-cols-3">
          {campusOptions.map((campus) => (
            <label key={campus.id || "all"} className="cursor-pointer">
              <input
                type="radio"
                name="campus"
                value={campus.id}
                defaultChecked={selectedCampusId === campus.id}
                className="peer sr-only"
              />
              <span className="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 peer-checked:border-portoBlue peer-checked:bg-portoBlue peer-checked:text-white dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500">
                {campus.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          type="month"
          name="month"
          defaultValue={selectedMonth}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
        <button
          type="submit"
          className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark"
        >
          Aplicar
        </button>
        <Link
          href="/dashboard"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
        >
          Limpiar
        </Link>
      </div>
    </form>
  );
}
