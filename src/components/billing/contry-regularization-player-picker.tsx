"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getContryRegularizationDrilldownMetaAction,
  listContryRegularizationPlayersByYearAction,
  searchContryRegularizationPlayersAction,
  type ContryRegularizationDrilldownMeta,
  type ContryRegularizationPlayerResult,
} from "@/server/actions/payments";

type SearchView =
  | { tag: "idle" }
  | { tag: "searching"; query: string }
  | { tag: "results"; query: string; results: ContryRegularizationPlayerResult[] };

type DrilldownState =
  | { step: "closed" }
  | { step: "loading" }
  | { step: "years"; meta: ContryRegularizationDrilldownMeta }
  | {
      step: "players";
      meta: ContryRegularizationDrilldownMeta;
      birthYear: number;
      players: ContryRegularizationPlayerResult[] | null;
    };

function formatMoney(amount: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount);
}

export function ContryRegularizationPlayerPicker({
  selectedEnrollmentId,
}: {
  selectedEnrollmentId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<SearchView>({ tag: "idle" });
  const [drilldown, setDrilldown] = useState<DrilldownState>({ step: "closed" });
  const [preloadedMeta, setPreloadedMeta] = useState<ContryRegularizationDrilldownMeta | null>(null);
  const [pickerMessage, setPickerMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getContryRegularizationDrilldownMetaAction().then(setPreloadedMeta);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setView((current) => (current.tag === "searching" || current.tag === "results" ? { tag: "idle" } : current));
      setPickerMessage(null);
      return;
    }

    setView({ tag: "searching", query: trimmed });
    setPickerMessage("Buscando jugadores activos de Contry...");
    const timer = setTimeout(() => {
      startTransition(async () => {
        const results = await searchContryRegularizationPlayersAction(trimmed);
        setView({ tag: "results", query: trimmed, results });
        setPickerMessage(null);
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  function replaceEnrollment(enrollmentId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("enrollment", enrollmentId);
    params.delete("ok");
    params.delete("err");
    params.delete("payment");
    setPickerMessage("Abriendo la cuenta seleccionada...");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      setQuery("");
      setView({ tag: "idle" });
      setDrilldown({ step: "closed" });
    });
  }

  function openDrilldown() {
    if (preloadedMeta) {
      setDrilldown({ step: "years", meta: preloadedMeta });
      return;
    }

    setDrilldown({ step: "loading" });
    setPickerMessage("Cargando categorías de Contry...");
    startTransition(async () => {
      const meta = await getContryRegularizationDrilldownMetaAction();
      setDrilldown({ step: "years", meta });
      setPickerMessage(null);
    });
  }

  function selectYear(meta: ContryRegularizationDrilldownMeta, birthYear: number) {
    setDrilldown({ step: "players", meta, birthYear, players: null });
    setPickerMessage(`Cargando jugadores ${birthYear}...`);
    startTransition(async () => {
      const players = await listContryRegularizationPlayersByYearAction(birthYear);
      setDrilldown({ step: "players", meta, birthYear, players });
      setPickerMessage(null);
    });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Buscar cuenta Contry</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Busca por nombre o categoría para abrir una cuenta activa de Contry y capturar pagos históricos.
        </p>
      </div>

      <div className="relative">
        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Buscar jugador Contry</label>
        <input
          ref={inputRef}
          autoFocus
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nombre o categoría (ej. 2013)..."
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base shadow-sm focus:border-portoBlue focus:outline-none focus:ring-1 focus:ring-portoBlue dark:border-slate-600 dark:bg-slate-900"
        />
        <p className="mt-1 text-xs text-slate-400">
          {pickerMessage ?? "Solo se muestran jugadores activos de Contry con acceso autorizado."}
        </p>

        {view.tag === "results" ? (
          <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {view.results.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Sin resultados para “{view.query}”.</p>
            ) : (
              <ul>
                {view.results.map((player) => (
                  <li key={player.enrollmentId}>
                    <button
                      type="button"
                      onClick={() => replaceEnrollment(player.enrollmentId)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <div>
                        <span className="font-medium text-slate-800 dark:text-slate-200">{player.playerName}</span>
                        <span className="ml-2 text-xs text-slate-400">
                          {player.campusName}
                          {player.birthYear ? ` · ${player.birthYear}` : ""}
                        </span>
                        {player.teamName ? <p className="text-xs text-slate-400">{player.teamName}</p> : null}
                      </div>
                      <span className={`text-xs font-semibold ${player.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                        {player.balance > 0
                          ? formatMoney(player.balance)
                          : player.balance < 0
                            ? `Crédito ${formatMoney(Math.abs(player.balance))}`
                            : "Al corriente"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <DrilldownPanel
        drilldown={drilldown}
        selectedEnrollmentId={selectedEnrollmentId}
        isPending={isPending}
        onOpen={openDrilldown}
        onSelectYear={selectYear}
        onSelectPlayer={(player) => replaceEnrollment(player.enrollmentId)}
        onBack={() => {
          setDrilldown((current) => {
            if (current.step === "players") return { step: "years", meta: current.meta };
            return { step: "closed" };
          });
        }}
        onClose={() => {
          setDrilldown({ step: "closed" });
          setPickerMessage(null);
        }}
      />
    </section>
  );
}

function DrilldownPanel({
  drilldown,
  selectedEnrollmentId,
  isPending,
  onOpen,
  onSelectYear,
  onSelectPlayer,
  onBack,
  onClose,
}: {
  drilldown: DrilldownState;
  selectedEnrollmentId?: string;
  isPending: boolean;
  onOpen: () => void;
  onSelectYear: (meta: ContryRegularizationDrilldownMeta, birthYear: number) => void;
  onSelectPlayer: (player: ContryRegularizationPlayerResult) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  if (drilldown.step === "closed") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
          <span className="text-xs text-slate-400 dark:text-slate-500">o</span>
          <div className="flex-1 border-t border-slate-200 dark:border-slate-700" />
        </div>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onOpen}
            className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-portoBlue hover:text-portoBlue dark:border-slate-600 dark:text-slate-400"
          >
            Buscar por categoría
          </button>
        </div>
      </div>
    );
  }

  if (drilldown.step === "loading") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
        Cargando categorías de Contry...
      </div>
    );
  }

  const headerClass = "mb-3 flex items-center justify-between";
  const backBtnClass = "text-sm text-portoBlue hover:underline";
  const closeBtnClass = "text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300";

  if (drilldown.step === "years") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className={headerClass}>
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Categorías Contry</p>
            <p className="text-xs text-slate-400">Selecciona el año de nacimiento para listar jugadores activos.</p>
          </div>
          <button type="button" onClick={onClose} className={closeBtnClass}>
            ✕ Cerrar
          </button>
        </div>
        {drilldown.meta.birthYears.length === 0 ? (
          <p className="text-sm text-slate-400">Sin jugadores activos en Contry.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {drilldown.meta.birthYears.map((year) => (
              <button
                key={year}
                type="button"
                disabled={isPending}
                onClick={() => onSelectYear(drilldown.meta, year)}
                className="rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-5 text-center text-xl font-bold text-slate-800 transition-colors hover:border-portoBlue hover:bg-blue-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-blue-950/20"
              >
                {year}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className={headerClass}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className={backBtnClass}>
            ← {drilldown.birthYear}
          </button>
          <span className="text-slate-300 dark:text-slate-600">/</span>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{drilldown.meta.campusName}</p>
        </div>
        <button type="button" onClick={onClose} className={closeBtnClass}>
          ✕ Cerrar
        </button>
      </div>
      {drilldown.players === null ? (
        <p className="py-4 text-center text-sm text-slate-400">Cargando jugadores...</p>
      ) : drilldown.players.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Sin jugadores activos en esta categoría.</p>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {drilldown.players.map((player) => {
            const selected = player.enrollmentId === selectedEnrollmentId;
            return (
              <li key={player.enrollmentId}>
                <button
                  type="button"
                  onClick={() => onSelectPlayer(player)}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-3 text-left transition-colors ${
                    selected ? "bg-portoBlue/5" : "hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{player.playerName}</p>
                    {player.teamName ? (
                      <p className="text-xs text-slate-400">
                        {player.teamName}
                        {player.coachName ? ` · ${player.coachName}` : ""}
                      </p>
                    ) : null}
                  </div>
                  <span className={`ml-3 shrink-0 text-xs font-semibold ${player.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {player.balance > 0
                      ? formatMoney(player.balance)
                      : player.balance < 0
                        ? `Crédito ${formatMoney(Math.abs(player.balance))}`
                        : "Al corriente"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
