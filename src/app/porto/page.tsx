import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, LogOut, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PORTO_VIEWS, parsePortoPage, parsePortoView } from "@/lib/auth/porto-viewer";

export const dynamic = "force-dynamic";
type Params = { view?: string; campus?: string; q?: string; from?: string; to?: string; page?: string };
type Overview = { total: number; page: number; campuses: { id: string; name: string }[];
  items: { id: string; campus: string; label: string; detail: string | null; extra: string | null; status: string | null; event_date: string | null }[] };

export default async function PortoPage({ searchParams }: { searchParams: Promise<Params> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: allowed, error: roleError } = await supabase.rpc("is_porto_viewer");
  if (roleError || !allowed || user.email?.toLowerCase() !== "rita.cabral@fcporto.pt") redirect("/unauthorized");
  const params = await searchParams;
  const view = parsePortoView(params.view);
  const page = parsePortoPage(params.page);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
  const from = params.from || `${today.slice(0, 7)}-01`;
  const to = params.to || today;
  const { data, error } = await supabase.rpc("porto_operational_overview", {
    p_view: view, p_campus: params.campus || null, p_search: (params.q || "").slice(0, 100), p_from: from, p_to: to, p_page: page,
  });
  const report = error ? null : data as Overview;
  const title = PORTO_VIEWS[view];
  const datedView = ["attendance", "schedules", "registrations", "trials"].includes(view);
  const statusLabels: Record<string, string> = { active: "Activo", inactive: "Inactivo", ended: "Baja", cancelled: "Cancelado", present: "Asistio", absent: "Falta", excused: "Justificado", ready: "Listo", open: "Abierto" };
  function href(next: Partial<Params>) {
    const p = new URLSearchParams({ view, campus: params.campus || "", q: params.q || "", from, to, page: "0", ...next });
    return `/porto?${p}`;
  }
  async function signOut() { "use server"; const client = await createClient(); await client.auth.signOut(); redirect("/login"); }
  const input = "h-10 rounded border border-slate-300 bg-white px-3 text-sm text-slate-900";
  return <main className="min-h-screen bg-white text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-8">
      <div className="flex items-center gap-4"><span className="text-xl font-semibold text-blue-800">INVICTA</span><span className="text-sm text-emerald-700">Porto | Solo lectura</span></div>
      <form action={signOut}><button className="flex items-center gap-2 text-sm"><LogOut size={16} />Cerrar sesion</button></form>
    </header>
    <div className="mx-auto max-w-[96rem] space-y-5 px-4 py-6 sm:px-8">
      <nav aria-label="Vistas" className="flex flex-wrap gap-x-5 gap-y-3 border-b pb-3">{Object.entries(PORTO_VIEWS).map(([key, v]) =>
        <Link key={key} href={href({ view: key })} aria-current={view === key ? "page" : undefined} className={`text-sm ${view === key ? "font-semibold text-blue-800 underline underline-offset-8" : "text-slate-600"}`}>{v.title}</Link>)}</nav>
      <h1 className="text-2xl font-semibold">{title.title}</h1>
      <form className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={view} />
        <label className="grid gap-1 text-sm">Campus<select name="campus" defaultValue={params.campus || ""} className={input}><option value="">Todos</option>{report?.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Buscar<input name="q" maxLength={100} defaultValue={params.q} className={`${input} max-w-full`} /></label>
        {datedView ? <><label className="grid gap-1 text-sm">Desde<input type="date" name="from" defaultValue={from} className={input} /></label>
        <label className="grid gap-1 text-sm">Hasta<input type="date" name="to" defaultValue={to} className={input} /></label></> : <><input type="hidden" name="from" value={from} /><input type="hidden" name="to" value={to} /></>}
        <button title="Buscar" aria-label="Buscar" className="flex h-10 w-10 items-center justify-center rounded bg-blue-800 text-white"><Search size={18} /></button>
      </form>
      {error ? <p role="alert" className="text-sm text-red-700">No se pudo cargar esta vista. Revisa los filtros y selecciona un intervalo de hasta un ano.</p> : <>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left text-sm"><thead className="border-y bg-slate-50"><tr>{["Nombre", "Campus", title.detail, title.extra, "Estado", "Fecha"].map(h => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{report?.items.map((r, i) => <tr key={`${r.id}-${i}`} className="border-b align-top">{[r.label, r.campus, r.detail, r.extra, statusLabels[r.status || ""] || r.status, r.event_date].map((v, j) => <td key={j} className="max-w-sm break-words px-3 py-3">{v || "-"}</td>)}</tr>)}</tbody></table></div>
        {!report?.items.length && <p className="py-6 text-sm text-slate-500">Sin registros para estos filtros.</p>}
        <footer className="flex items-center justify-between text-sm"><span>{report?.total ?? 0} registros</span><div className="flex items-center gap-4">
          {page > 0 && <Link title="Anterior" aria-label="Pagina anterior" href={href({ page: String(page - 1) })}><ChevronLeft size={20} /></Link>}
          <span>Pagina {page + 1}</span>{(page + 1) * 100 < (report?.total ?? 0) && <Link title="Siguiente" aria-label="Pagina siguiente" href={href({ page: String(page + 1) })}><ChevronRight size={20} /></Link>}
        </div></footer>
      </>}
    </div>
  </main>;
}
