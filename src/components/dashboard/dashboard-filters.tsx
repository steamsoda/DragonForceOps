"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const campusOptions = [{ id: "", name: "Todos" }, ...campuses];

  function updateFilters(nextCampusId: string, nextMonth: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCampusId) {
      params.set("campus", nextCampusId);
    } else {
      params.delete("campus");
    }

    if (nextMonth) {
      params.set("month", nextMonth);
    } else {
      params.delete("month");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="space-y-3 rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Campus</p>
        <div className="grid gap-2 md:grid-cols-3">
          {campusOptions.map((campus) => (
            <button
              key={campus.id || "all"}
              type="button"
              onClick={() => updateFilters(campus.id, selectedMonth)}
              className={`flex min-h-12 items-center justify-center rounded-lg border px-4 py-3 text-sm font-semibold transition-colors ${
                selectedCampusId === campus.id
                  ? "border-portoBlue bg-portoBlue text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-500"
              }`}
            >
                {campus.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Mes</p>
        <input
          type="month"
          value={selectedMonth}
          onChange={(event) => updateFilters(selectedCampusId, event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
        />
      </div>
    </div>
  );
}
