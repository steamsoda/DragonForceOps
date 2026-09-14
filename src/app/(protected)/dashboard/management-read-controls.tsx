import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const managementInputClass = "min-h-10 min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";

export function ManagementReadPagination({ pathname, filters, page, pageSize, totalRows }: {
  pathname: string; filters: Record<string, string | undefined>; page: number; pageSize: number; totalRows: number;
}) {
  const pages = Math.max(1, Math.ceil(totalRows / pageSize));
  function href(next: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value && key !== "page") params.set(key, value);
    params.set("page", String(next));
    return `${pathname}?${params}`;
  }
  return <nav aria-label="Paginacion" className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
    <span>{totalRows} registros | Pagina {page} de {pages}</span>
    <div className="flex gap-2">
      {page > 1 && <Link prefetch={false} aria-label="Pagina anterior" title="Pagina anterior" href={href(page - 1)} className="rounded-md border p-2"><ChevronLeft size={20} /></Link>}
      {page < pages && <Link prefetch={false} aria-label="Pagina siguiente" title="Pagina siguiente" href={href(page + 1)} className="rounded-md border p-2"><ChevronRight size={20} /></Link>}
    </div>
  </nav>;
}

export function ManagementCampusSelect({ campuses, selected }: { campuses: { id: string; name: string }[]; selected: string }) {
  return <label className="grid gap-1 text-sm">Campus<select name="campus" defaultValue={selected} className={managementInputClass}>
    <option value="">Todos los campus</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
  </select></label>;
}
