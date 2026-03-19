"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getCajaDrilldownMetaAction,
  listCajaPlayersByCampusYearAction,
  type CajaPlayerResult,
  type CajaDrilldownMeta,
} from "@/server/actions/caja";

type DrilldownStep =
  | { step: "closed" }
  | { step: "loading-meta" }
  | { step: "campus"; meta: CajaDrilldownMeta }
  | { step: "year"; meta: CajaDrilldownMeta; campusId: string; campusName: string }
  | { step: "players"; meta: CajaDrilldownMeta; campusId: string; campusName: string; birthYear: number; players: CajaPlayerResult[] | null };

export function PlayersDrilldown() {
  const router = useRouter();
  const [drilldown, setDrilldown] = useState<DrilldownStep>({ step: "closed" });
  const [preloadedMeta, setPreloadedMeta] = useState<CajaDrilldownMeta | null>(null);
  const [isPending, startTransition] = useTransition();

  // Preload meta in background so the panel opens instantly
  useEffect(() => {
    getCajaDrilldownMetaAction().then(setPreloadedMeta);
  }, []);

  function open() {
    if (preloadedMeta) { setDrilldown({ step: "campus", meta: preloadedMeta }); return; }
    setDrilldown({ step: "loading-meta" });
    startTransition(async () => {
      const meta = await getCajaDrilldownMetaAction();
      setDrilldown({ step: "campus", meta });
    });
  }

  function selectCampus(campusId: string, campusName: string, meta: CajaDrilldownMeta) {
    setDrilldown({ step: "year", meta, campusId, campusName });
  }

  function selectYear(campusId: string, campusName: string, birthYear: number, meta: CajaDrilldownMeta) {
    setDrilldown({ step: "players", meta, campusId, campusName, birthYear, players: null });
    startTransition(async () => {
      const players = await listCajaPlayersByCampusYearAction(campusId, birthYear);
      setDrilldown({ step: "players", meta, campusId, campusName, birthYear, players });
    });
  }

  function back() {
    setDrilldown((prev) => {
      if (prev.step === "year") return { step: "campus", meta: prev.meta };
      if (prev.step === "players") return { step: "year", meta: prev.meta, campusId: prev.campusId, campusName: prev.campusName };
      return { step: "closed" };
    });
  }

  function close() { setDrilldown({ step: "closed" }); }

  const backBtnClass = "text-sm text-portoBlue hover:underline";
  const closeBtnClass = "text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300";
  const headerClass = "flex items-center justify-between mb-3";

  if (drilldown.step === "closed") {
    return (
      <button
        type="button"
        onClick={open}
        className="rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:border-portoBlue hover:text-portoBlue transition-colors"
      >
        Buscar por categoría
      </button>
    );
  }

  if (drilldown.step === "loading-meta") {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
        Cargando campuses…
      </div>
    );
  }

  if (drilldown.step === "campus") {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className={headerClass}>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Selecciona campus</p>
          <button type="button" onClick={close} className={closeBtnClass}>✕ Cerrar</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {drilldown.meta.campuses.map((campus) => (
            <button
              key={campus.id}
              type="button"
              disabled={isPending}
              onClick={() => selectCampus(campus.id, campus.name, drilldown.meta)}
              className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-5 py-6 text-center text-lg font-semibold text-slate-800 dark:text-slate-200 hover:border-portoBlue hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors disabled:opacity-50"
            >
              {campus.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (drilldown.step === "year") {
    const years = drilldown.meta.birthYearsByCampus[drilldown.campusId] ?? [];
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className={headerClass}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={back} className={backBtnClass}>← {drilldown.campusName}</button>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Categoría</p>
          </div>
          <button type="button" onClick={close} className={closeBtnClass}>✕ Cerrar</button>
        </div>
        {years.length === 0 ? (
          <p className="text-sm text-slate-400">Sin alumnos activos en este campus.</p>
        ) : (
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-4">
            {years.map((year) => (
              <button
                key={year}
                type="button"
                disabled={isPending}
                onClick={() => selectYear(drilldown.campusId, drilldown.campusName, year, drilldown.meta)}
                className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-5 text-center text-xl font-bold text-slate-800 dark:text-slate-200 hover:border-portoBlue hover:bg-blue-50 dark:hover:bg-blue-950/20 transition-colors disabled:opacity-50"
              >
                {year}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (drilldown.step === "players") {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className={headerClass}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={back} className={backBtnClass}>← {drilldown.birthYear}</button>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{drilldown.campusName}</p>
          </div>
          <button type="button" onClick={close} className={closeBtnClass}>✕ Cerrar</button>
        </div>
        {drilldown.players === null ? (
          <p className="py-4 text-center text-sm text-slate-400">Cargando alumnos…</p>
        ) : drilldown.players.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Sin alumnos activos en esta categoría.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[60vh] overflow-y-auto">
            {drilldown.players.map((p) => (
              <li key={p.playerId}>
                <button
                  type="button"
                  onClick={() => router.push(`/players/${p.playerId}`)}
                  className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{p.playerName}</p>
                    {p.teamName && (
                      <p className="text-xs text-slate-400">{p.teamName}{p.coachName ? ` · ${p.coachName}` : ""}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400 ml-3">Ver perfil →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return null;
}
