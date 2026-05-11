import Link from "next/link";

type CampusOption = {
  id: string;
  name: string;
};

type QueryValue = string | number | null | undefined;

type AttendanceCampusButtonsProps = {
  pathname: string;
  campuses: CampusOption[];
  selectedCampusId: string | null;
  params?: Record<string, QueryValue>;
  allLabel?: string;
};

function buildHref(pathname: string, params: Record<string, QueryValue>, campusId: string | null) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }

  if (campusId) {
    search.set("campus", campusId);
  } else {
    search.delete("campus");
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function AttendanceCampusButtons({
  pathname,
  campuses,
  selectedCampusId,
  params = {},
  allLabel = "Todos",
}: AttendanceCampusButtonsProps) {
  const baseClass =
    "inline-flex min-h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold transition-colors";
  const activeClass =
    "border-portoBlue bg-blue-50 text-portoBlue ring-1 ring-blue-100 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-200 dark:ring-blue-950";
  const inactiveClass =
    "border-slate-300 bg-white text-slate-700 hover:border-portoBlue hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-800";

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campus</p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={buildHref(pathname, params, null)}
          prefetch={false}
          className={`${baseClass} ${selectedCampusId ? inactiveClass : activeClass}`}
        >
          {allLabel}
        </Link>
        {campuses.map((campus) => (
          <Link
            key={campus.id}
            href={buildHref(pathname, params, campus.id)}
            prefetch={false}
            className={`${baseClass} ${selectedCampusId === campus.id ? activeClass : inactiveClass}`}
          >
            {campus.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
