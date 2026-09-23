"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, Check, Pencil, RefreshCw, Search, UserMinus, UserPlus, Users, X } from "lucide-react";
import { manageCoachAction } from "@/server/actions/coaches";
import { replaceCoachInGroup, summarizeCoachTournamentChanges, type Coach, type CoachDirectory, type CoachGroupCommand } from "@/lib/coaches/types";

type Mode = "save" | "groups" | "replace" | "depart";
const field = "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white";
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600";
const coachName = (coach: Coach) => `${coach.firstName} ${coach.lastName}`;
const time = (value: string | null) => value ? new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(new Date(`2000-01-01T${value}Z`)) : "Sin horario";

export function CoachDirectoryClient({ data }: { data: CoachDirectory }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [selected, setSelected] = useState<Coach | null>(null);
  const [mode, setMode] = useState<Mode>("save");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [campus, setCampus] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>( {} );
  const [reason, setReason] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const byId = useMemo(() => new Map(data.coaches.map(c => [c.id, c])), [data.coaches]);
  const name = (id: string) => byId.has(id) ? coachName(byId.get(id)!) : "Profesor de otro campus";
  const assigned = selected ? data.groups.filter(g => g.coaches.some(c => c.coachId === selected.id)) : [];
  const showGroups = mode === "groups" ? data.groups.filter(g => g.status === "active" || g.coaches.some(c => c.coachId === selected?.id)) : assigned;
  const commands: CoachGroupCommand[] = selected ? showGroups.flatMap(g => {
    const target = targets[g.id];
    if (mode === "groups") {
      const wasAssigned = g.coaches.some(c => c.coachId === selected.id);
      if ((target === "yes") === wasAssigned) return [];
      return [replaceCoachInGroup(g, selected.id, target === "yes" ? selected.id : null)];
    }
    if (target === undefined || target === "keep") return [];
    return [replaceCoachInGroup(g, selected.id, target || null)];
  }) : [];
  const tournamentChanges = summarizeCoachTournamentChanges(commands);
  const unstaffedTeams = [...new Map(data.groups.flatMap(g => g.tournaments).filter(t => t.mode === "inherited" && !t.sourceGroups.some(g => g.coaches.some(c => byId.get(c.coachId)?.active))).map(t => [t.id, t])).values()];

  function open(nextMode: Mode, coach: Coach | null) {
    setSelected(coach); setMode(nextMode); setReview(false); setError(""); setReason("");
    setFirstName(coach?.firstName ?? ""); setLastName(coach?.lastName ?? ""); setCampus(coach?.campusId ?? data.campuses[0]?.id ?? "");
    setTargets(Object.fromEntries(data.groups.map(g => [g.id, nextMode === "groups" ? (g.coaches.some(c => c.coachId === coach?.id) ? "yes" : "") : nextMode === "depart" ? "" : "keep"])));
    dialog.current?.showModal();
  }
  function close() { if (!busy) dialog.current?.close(); }
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await manageCoachAction(mode === "save"
        ? { operation: "save", id: selected?.id ?? null, expected: selected?.version ?? null, firstName, lastName, campusId: campus }
        : mode === "depart"
          ? { operation: "depart", id: selected!.id, expected: selected!.departureVersion!, groups: commands, reason }
          : { operation: "assign", groups: commands, reason });
      if (!result.ok) { setError(result.message); return; }
      dialog.current?.close();
      setNotice(result.providerPending ? "Baja registrada y acceso a Invicta bloqueado. Falta confirmar el bloqueo del proveedor; usa Reintentar bloqueo." : "Cambios guardados.");
      router.refresh();
    } catch { setError("No se pudo confirmar el resultado. Actualiza la pagina antes de volver a intentar."); }
    finally { setBusy(false); }
  }
  async function retry(coach: Coach) {
    setBusy(true);
    try {
      const result = await manageCoachAction({ operation: "retry", id: coach.id });
      setNotice(!result.ok ? result.message : result.providerPending ? "El acceso sigue bloqueado. El proveedor aun no confirma; vuelve a intentar mas tarde." : "Bloqueo del proveedor confirmado.");
      router.refresh();
    } catch { setNotice("No se pudo confirmar el bloqueo del proveedor. El bloqueo local permanece."); }
    finally { setBusy(false); }
  }
  const title = mode === "save" ? selected ? "Editar profesor" : "Nuevo profesor" : mode === "groups" ? "Asignar grupos" : mode === "replace" ? "Reemplazar en grupos" : "Dar de baja";
  const sections = [...data.campuses, { id: "", name: "Sin campus" }];
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
      <label className="relative min-w-48 flex-1"><span className="sr-only">Buscar profesor</span><Search size={16} className="absolute left-3 top-3" aria-hidden /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar profesor" className={`${field} pl-9`} /></label>
      <select aria-label="Estado de profesores" className={`${field} !w-auto`} value={status} onChange={e => setStatus(e.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select>
      <button type="button" className={button} title="Actualizar profesores" aria-label="Actualizar profesores" onClick={() => router.refresh()}><RefreshCw size={16} /></button>
      <button className={button} disabled={!data.canLifecycle} onClick={() => open("save", null)}><UserPlus size={16} />Nuevo profesor</button>
    </div>
    {notice && <p role="status" className="border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm text-emerald-950">{notice}</p>}
    {unstaffedTeams.length > 0 && <section className="border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"><h2 className="font-semibold">Equipos de torneo sin profesor</h2><ul>{unstaffedTeams.map(t => <li key={t.id}>{t.tournament} · {t.name} · {data.campuses.find(c => c.id === t.campusId)?.name}</li>)}</ul></section>}
    {sections.map(section => {
      const coaches = data.coaches.filter(c => {
        const groupCampuses = data.groups.filter(g => g.coaches.some(a => a.coachId === c.id)).map(g => g.campusId);
        return (c.campusId === (section.id || null) || groupCampuses.includes(section.id)) &&
          (status === "all" || c.active === (status === "active")) && coachName(c).toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"));
      });
      const unassigned = data.groups.filter(g => g.status === "active" && g.campusId === section.id && !g.coaches.some(c => byId.get(c.coachId)?.active));
      if (!coaches.length && !unassigned.length) return null;
      return <section key={section.id}>
        <h2 className="mb-3 text-lg font-semibold">{section.name} <span className="text-sm font-normal text-slate-500">{coaches.length} profesores</span></h2>
        <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {coaches.map(coach => {
            const groups = data.groups.filter(g => g.campusId === section.id && g.coaches.some(a => a.coachId === coach.id));
            return <article key={coach.id} className="grid gap-3 py-4 lg:grid-cols-[minmax(180px,1fr)_minmax(260px,2fr)_auto]">
              <div><h3 className="font-medium">{coachName(coach)}</h3><p className="mt-1 text-xs text-slate-500">{coach.active ? "Activo" : "Inactivo"} · {coach.linked ? "Cuenta vinculada" : "Sin cuenta vinculada"}</p>
                {coach.providerPending && <button disabled={!data.canLifecycle || busy} className={`${button} mt-2 text-amber-700`} onClick={() => retry(coach)}><RefreshCw size={14} />Reintentar bloqueo</button>}
                {!coach.active && coach.tournaments.length > 0 && <p className="mt-2 text-xs text-amber-700">{coach.tournaments.length} responsabilidades de torneo por revisar</p>}
              </div>
              <ul className="space-y-2 text-sm">{groups.length ? groups.map(g => <li key={g.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1"><span>{g.name}<span className="ml-2 text-xs text-slate-500">{g.coaches.find(c => c.coachId === coach.id)?.primary ? "Principal" : "Apoyo"}</span></span><span className="text-xs text-slate-500">Lun–Mie · {time(g.startTime)} – {time(g.endTime)}</span></li>) : <li className="text-slate-500">Sin grupos asignados</li>}</ul>
              <div className="flex flex-wrap items-start gap-1">
                <button title="Editar profesor" aria-label={`Editar ${coachName(coach)}`} disabled={!data.canLifecycle || !coach.active} className={button} onClick={() => open("save", coach)}><Pencil size={16} /></button>
                <button title="Asignar grupos" aria-label={`Asignar grupos a ${coachName(coach)}`} disabled={!data.canManage || !coach.active} className={button} onClick={() => open("groups", coach)}><Users size={16} /></button>
                <button title="Reemplazar en grupos" aria-label={`Reemplazar a ${coachName(coach)}`} disabled={!data.canManage || !coach.active} className={button} onClick={() => open("replace", coach)}><ArrowRightLeft size={16} /></button>
                <button title="Dar de baja" aria-label={`Dar de baja a ${coachName(coach)}`} disabled={!data.canLifecycle || !coach.active || coach.protected} className={`${button} text-red-700`} onClick={() => open("depart", coach)}><UserMinus size={16} /></button>
              </div>
            </article>;
          })}
        </div>
        {unassigned.length > 0 && <div className="mt-3 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm text-amber-950"><h3 className="font-semibold">Sin profesor asignado</h3><ul className="mt-1 space-y-1">{unassigned.map(g => <li key={g.id}>{g.name} · {time(g.startTime)} – {time(g.endTime)}</li>)}</ul></div>}
      </section>;
    })}
    {!data.coaches.some(c => (status === "all" || c.active === (status === "active")) && coachName(c).toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))) && <p className="py-6 text-sm text-slate-500">No hay profesores con estos filtros.</p>}
    <dialog ref={dialog} style={{ margin: 0 }} onCancel={e => { if (busy) e.preventDefault(); }} className="fixed inset-y-0 left-auto right-0 h-dvh max-h-dvh w-full max-w-xl border-l border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-950 dark:text-white" aria-labelledby="coach-panel-title">
      <form onSubmit={e => { e.preventDefault(); if (review) void save(); else setReview(true); }} className="flex min-h-full flex-col">
        <header className="flex items-start justify-between gap-3 border-b p-5"><div><h2 id="coach-panel-title" className="text-lg font-semibold">{title}</h2>{selected && <p className="mt-1 text-sm text-slate-500">{coachName(selected)}</p>}</div><button type="button" className={button} aria-label="Cerrar" disabled={busy} onClick={close}><X size={18} /></button></header>
        <div className="flex-1 space-y-4 p-5">
          {error && <p role="alert" className="border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-900">{error}</p>}
          {mode === "save" ? <>
            <label className="block text-sm">Nombre<input required maxLength={100} disabled={review} value={firstName} onChange={e => setFirstName(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="block text-sm">Apellidos<input required maxLength={100} disabled={review} value={lastName} onChange={e => setLastName(e.target.value)} className={`${field} mt-1`} /></label>
            <label className="block text-sm">Campus base<select required disabled={review} value={campus} onChange={e => setCampus(e.target.value)} className={`${field} mt-1`}>{data.campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </> : <>
            {mode === "depart" && <div className="border-l-4 border-red-600 bg-red-50 p-3 text-sm text-red-950"><p className="font-semibold">Baja de la academia</p><p className="mt-1">{selected?.linked ? `Se bloqueara todo el acceso de ${selected.email ?? "la cuenta vinculada"}, incluidas sus sesiones y otros roles: ${selected.roles.join(", ")}.` : "Sin cuenta vinculada. Se conservara el historial del profesor."}</p><p className="mt-1">Los equipos heredados seguiran a los profesores de sus grupos. Las asignaciones manuales de torneo se conservaran.</p></div>}
            {!review && <div className="divide-y">{showGroups.map(g => <div key={g.id} className="py-3"><div className="text-sm font-medium">{g.name}</div><div className="mb-2 text-xs text-slate-500">{data.campuses.find(c => c.id === g.campusId)?.name} · {time(g.startTime)} – {time(g.endTime)}</div>
              {mode === "groups" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={targets[g.id] === "yes"} onChange={e => setTargets({ ...targets, [g.id]: e.target.checked ? "yes" : "" })} />Asignado a {selected?.firstName}</label>
                : <select aria-label={`Reemplazo para ${g.name}`} className={field} value={targets[g.id] ?? "keep"} onChange={e => setTargets({ ...targets, [g.id]: e.target.value })}>{mode !== "depart" && <option value="keep">Sin cambios</option>}<option value="">Retirar sin reemplazo</option>{data.coaches.filter(c => c.active && c.id !== selected?.id).map(c => <option key={c.id} value={c.id}>{coachName(c)}</option>)}</select>}
            </div>)}</div>}
            {review && <div className="space-y-3"><h3 className="font-semibold">Confirmar asignaciones</h3>{commands.map(c => <div key={c.groupId} className="border-b pb-3 text-sm"><p className="font-medium">{data.groups.find(g => g.id === c.groupId)?.name}</p><p className="mt-1 text-slate-500">Antes: {c.expected.map(x => name(x.coachId)).join(", ") || "Sin profesor"}</p><p className="mt-1">Ahora: {c.coaches.map(x => `${name(x.coachId)}${x.primary ? " (principal)" : ""}`).join(", ") || "Sin profesor asignado"}</p></div>)}</div>}
            {review && tournamentChanges.length > 0 && <section aria-label="Impacto en torneos" className="space-y-3 text-sm"><h3 className="font-semibold">Equipos que heredan estos cambios</h3>{tournamentChanges.map(t => <div key={t.id} className="border-b pb-3"><p className="font-medium">{t.tournament} · {t.name}</p><p className="text-xs text-slate-500">{data.campuses.find(c => c.id === t.campusId)?.name}</p><p className="mt-1 text-slate-500">Antes: {t.before.map(c => name(c.coachId)).join(", ") || "Sin profesor"}</p><p className={`mt-1 ${!t.after.length ? "font-semibold text-amber-700" : ""}`}>Ahora: {t.after.map(c => `${name(c.coachId)}${c.primary ? " (principal)" : ""}`).join(", ") || "Sin profesor asignado"}</p></div>)}</section>}
            <label className="block text-sm">Motivo<textarea required minLength={3} maxLength={500} disabled={review} className={`${field} mt-1`} value={reason} onChange={e => setReason(e.target.value)} /></label>
            {mode === "depart" && !!selected?.tournaments.some(t => !t.inherited) && <section className="text-sm"><h3 className="font-semibold text-amber-700">Asignaciones manuales por revisar</h3><ul className="mt-2 space-y-2">{selected.tournaments.filter(t => !t.inherited).map((t, i) => <li key={i}>{t.tournament} · {t.squad}</li>)}</ul></section>}
          </>}
        </div>
        <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-white p-4 dark:bg-slate-950">
          {review && <button type="button" className={button} disabled={busy} onClick={() => setReview(false)}>Volver</button>}
          <button type="button" className={button} disabled={busy} onClick={close}>Cancelar</button>
          <button className={`${button} border-blue-700 bg-blue-700 text-white`} disabled={busy || (mode !== "save" && mode !== "depart" && !commands.length)}><Check size={16} />{busy ? "Guardando..." : review ? mode === "depart" ? "Confirmar baja y bloqueo" : "Confirmar cambios" : "Revisar cambios"}</button>
        </footer>
      </form>
    </dialog>
  </div>;
}
