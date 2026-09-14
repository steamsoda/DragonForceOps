import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { CurrentWeekDashboard, type ReadableWeekDashboardData } from "@/components/weekly-callups/current-week-dashboard";
import {
  getCompetitionReadData, getTournamentReadCatalog, getCallupReadDashboard, getCallupReadDetail,
  type SportingPlayer, type SportingGame, type SportingSquad,
} from "@/lib/queries/competition-readonly";

type Filters = { campus?: string; competition?: string; tournament?: string; program?: string; week?: string; birthYear?: string; trainingGroup?: string; q?: string; view?: string; detail?: string };
const input = "min-h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";
const link = "inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-portoBlue dark:text-sky-300";
const PROGRAMS = [{ value: "futbol_para_todos", label: "Futbol Para Todos" }, { value: "selectivo", label: "Selectivos" }];
const CALLUP_PROGRAMS = [PROGRAMS[1], PROGRAMS[0]];
const programLabel = (program: string) => program === "little_dragons" ? "Little Dragons" : PROGRAMS.find(p => p.value === program)?.label ?? program;
const matchesProgram = (program: string, selected?: string) => !selected || program === selected || (selected === "futbol_para_todos" && program === "little_dragons");
const day = (value: string | null) => value ? new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "Sin fecha";
const choice = (active: boolean) => active
  ? "min-h-10 rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white"
  : "min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200";

function href(path: string, filters: Filters, changes: Partial<Filters> = {}, hash = "") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...filters, ...changes })) if (value) params.set(key, value);
  return `${path}?${params.toString()}${hash}`;
}

function CampusPrograms({ campuses, filters, path }: { campuses: Array<{ id: string; name: string }>; filters: Filters; path: string }) {
  return <section className="space-y-4" aria-label="Campus y programa">
    <nav className="grid gap-3 sm:grid-cols-2" aria-label="Campus">
      {campuses.map(c => <Link key={c.id} href={href(path, filters, { campus: c.id, competition: "", tournament: "", birthYear: "", trainingGroup: "" })}
        aria-current={filters.campus === c.id ? "page" : undefined}
        className={`min-w-0 break-words rounded-lg border px-5 py-6 text-center text-xl font-semibold transition ${filters.campus === c.id ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950" : "border-slate-200 bg-slate-100 text-slate-900 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"}`}>{c.name.toUpperCase()}</Link>)}
    </nav>
    <nav className="flex flex-wrap gap-2" aria-label="Filtrar por programa">
      {[{ value: "", label: "Todos" }, ...PROGRAMS].map(p => <Link key={p.value} href={href(path, filters, { program: p.value, trainingGroup: "" })}
        className={choice((filters.program ?? "") === p.value)} aria-current={(filters.program ?? "") === p.value ? "page" : undefined}>{p.label}</Link>)}
    </nav>
  </section>;
}

function TeamCards({ squads }: { squads: SportingSquad[] }) {
  return squads.length ? <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-testid="team-card-grid">
    {squads.map(s => <article id={`equipo-${s.id}`} key={s.id} className="min-w-0 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <header className="space-y-1 border-b border-slate-200 p-4 dark:border-slate-700">
        <h3 className="break-words text-base font-semibold text-portoBlue dark:text-sky-300">{s.name}</h3>
        <p className="break-words text-xs text-slate-500">{s.tournamentName} | Cat. {s.category}</p>
        <p className="break-words text-sm">{s.coaches.join(", ") || "Sin profesor asignado"}</p>
        <p className="text-sm font-semibold">{s.players.length} jugadores</p>
      </header>
      <div className="p-4"><SportingRoster players={s.players} />
        <details className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700"><summary className="cursor-pointer text-sm font-medium">Horarios y reportes ({s.reports.length})</summary>
          {s.reports.map(r => <section key={r.id} className="mt-3"><p className="break-words text-sm font-medium">{r.coach} | {r.isRest ? "Descansa" : "Reportado"}</p><SportingGames games={r.games} /></section>)}
          {!s.reports.length && <p className="py-2 text-sm text-slate-500">Sin reporte para esta semana.</p>}
        </details>
      </div>
    </article>)}
  </div> : <p className="py-6 text-sm text-slate-500">No hay equipos para esta seleccion.</p>;
}

