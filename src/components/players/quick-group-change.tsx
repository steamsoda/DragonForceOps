"use client";

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, ArrowRightLeft, Search, X } from 'lucide-react';
import { getGroupChangeOptions, quickChangeTrainingGroup, searchGroupChangePlayers } from '@/server/actions/quick-group-change';
import { groupChoiceDetail, groupChoiceLabel, isSuggestedGroup, type GroupChangeOptions, type GroupSearchPlayer } from '@/lib/training-groups/quick-change';

const inputClass = 'w-full rounded-md border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100';
export function QuickGroupChange({ playerId, onChanged }: { playerId: string; onChanged?: (label: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const confirmButton = useRef<HTMLButtonElement>(null);
  const request = useRef(0);
  const [data, setData] = useState<GroupChangeOptions>();
  const [enrollmentId, setEnrollment] = useState('');
  const [sourceId, setSource] = useState('');
  const [targetId, setTarget] = useState('');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => { if (confirm) confirmButton.current?.focus(); }, [confirm]);
  const enrollment = data?.enrollments.find(e => e.id === enrollmentId);
  const source = enrollment?.assignments.find(a => a.id === sourceId);
  const target = data?.groups.find(g => g.id === targetId);
  const year = data?.player.birth_date ? Number(data.player.birth_date.slice(0,4)) : null;
  const choices = (data?.groups ?? []).filter(g => g.campus_id === enrollment?.campus_id && g.id !== source?.group_id)
    .filter(g => `${groupChoiceLabel(g)} ${groupChoiceDetail(g)} ${g.name}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')))
    .sort((a,b) => Number(isSuggestedGroup(b,year))-Number(isSuggestedGroup(a,year)) || groupChoiceLabel(a).localeCompare(groupChoiceLabel(b),'es') || a.id.localeCompare(b.id));
  async function open() {
    const id = ++request.current;
    setData(undefined); setError(''); setTarget(''); setSearch(''); setConfirm(false); setSuccess('');
    dialog.current?.showModal();
    const result = await getGroupChangeOptions(playerId);
    if (id !== request.current) return;
    if (!result.data) { setError(result.error || 'No se pudieron cargar los grupos.'); return; }
    setData(result.data);
    const e = result.data.enrollments[0];
    setEnrollment(e?.id ?? ''); setSource(e?.assignments.length === 1 ? e.assignments[0].id : '');
  }
  async function save() {
    if (!target || !enrollment || busy) return;
    setBusy(true); setError('');
    try {
      const result = await quickChangeTrainingGroup({ enrollmentId, assignmentId: sourceId || null, targetId });
      if (!result.ok) { setError(result.error ?? 'No se pudo guardar.'); return; }
      const label = groupChoiceLabel(target);
      setSuccess(`Grupo actualizado: ${label}`); dialog.current?.close(); onChanged?.(label);
    } catch { setError('No se pudo confirmar el cambio. Vuelve a abrir el panel antes de reintentar.'); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={open} className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-portoBlue hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-slate-800"><ArrowRightLeft size={14} />Cambiar grupo</button>
    {success && <span role="status" className="block text-xs text-emerald-700 dark:text-emerald-300">{success}</span>}
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={e => { if (busy) e.preventDefault(); }} onClose={() => { request.current++; }} className="m-auto w-[calc(100%_-_2rem)] max-w-xl max-h-[90dvh] overflow-y-auto rounded-lg bg-white p-5 text-slate-900 shadow-xl backdrop:bg-black/40 dark:bg-slate-900 dark:text-slate-100">
      <div className="flex items-start justify-between gap-3"><div><h2 id={titleId} className="text-lg font-semibold">Cambiar grupo</h2><p className="text-sm">{data?.player.name}</p></div><button type="button" aria-label="Cerrar" title="Cerrar" disabled={busy} onClick={() => dialog.current?.close()} className="p-1"><X size={20}/></button></div>
      {error && <p role="alert" className="my-3 text-sm text-rose-600">{error}</p>}
      {!data && !error && <p role="status" className="py-6 text-sm">Cargando grupos...</p>}
      {data && <div className="mt-4 space-y-4">
        {data.enrollments.length>1 && <label className="block text-sm">Inscripcion<select disabled={busy || confirm} value={enrollmentId} className={inputClass} onChange={e => { const en=data.enrollments.find(x=>x.id===e.target.value);setEnrollment(e.target.value);setSource(en?.assignments.length===1?en.assignments[0].id:'');setTarget(''); }}>{data.enrollments.map(e=><option key={e.id} value={e.id}>{e.campus}</option>)}</select></label>}
        <div className="text-sm"><p className="text-slate-500">Grupo actual</p>{enrollment?.assignments.length && enrollment.assignments.length>1 ? <select aria-label="Asignacion a reemplazar" className={inputClass} value={sourceId} disabled={busy || confirm} onChange={e=>{setSource(e.target.value);setTarget('');}}><option value="">Seleccionar asignacion</option>{enrollment.assignments.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select> : <p className="font-medium">{data.groups.find(g=>g.id===source?.group_id) ? groupChoiceLabel(data.groups.find(g=>g.id===source?.group_id)!) : source?.name || 'Sin grupo'}</p>}</div>
        {!confirm ? <>
          <label className="block text-sm">Grupo destino<div className="relative mt-1"><Search className="pointer-events-none absolute left-2 top-2.5" size={16}/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} className={`${inputClass} pl-8`} placeholder="Buscar grupo, categoria o profesor"/></div></label>
          <div role="radiogroup" aria-label="Grupo destino" className="max-h-64 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-700">
            {choices.map(g=><label key={g.id} className={`flex cursor-pointer items-start gap-3 p-3 text-sm ${targetId===g.id?'bg-blue-50 dark:bg-slate-800':''}`}><input type="radio" name={titleId} value={g.id} checked={targetId===g.id} onChange={()=>setTarget(g.id)} className="mt-1"/><span className="min-w-0 break-words"><span className="block font-medium">{groupChoiceLabel(g)}</span><span className="block text-xs text-slate-500 dark:text-slate-400">{groupChoiceDetail(g)}</span>{isSuggestedGroup(g,year)&&<span className="text-xs text-emerald-700 dark:text-emerald-300">Coincide con categoria</span>}</span></label>)}
            {!choices.length && <p className="p-3 text-sm">No hay grupos con esa busqueda.</p>}
          </div>
          <div className="flex justify-end"><button type="button" disabled={!target || (!!enrollment?.assignments.length && !sourceId)} onClick={()=>setConfirm(true)} className="rounded-md bg-portoBlue px-4 py-2 text-sm text-white disabled:opacity-40">Revisar cambio</button></div>
        </> : <>
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span>{source?.name || 'Sin grupo'}</span><ArrowRight size={16}/><span>{target && groupChoiceLabel(target)}</span></div>
          {target && !isSuggestedGroup(target,year) && <p className="text-sm text-amber-700 dark:text-amber-300">La categoria del grupo no coincide con el nacimiento del jugador. Puedes confirmar esta asignacion.</p>}
          <p className="text-sm text-slate-600 dark:text-slate-300">Se conserva el historial de asistencias y las asignaciones manuales a torneos. Los equipos automaticos se actualizan segun las reglas del torneo.</p>
          <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={()=>setConfirm(false)} className="rounded-md border px-4 py-2 text-sm">Volver</button><button ref={confirmButton} type="button" disabled={busy} onClick={save} className="rounded-md bg-portoBlue px-4 py-2 text-sm text-white disabled:opacity-50">{busy?'Guardando...':'Confirmar cambio'}</button></div>
        </>}
      </div>}
    </dialog>
  </>;
}

export function GroupChangeSearch() {
  const [search,setSearch]=useState('');
  const [players,setPlayers]=useState<GroupSearchPlayer[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    let active=true;
    setPlayers([]);setError('');
    if(search.trim().length<2){setLoading(false);return;}
    setLoading(true);
    const timer=setTimeout(()=>{searchGroupChangePlayers(search).then(result=>{if(active){setPlayers(result.players);setError(result.error||'');setLoading(false);}}).catch(()=>{if(active){setError('No se pudo buscar.');setLoading(false);}});},300);
    return()=>{active=false;clearTimeout(timer);};
  },[search]);
  return <section className="space-y-2 print:hidden"><label className="block max-w-lg text-sm font-medium">Cambiar grupo de un jugador<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre o ID del jugador" maxLength={100} className={`${inputClass} mt-1`}/></label>
    {loading&&<p role="status" className="text-sm">Buscando...</p>}{error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {!loading&&!error&&search.trim().length>=2&&!players.length&&<p className="text-sm">Sin resultados.</p>}
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">{players.map(p=><li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><div className="text-sm"><p className="font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.campus} | {p.birth_date?.slice(0,4)}</p></div><QuickGroupChange playerId={p.id}/></li>)}</ul>
    {players.length===30&&<p className="text-xs text-slate-500">Primeros 30 resultados. Afina la busqueda.</p>}
  </section>;
}
