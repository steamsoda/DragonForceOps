"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Plus, Search, ShieldCheck, X } from "lucide-react";
import { savePreauthorization, revokePreauthorization } from "@/server/actions/preauthorizations";

export type Preauthorization = { email: string; role_code: string; campus_id: string | null; campus_name: string | null;
  enabled: boolean; auto_grant: boolean; claimed_at: string | null; approved_at: string; revision: number; last_issue: string | null };
type Props = { rows: Preauthorization[]; total: number; offset: number; search: string; unavailable: boolean;
  roles: { code: string; label: string }[]; campuses: { id: string; name: string }[] };
const field = "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";
const button = "inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600";
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className={`${button} bg-portoBlue text-white`} disabled={pending} type="submit"><ShieldCheck size={16} />{pending ? "Guardando..." : label}</button>;
}
function Editor({ row, roles, campuses, close, revoke }: Pick<Props, "roles" | "campuses"> & { row: Preauthorization | null; close: () => void; revoke: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [role, setRole] = useState(row?.role_code ?? roles[0]?.code ?? "");
  const scoped = ["front_desk", "nutritionist", "attendance_admin", "director_deportivo"].includes(role);
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
  }, []);
  return <dialog ref={dialog} onClose={close} className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] overflow-y-auto rounded-lg border border-slate-300 bg-white p-5 text-slate-900 backdrop:bg-black/40 dark:bg-slate-900 dark:text-white" aria-labelledby="preauthorization-title">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 id="preauthorization-title" className="text-lg font-semibold">{revoke ? "Revocar preautorizacion" : row ? "Editar preautorizacion" : "Autorizar correo"}</h2><button type="button" onClick={close} title="Cerrar" aria-label="Cerrar" className="p-2"><X size={18} /></button></div>
    <form action={revoke ? revokePreauthorization : savePreauthorization} className="space-y-4">
      <input type="hidden" name="revision" value={row?.revision ?? -1} />
      <label className="grid gap-1 text-sm">Correo electronico<input autoFocus name="email" type="email" required maxLength={254} readOnly={!!row} defaultValue={row?.email ?? ""} className={field} /></label>
      {revoke ? <p className="text-sm">Se cancelara el acceso pendiente de este correo. Los roles ya asignados no se modifican.</p> : <>
        <label className="grid gap-1 text-sm">Rol<select className={field} name="role" value={role} onChange={e => setRole(e.target.value)}>{roles.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}</select></label>
        {scoped ? <label className="grid gap-1 text-sm">Campus<select key={role} className={field} name="campus" required={role !== "director_deportivo"} defaultValue={row?.campus_id ?? ""}><option value="">{role === "director_deportivo" ? "Todos" : "Selecciona campus"}</option>{campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : <input type="hidden" name="campus" value="" />}
        <p className="text-sm text-slate-500">Acceso pendiente de confirmar el correo e iniciar sesion. No se enviara una invitacion.</p>
      </>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={button} onClick={close}>Cancelar</button><Submit label={revoke ? "Revocar" : "Guardar autorizacion"} /></div>
    </form>
  </dialog>;
}
export function Preauthorizations(props: Props) {
  const [editor, setEditor] = useState<{ row: Preauthorization | null; revoke: boolean } | null>(null);
  const pageHref = (offset: number) => `/admin/users?${new URLSearchParams({ tab: "preauthorizations", q: props.search, offset: String(offset) })}`;
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <form className="flex max-w-full gap-2" method="get"><input type="hidden" name="tab" value="preauthorizations" /><input name="q" aria-label="Buscar correo" placeholder="Buscar correo" defaultValue={props.search} maxLength={254} className={field} /><button type="submit" className={button} title="Buscar" aria-label="Buscar"><Search size={16} /></button></form>
      <button className={`${button} bg-portoBlue text-white`} disabled={props.unavailable} onClick={() => setEditor({ row: null, revoke: false })}><Plus size={16} />Autorizar correo</button>
    </div>
    {props.unavailable ? <p role="alert" className="rounded border border-amber-300 p-3 text-sm">No se pudieron cargar las preautorizaciones. Revisa que la actualizacion de base de datos este instalada.</p> : <>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-xs text-slate-500"><tr>{["Correo", "Rol", "Campus", "Estado", "Acciones"].map(h => <th className="px-3 py-2" key={h}>{h}</th>)}</tr></thead><tbody>
        {props.rows.map(row => <tr key={row.email} className="border-b border-slate-200 dark:border-slate-700">
          <td className="max-w-72 break-words px-3 py-2">{row.email}</td><td className="px-3 py-2">{props.roles.find(r => r.code === row.role_code)?.label ?? row.role_code}</td><td className="px-3 py-2">{row.campus_name ?? "Todos"}</td>
          <td className="px-3 py-2">{row.claimed_at ? "Asignada" : row.last_issue ? "Requiere revision" : !row.enabled ? "Revocada" : !row.auto_grant ? "Solo manual" : "Pendiente"}</td>
          <td className="px-3 py-2"><div className="flex gap-1">{!row.claimed_at ? <><button className="p-2" title="Editar autorizacion" aria-label={`Editar ${row.email}`} onClick={() => setEditor({ row, revoke: false })}><Pencil size={16} /></button>{row.enabled && <button className="p-2 text-red-600" title="Revocar autorizacion" aria-label={`Revocar ${row.email}`} onClick={() => setEditor({ row, revoke: true })}><X size={16} /></button>}</> : <span className="text-xs text-slate-500">Gestionar en Usuarios</span>}</div></td>
        </tr>)}
        {!props.rows.length && <tr><td colSpan={5} className="p-5 text-center text-slate-500">Sin preautorizaciones.</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between text-sm"><span>{props.total} autorizaciones</span><div className="flex gap-4">{props.offset > 0 && <a href={pageHref(Math.max(0, props.offset - 50))}>Anterior</a>}{props.offset + 50 < props.total && <a href={pageHref(props.offset + 50)}>Siguiente</a>}</div></div>
    </>}
    {editor && <Editor {...editor} roles={props.roles} campuses={props.campuses} close={() => setEditor(null)} />}
  </section>;
}