export function SportingRoster({ players }: { players: SportingPlayer[] }) {
  return players.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
    <thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Jugador</th><th className="py-2">Categoria</th></tr></thead>
    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{players.map((p) => <tr key={p.id}><td className="py-2 pr-4 font-medium break-words"><Link href={`/players/${p.id}`} className="hover:underline">{p.name}</Link></td><td className="py-2">{p.birthYear ?? "-"}</td></tr>)}</tbody>
  </table></div> : <p className="py-3 text-sm text-slate-500">Sin jugadores en este plantel.</p>;
}

export function SportingGames({ games }: { games: SportingGame[] }) {
  return games.length ? <div className="divide-y divide-slate-200 dark:divide-slate-700">{games.map((game) => <section key={game.id} className="space-y-2 py-3">
    <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-semibold break-words">{game.opponent || "Rival por definir"}</h4><span className="text-sm">{day(game.date)} | {game.time.slice(0, 5)}</span></div>
    <p className="text-sm break-words">{game.venue || "Sede por definir"}</p>
    <details><summary className="cursor-pointer py-1 text-sm font-medium text-portoBlue dark:text-sky-300">Jugadores del partido ({game.players.length})</summary><SportingRoster players={game.players} /></details>
  </section>)}</div> : <p className="py-3 text-sm text-slate-500">Sin partidos reportados.</p>;
}

export function SportingSquads({ squads }: { squads: SportingSquad[] }) {
  return squads.length ? <div className="divide-y divide-slate-200 dark:divide-slate-700">{squads.map((squad) => <section id={`equipo-${squad.id}`} key={squad.id} className="space-y-3 py-5">
    <div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h3 className="text-lg font-semibold break-words">{squad.name}</h3>
      <p className="text-sm text-slate-500 break-words">{squad.tournamentName} | {programLabel(squad.program)} | {squad.category}</p>
      <p className="text-sm break-words">{squad.coaches.join(", ") || "Sin profesor asignado"}</p></div>
      <div className="text-sm"><p className="font-semibold">{squad.players.length} jugadores</p><p className={squad.reports.length ? "text-emerald-700" : "text-amber-700"}>{squad.reports.length ? "Reporte recibido" : "Sin reporte"}</p></div>
    </div>
    <div className="grid gap-6 lg:grid-cols-2"><details open><summary className="cursor-pointer font-medium">Plantel</summary><SportingRoster players={squad.players} /></details>
      <div><h4 className="font-medium">Horarios y reportes</h4>{squad.reports.map((report) => <section key={report.id} className="border-b border-slate-200 py-3 last:border-0">
        <p className="text-sm font-medium">{report.coach} | {report.isRest ? "Descansa" : "Partidos"}</p><p className="text-xs text-slate-500">Actualizado: {day(report.updatedAt)}</p>
        <SportingGames games={report.games} />
      </section>)}{!squad.reports.length && <p className="py-3 text-sm text-slate-500">Sin reporte para esta semana.</p>}</div>
    </div>
  </section>)}</div> : <p className="py-6 text-sm text-slate-500">No hay equipos para esta seleccion.</p>;
}

export async function CompetitionReadPage({ filters, mode = "signups" }: { filters: Filters; mode?: "signups" | "squads" | "detail" | "tournament" }) {
  const data = await getCompetitionReadData({ campus: filters.campus, competition: filters.tournament || filters.competition, week: filters.week });
  if (!data) redirect("/unauthorized");
  const title = mode === "squads" ? "Equipos de competencia" : mode === "tournament" ? data.tournament?.name ?? "Copas / Torneos" : "Inscripciones Torneos";
  const path = mode === "squads" ? "/sports-signups/squads" : mode === "detail" ? "/sports-signups/detail" : "/sports-signups";
  const selected: Filters = { campus: data.campusId, competition: data.tournament?.id, program: filters.program, week: data.week, birthYear: filters.birthYear, trainingGroup: filters.trainingGroup, q: filters.q, view: filters.view };
  const view = mode === "squads" ? "teams" : filters.view === "group" || filters.view === "teams" ? filters.view : "category";
  const rows = data.registrations.filter(p => (!filters.program || p.programs.some(program => matchesProgram(program, filters.program)))
    && (!filters.birthYear || String(p.birthYear) === filters.birthYear)
    && (!filters.trainingGroup || p.groupIds.includes(filters.trainingGroup))
    && (!filters.q || p.name.toLocaleLowerCase("es").includes(filters.q.toLocaleLowerCase("es"))));
  const squads = data.squads.filter(s => matchesProgram(s.program, filters.program)
    && (!(filters.q || filters.birthYear || filters.trainingGroup) || s.players.some(p => rows.some(row => row.id === p.id))));
  const years = [...new Set(data.registrations.map(p => p.birthYear).filter(y => y !== null))].sort((a, b) => b - a);
  const groups = [...new Map(data.registrations.flatMap(p => p.groupIds.map((id, i) => [id, p.groups[i] ?? "Sin grupo"] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  const sections = view === "group"
    ? [...groups.map(([id, name]) => ({ id, name, players: rows.filter(p => p.groupIds.includes(id)), detail: { trainingGroup: id } })),
      ...(rows.some(p => !p.groupIds.length) ? [{ id: "unassigned", name: "Sin grupo", players: rows.filter(p => !p.groupIds.length), detail: {} }] : [])]
    : [...years, ...(rows.some(p => p.birthYear === null) ? [null] : [])].map(year => ({ id: String(year), name: year === null ? "Sin categoria" : `Categoria ${year}`, players: rows.filter(p => p.birthYear === year), detail: { birthYear: year === null ? "" : String(year) } }));
  return <PageShell title={title} subtitle="Vista operativa por campus, categoria o grupo de entrenamiento." breadcrumbs={[{ label: "Inscripciones Torneos", href: "/sports-signups" }, { label: title }]} wide>
    <div className="min-w-0 space-y-6">
      <CampusPrograms campuses={data.campuses} filters={selected} path={path} />
      <section className="space-y-3" aria-label="Competencias"><h2 className="text-xs font-semibold uppercase text-slate-500">Competencias</h2>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {data.tournaments.map(t => {
            const board = data.registrationBoards.find(b => b.tournamentId === t.id);
            const count = board?.players.filter(p => !filters.program || p.programs.some(program => matchesProgram(program, filters.program))).length;
            const active = data.tournament?.id === t.id;
            return <Link key={t.id} href={href(path, selected, { competition: t.id, birthYear: "", trainingGroup: "" })} aria-current={active ? "page" : undefined}
              className={`min-w-0 space-y-2 rounded-lg border p-4 ${active ? "border-portoBlue bg-portoBlue text-white" : "border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"}`}>
              <h3 className="break-words text-sm font-semibold">{t.name}</h3><p className="text-xs">{day(t.startDate)} al {day(t.endDate)}</p>
              <p className="text-3xl font-bold">{count ?? "-"}</p><p className="text-xs">{count == null ? "Inscritos no disponibles" : "Inscritos"}</p>
            </Link>;
          })}
        </div>
      </section>
      {data.tournament ? <section className="min-w-0 space-y-4 border-t border-slate-200 pt-5 dark:border-slate-700">
        <div className="flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs uppercase text-slate-500">{data.tournament.campusName}</p><h2 className="break-words text-2xl font-semibold">{data.tournament.name}</h2></div>
          <div className="flex flex-wrap items-center gap-3 text-sm"><span>{data.registrationsAvailable ? `${rows.length} inscritos` : "Inscritos no disponibles"} | {squads.length} equipos</span><Link className={link} href={href("/convocatorias", { campus: data.campusId, program: filters.program, week: data.week })}>Convocatorias</Link></div>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Organizar inscripciones">
          {[{ value: "category", label: "Por categoria" }, { value: "group", label: "Por grupo" }, { value: "teams", label: "Equipos" }].map(tab => <Link key={tab.value} className={choice(view === tab.value)}
            aria-current={view === tab.value ? "page" : undefined} href={href("/sports-signups", selected, { view: tab.value, birthYear: "", trainingGroup: "" })}>{tab.label}</Link>)}
        </nav>
        <form method="get" action={path} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input type="hidden" name="campus" value={data.campusId} /><input type="hidden" name="competition" value={data.tournament.id} /><input type="hidden" name="program" value={filters.program ?? ""} /><input type="hidden" name="view" value={view} />
          <label className="grid min-w-0 gap-1 text-sm">Categoria<select name="birthYear" defaultValue={filters.birthYear ?? ""} className={input}><option value="">Todas</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-sm">Grupo<select name="trainingGroup" defaultValue={filters.trainingGroup ?? ""} className={input}><option value="">Todos</option>{groups.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="grid min-w-0 gap-1 text-sm">Jugador<input type="search" name="q" defaultValue={filters.q ?? ""} className={input} /></label>
          <label className="grid min-w-0 gap-1 text-sm">Semana<input type="date" name="week" defaultValue={data.week} className={input} /></label>
          <button type="submit" className={link}>Filtrar</button>
        </form>
        {view === "teams" ? <TeamCards squads={squads} /> : mode === "detail" ? <SportingRoster players={rows} /> :
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5" data-testid="registration-card-grid">
            {sections.filter(s => s.players.length).map(s => <article key={s.id} className="min-w-0 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 dark:border-slate-700"><h3 className="break-words font-semibold">{s.name}</h3><span className="shrink-0 text-lg font-semibold">{s.players.length}</span></header>
              <div className="p-4"><SportingRoster players={s.players} /><Link className="mt-3 inline-block text-sm font-medium text-portoBlue dark:text-sky-300" href={href("/sports-signups/detail", selected, { birthYear: "", trainingGroup: "", ...s.detail })}>Ver detalle</Link></div>
            </article>)}
          </div>}
        {view !== "teams" && !rows.length && <p className="py-6 text-sm text-slate-500">{data.registrationsAvailable ? "No hay inscritos para estos filtros." : "Esta competencia no tiene un listado vigente de inscripciones disponible."}</p>}
      </section> : <p className="py-6 text-sm text-slate-500">No hay competencias en este campus.</p>}
    </div>
  </PageShell>;
}

export async function TournamentReadList() {
  const catalog = await getTournamentReadCatalog();
  if (!catalog) redirect("/unauthorized");
  return <PageShell title="Copas / Torneos" subtitle="Competencias y equipos por campus" breadcrumbs={[{ label: "Copas / Torneos" }]} wide>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{catalog.map((t) => <article key={t.id} className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"><h2 className="text-lg font-semibold">{t.name}</h2><p className="text-sm">{t.campusName} | {t.isActive ? "Activa" : "Finalizada"}</p><p className="text-sm text-slate-500">{day(t.startDate)} al {day(t.endDate)}</p><Link className={link} href={`/tournaments/${t.id}`}>Abrir competencia</Link></article>)}</div>
    {!catalog.length && <p className="py-6 text-sm text-slate-500">No hay competencias.</p>}
  </PageShell>;
}

export async function CallupsReadPage({ filters }: { filters: Filters }) {
  const data = await getCallupReadDashboard(filters);
  if (!data) redirect("/unauthorized");
  const program = filters.program === "selectivo" ? "selectivo" : "futbol_para_todos";
  const selected: Filters = { campus: data.campusId, program, week: data.week };
  const units = data.squads.filter(s => s.campusId === data.campusId && matchesProgram(s.program, program))
    .sort((a, b) => Number(a.reports.length > 0) - Number(b.reports.length > 0) || b.category.localeCompare(a.category, "es", { numeric: true }) || a.name.localeCompare(b.name, "es"));
  const current = data.callups.filter(c => c.week === data.week);
  const previous = data.callups.filter(c => c.week !== data.week);
  const weekEnd = new Date(`${data.week}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  return <PageShell title="Convocatorias" subtitle="Planteles semanales y reportes de profesores." wide><div className="min-w-0 space-y-5">
    <section className="min-w-0 space-y-4" aria-label="Control de esta semana">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase text-portoBlue">Control de esta semana</p><h2 className="text-xl font-semibold">{day(data.week)} <span className="font-normal text-slate-500">- {day(weekEnd.toISOString())}</span></h2></div>
        <form method="get" action="/convocatorias" className="flex min-w-0 flex-wrap items-end gap-2"><input type="hidden" name="campus" value={data.campusId} /><input type="hidden" name="program" value={program} />
          <label className="grid min-w-0 gap-1 text-sm">Lunes de la semana<input type="date" name="week" defaultValue={data.week} className={input} /></label><button className={link} type="submit">Ver semana</button>
        </form>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="week-control-cards">
        {data.campuses.flatMap(campus => CALLUP_PROGRAMS.map(p => {
          const squads = data.squads.filter(s => s.campusId === campus.id && matchesProgram(s.program, p.value));
          const reported = squads.filter(s => s.reports.length > 0).length;
          const pending = squads.length - reported;
          const complete = squads.length > 0 && pending === 0;
          const empty = squads.length === 0;
          const active = campus.id === data.campusId && program === p.value;
          const target: Filters = { campus: campus.id, program: p.value, week: data.week };
          const saved = current.filter(c => c.campusId === campus.id && matchesProgram(c.program, p.value));
          return <article key={`${campus.id}:${p.value}`} className={`min-w-0 rounded-md border ${active ? "border-portoBlue bg-blue-50 dark:bg-blue-950/30" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"}`}>
            <Link href={href("/convocatorias", target)} aria-current={active ? "page" : undefined} className="block p-3">
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold">{campus.name}</h3><p className="text-xs text-slate-500">{p.label}</p></div><span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${empty ? "bg-slate-400" : complete ? "bg-emerald-500" : "bg-rose-500"}`} aria-label={empty ? "Sin equipos" : complete ? "Completo" : "Pendiente"} /></div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-2"><p className="text-2xl font-semibold">{reported}<span className="text-sm font-normal text-slate-500">/{squads.length}</span></p><p className={`text-xs font-semibold ${empty ? "text-slate-500" : pending ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{empty ? "Sin equipos" : pending ? `${pending} ${pending === 1 ? "pendiente" : "pendientes"}` : "Reportes completos"}</p></div>
            </Link>
            <div className="flex flex-wrap gap-2 border-t border-slate-200 p-2 dark:border-slate-700">
              <Link className={link} href={href("/convocatorias", target, { detail: "horarios" }, "#detalle-horarios")}>Ver detalle</Link>
              {saved.map(c => <Link key={c.id} className={link} href={`/convocatorias/${c.id}`}>Abrir convocatoria{saved.length > 1 ? ` | ${c.name}` : ""}</Link>)}
            </div>
          </article>;
        }))}
      </div>
      <div className="max-w-full overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700" tabIndex={0} role="region" aria-label="Reportes por equipo">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300"><tr>{["Estado", "Profesor", "Equipo", "Campus / programa", "Torneo", "Partidos", "Ultima actualizacion"].map(h => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">{units.map(s => {
            const reported = s.reports.length > 0;
            const resting = reported && s.reports.every(r => r.isRest);
            const updated = s.reports.map(r => r.updatedAt).filter(Boolean).sort().at(-1);
            return <tr key={s.id} className={reported ? "bg-emerald-50/40 dark:bg-emerald-950/20" : "bg-rose-50/60 dark:bg-rose-950/20"}>
              <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${reported ? "border-emerald-300 text-emerald-800 dark:text-emerald-300" : "border-rose-300 text-rose-800 dark:text-rose-300"}`}>{resting ? "Descanso" : reported ? "Reportado" : "Pendiente"}</span></td>
              <td className="max-w-56 break-words px-3 py-2">{s.coaches.join(", ") || "Sin profesor asignado"}</td>
              <td className="max-w-64 break-words px-3 py-2"><Link className="font-medium text-portoBlue dark:text-sky-300 hover:underline" href={href("/convocatorias", selected, { detail: "horarios" }, `#equipo-${s.id}`)}>{s.name}</Link><span className="block text-xs text-slate-500">Cat. {s.category}</span></td>
              <td className="px-3 py-2">{data.campuses.find(c => c.id === s.campusId)?.name}<span className="block text-xs text-slate-500">{programLabel(s.program)}</span></td>
              <td className="max-w-52 break-words px-3 py-2">{resting ? "Descanso" : s.tournamentName}</td>
              <td className="px-3 py-2 text-center font-semibold">{s.reports.reduce((sum, r) => sum + r.games.length, 0)}</td>
              <td className="px-3 py-2 text-xs">{updated ? new Intl.DateTimeFormat("es-MX", { timeZone: "America/Monterrey", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(updated)) : "Sin reporte"}</td>
            </tr>;
          })}{!units.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No hay equipos activos para esta seleccion.</td></tr>}</tbody>
        </table>
      </div>
    </section>
    {filters.detail === "horarios" && <section id="detalle-horarios" className="min-w-0 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Detalle de horarios | {programLabel(program)}</h2><Link className={link} href={href("/convocatorias", selected)}>Cerrar detalle</Link></div><SportingSquads squads={units} />
    </section>}
    <details className="border-t border-slate-200 pt-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold text-portoBlue dark:text-sky-300">Convocatorias anteriores ({previous.length})</summary>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{previous.map(c => <article key={c.id} className="min-w-0 space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700"><h3 className="break-words font-semibold">{c.name}</h3><p className="text-sm text-slate-500">{data.campuses.find(campus => campus.id === c.campusId)?.name} | {programLabel(c.program)} | {day(c.week)}</p><Link className={link} href={`/convocatorias/${c.id}`}>Abrir convocatoria</Link></article>)}</div>
      {!previous.length && <p className="py-3 text-sm text-slate-500">Sin convocatorias anteriores.</p>}
    </details>
  </div></PageShell>;
}

export async function CallupReadDetail({ id }: { id: string }) {
  const callup = await getCallupReadDetail(id);
  if (!callup) notFound();
  return <PageShell title={callup.name} subtitle={`${callup.campusName} | ${programLabel(callup.program)} | ${day(callup.week)}`} breadcrumbs={[{ label: "Convocatorias", href: "/convocatorias" }, { label: callup.name }]} wide>
    <div className="divide-y divide-slate-200 dark:divide-slate-700">{callup.categories.map((category) => <section key={category.id} className="space-y-3 py-5"><h2 className="text-lg font-semibold">{category.name}</h2><p className="text-sm">{category.tournamentName} | {category.coaches || "Sin profesor"}</p>{category.isRest && <p className="font-medium">Descansa</p>}<div className="grid gap-6 lg:grid-cols-2"><div><h3 className="font-medium">Plantel ({category.players.length})</h3><SportingRoster players={category.players} /></div><div><h3 className="font-medium">Partidos</h3><SportingGames games={category.games} /></div></div></section>)}</div>
    {!callup.categories.length && <p className="py-6 text-sm text-slate-500">Sin planteles en esta convocatoria.</p>}
  </PageShell>;
}
