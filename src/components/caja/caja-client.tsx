"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import { PrintReceiptButton } from "./print-receipt-button";
import { type ReceiptData } from "@/lib/printer";
import type { AccessibleCampus } from "@/lib/auth/campuses";
import {
  searchPlayersForCajaAction,
  getEnrollmentForCajaAction,
  postCajaPaymentAction,
  getProductsForCajaAction,
  postCajaChargeAction,
  createAdvanceTuitionAction,
  checkoutCajaCartAction,
  getCajaDrilldownMetaAction,
  listCajaPlayersByCampusYearAction,
  type CajaPlayerResult,
  type CajaEnrollmentData,
  type CajaPaymentResult,
  type CajaProduct,
  type CajaProductCategory,
  type CajaDrilldownMeta,
  type CajaAdvanceTuitionResult,
  type CajaCartItemInput
} from "@/server/actions/caja";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatPeriodMonth(periodMonth: string | null): string {
  if (!periodMonth) return "";
  const d = new Date(periodMonth + "T12:00:00");
  return d.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

function methodLabel(method: string) {
  const labels: Record<string, string> = {
    cash: "Efectivo",
    transfer: "Transferencia",
    card: "Tarjeta",
    stripe_360player: "360Player",
    other: "Otro"
  };
  return labels[method] ?? method;
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "stripe_360player", label: "360Player" },
  { value: "other", label: "Otro" },
] as const;

function PlayerProfileLink({ playerId, playerName }: { playerId: string; playerName: string }) {
  if (!playerId) {
    return <p className="text-lg font-semibold text-portoDark">{playerName}</p>;
  }

  return (
    <Link href={`/players/${playerId}`} className="text-lg font-semibold text-portoDark hover:underline">
      {playerName}
    </Link>
  );
}

function MethodToggleGroup({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange?: (value: string) => void;
  name?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {PAYMENT_METHOD_OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <label
            key={option.value}
            className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${
              active
                ? "border-portoBlue bg-portoBlue text-white"
                : "border-slate-300 text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-600 dark:text-slate-300"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={active}
              onChange={() => onChange?.(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

function CampusChoiceGroup({
  campuses,
  value,
  onChange,
}: {
  campuses: AccessibleCampus[];
  value: string;
  onChange: (value: string) => void;
}) {
  if (campuses.length <= 3) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {campuses.map((campus) => {
          const active = campus.id === value;
          return (
            <button
              key={campus.id}
              type="button"
              onClick={() => onChange(campus.id)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-portoBlue bg-portoBlue text-white"
                  : "border-slate-300 text-slate-700 hover:border-portoBlue hover:text-portoBlue dark:border-slate-600 dark:text-slate-300"
              }`}
            >
              {campus.name}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-portoBlue focus:outline-none dark:border-slate-600"
    >
      {campuses.map((campus) => (
        <option key={campus.id} value={campus.id}>
          {campus.name}
        </option>
      ))}
    </select>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DrilldownStep =
  | { step: "closed" }
  | { step: "loading-meta" }
  | { step: "campus"; meta: CajaDrilldownMeta }
  | { step: "year"; meta: CajaDrilldownMeta; campusId: string; campusName: string }
  | { step: "players"; meta: CajaDrilldownMeta; campusId: string; campusName: string; birthYear: number; players: CajaPlayerResult[] | null };

type View =
  | { tag: "idle" }
  | { tag: "searching"; query: string }
  | { tag: "results"; query: string; results: CajaPlayerResult[] }
  | { tag: "loading-enrollment"; player: CajaPlayerResult }
  | { tag: "enrollment"; player: CajaPlayerResult; data: CajaEnrollmentData }
  | { tag: "paying"; player: CajaPlayerResult; data: CajaEnrollmentData; targetChargeIds: string[] }
  | { tag: "loading-products"; player: CajaPlayerResult; data: CajaEnrollmentData }
  | { tag: "adding-charge"; player: CajaPlayerResult; data: CajaEnrollmentData; products: CajaProductCategory[] }
  | { tag: "success"; receipt: Extract<CajaPaymentResult, { ok: true }>; player: CajaPlayerResult };

// ── Main component ─────────────────────────────────────────────────────────────

export function CajaClient({
  printerName,
  initialEnrollmentId,
  allowedCampuses,
  defaultCampusId,
}: {
  printerName: string;
  initialEnrollmentId?: string;
  allowedCampuses: AccessibleCampus[];
  defaultCampusId: string | null;
}) {
  const [view, setView] = useState<View>({ tag: "idle" });
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const [drilldown, setDrilldown] = useState<DrilldownStep>({ step: "closed" });
  const [preloadedMeta, setPreloadedMeta] = useState<CajaDrilldownMeta | null>(null);
  const [preloadedProducts, setPreloadedProducts] = useState<CajaProductCategory[] | null>(null);
  const didAutoload = useRef(false);

  // Preload drill-down meta in background so "Seleccionar por categoría" is instant
  useEffect(() => {
    getCajaDrilldownMetaAction().then(setPreloadedMeta);
  }, []);

  useEffect(() => {
    getProductsForCajaAction().then(setPreloadedProducts);
  }, []);

  // Auto-load enrollment when deep-linked from player profile (/caja?enrollmentId=...)
  useEffect(() => {
    if (!initialEnrollmentId || didAutoload.current) return;
    didAutoload.current = true;
    startTransition(async () => {
      const data = await getEnrollmentForCajaAction(initialEnrollmentId);
      if (!data) {
        setError("No se pudo cargar la información del alumno.");
        return;
      }
      const syntheticPlayer: CajaPlayerResult = {
        playerId: "",
        playerName: data.playerName,
        birthYear: null,
        enrollmentId: data.enrollmentId,
        campusName: data.campusName,
        balance: data.balance,
        teamName: null,
        coachName: null,
      };
      setView({ tag: "enrollment", player: syntheticPlayer, data });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setView((v) => (v.tag === "results" || v.tag === "searching" ? { tag: "idle" } : v));
      return;
    }
    setView({ tag: "searching", query: q });
    const timer = setTimeout(() => {
      startTransition(async () => {
        const results = await searchPlayersForCajaAction(q);
        setView({ tag: "results", query: q, results });
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  function selectPlayer(player: CajaPlayerResult) {
    setQuery("");
    setError(null);
    setView({ tag: "loading-enrollment", player });
    startTransition(async () => {
      const data = await getEnrollmentForCajaAction(player.enrollmentId);
      if (!data) {
        setError("No se pudo cargar la información del alumno.");
        setView({ tag: "idle" });
        return;
      }
      setView({ tag: "enrollment", player, data });
    });
  }

  function goToPayment(player: CajaPlayerResult, data: CajaEnrollmentData, targetChargeIds: string[] = []) {
    setView({ tag: "paying", player, data, targetChargeIds });
  }

  function goBackToPlayer(player: CajaPlayerResult) {
    setError(null);
    setView({ tag: "loading-enrollment", player });
    startTransition(async () => {
      const data = await getEnrollmentForCajaAction(player.enrollmentId);
      if (!data) {
        setError("No se pudo recargar la información del alumno.");
        setView({ tag: "idle" });
        return;
      }
      setView({ tag: "enrollment", player, data });
    });
  }

  function reset() {
    setView({ tag: "idle" });
    setQuery("");
    setError(null);
    setDrilldown({ step: "closed" });
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function openDrilldown() {
    if (preloadedMeta) {
      setDrilldown({ step: "campus", meta: preloadedMeta });
      return;
    }
    setDrilldown({ step: "loading-meta" });
    startTransition(async () => {
      const meta = await getCajaDrilldownMetaAction();
      setDrilldown({ step: "campus", meta });
    });
  }

  function drilldownSelectCampus(campusId: string, campusName: string, meta: CajaDrilldownMeta) {
    setDrilldown({ step: "year", meta, campusId, campusName });
  }

  function drilldownSelectYear(campusId: string, campusName: string, birthYear: number, meta: CajaDrilldownMeta) {
    setDrilldown({ step: "players", meta, campusId, campusName, birthYear, players: null });
    startTransition(async () => {
      const players = await listCajaPlayersByCampusYearAction(campusId, birthYear);
      setDrilldown({ step: "players", meta, campusId, campusName, birthYear, players });
    });
  }

  function drilldownBack() {
    setDrilldown((prev) => {
      if (prev.step === "year") return { step: "campus", meta: prev.meta };
      if (prev.step === "players") return { step: "year", meta: prev.meta, campusId: prev.campusId, campusName: prev.campusName };
      return { step: "closed" };
    });
  }

  function handlePaymentSubmit(player: CajaPlayerResult, enrollmentId: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await postCajaPaymentAction(enrollmentId, formData);
      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }
      setView({ tag: "success", receipt: result, player });
    });
  }

  function goToAddCharge(player: CajaPlayerResult, data: CajaEnrollmentData) {
    setError(null);
    setView({ tag: "loading-products", player, data });
    startTransition(async () => {
      const products = await getProductsForCajaAction();
      setView({ tag: "adding-charge", player, data, products });
    });
  }

  function handleChargeSubmit(player: CajaPlayerResult, enrollmentId: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await postCajaChargeAction(enrollmentId, formData);
      if (!result.ok) {
        setError(chargeErrorMessage(result.error));
        return;
      }
      setView({ tag: "enrollment", player, data: result.updatedData });
    });
  }

  const showSearchArea = view.tag === "idle" || view.tag === "searching" || view.tag === "results";

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-0 py-2 sm:space-y-8 sm:px-2 sm:py-4 lg:px-6 xl:px-8">
      {/* Search box — always visible unless in a later state */}
      {showSearchArea && (
        <SearchPanel
          query={query}
          setQuery={setQuery}
          view={view}
          onSelect={selectPlayer}
          isPending={isPending}
          inputRef={searchRef}
        />
      )}

      {/* Drill-down panel — visible alongside search */}
      {showSearchArea && (
        <DrilldownPanel
          drilldown={drilldown}
          isPending={isPending}
          onOpen={openDrilldown}
          onSelectCampus={drilldownSelectCampus}
          onSelectYear={drilldownSelectYear}
          onSelectPlayer={selectPlayer}
          onBack={drilldownBack}
          onClose={() => setDrilldown({ step: "closed" })}
        />
      )}

      {/* Loading enrollment — show header instantly from search data, skeleton for charges */}
      {view.tag === "loading-enrollment" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4">
            <div>
              <PlayerProfileLink playerId={view.player.playerId} playerName={view.player.playerName} />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {view.player.campusName}{view.player.birthYear ? ` · ${view.player.birthYear}` : ""}
              </p>
              {view.player.teamName && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {view.player.teamName}{view.player.coachName ? ` · ${view.player.coachName}` : ""}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className={`text-xl font-bold ${view.player.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {view.player.balance > 0
                  ? formatMoney(view.player.balance, "MXN")
                  : view.player.balance < 0
                  ? formatMoney(Math.abs(view.player.balance), "MXN")
                  : "Al corriente"}
              </p>
              <p className="text-xs text-slate-400">
                {view.player.balance > 0 ? "Saldo pendiente" : view.player.balance < 0 ? "Crédito en cuenta" : "Al corriente"}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
            Cargando cargos…
          </div>
        </div>
      )}

      {/* Enrollment POS panel */}
      {(view.tag === "enrollment" || view.tag === "paying" || view.tag === "loading-products" || view.tag === "adding-charge") && (
        <PosEnrollmentPanel
          player={view.player}
          data={view.data}
          allowedCampuses={allowedCampuses}
          defaultCampusId={defaultCampusId}
          products={preloadedProducts ?? []}
          productsLoading={preloadedProducts === null}
          onCancel={reset}
          onDataUpdate={(updatedData) => setView({ tag: "enrollment", player: view.player, data: updatedData })}
          onCheckoutSuccess={(receipt) => setView({ tag: "success", receipt, player: view.player })}
        />
      )}

      {/* Success / receipt */}
      {view.tag === "success" && (
        <ReceiptPanel
          receipt={view.receipt}
          printerName={printerName}
          onDone={reset}
          onBack={() => goBackToPlayer(view.player)}
        />
      )}

      {/* Generic error */}
      {error && view.tag === "idle" && (
        <p className="rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
}

// ── Drill-down panel ──────────────────────────────────────────────────────────

function DrilldownPanel({
  drilldown,
  isPending,
  onOpen,
  onSelectCampus,
  onSelectYear,
  onSelectPlayer,
  onBack,
  onClose
}: {
  drilldown: DrilldownStep;
  isPending: boolean;
  onOpen: () => void;
  onSelectCampus: (campusId: string, campusName: string, meta: CajaDrilldownMeta) => void;
  onSelectYear: (campusId: string, campusName: string, birthYear: number, meta: CajaDrilldownMeta) => void;
  onSelectPlayer: (p: CajaPlayerResult) => void;
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
            className="rounded-xl border border-slate-300 dark:border-slate-600 px-5 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:border-portoBlue hover:text-portoBlue transition-colors"
          >
            Seleccionar por categoría
          </button>
        </div>
      </div>
    );
  }

  if (drilldown.step === "loading-meta") {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
        Cargando campuses…
      </div>
    );
  }

  const headerClass = "flex items-center justify-between mb-3";
  const backBtnClass = "text-sm text-portoBlue hover:underline";
  const closeBtnClass = "text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300";

  if (drilldown.step === "campus") {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className={headerClass}>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Selecciona campus</p>
          <button type="button" onClick={onClose} className={closeBtnClass}>✕ Cerrar</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {drilldown.meta.campuses.map((campus) => (
            <button
              key={campus.id}
              type="button"
              disabled={isPending}
              onClick={() => onSelectCampus(campus.id, campus.name, drilldown.meta)}
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
            <button type="button" onClick={onBack} className={backBtnClass}>← {drilldown.campusName}</button>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Categoría</p>
          </div>
          <button type="button" onClick={onClose} className={closeBtnClass}>✕ Cerrar</button>
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
                onClick={() => onSelectYear(drilldown.campusId, drilldown.campusName, year, drilldown.meta)}
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
            <button type="button" onClick={onBack} className={backBtnClass}>← {drilldown.birthYear}</button>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{drilldown.campusName}</p>
          </div>
          <button type="button" onClick={onClose} className={closeBtnClass}>✕ Cerrar</button>
        </div>
        {drilldown.players === null ? (
          <p className="py-4 text-center text-sm text-slate-400">Cargando alumnos…</p>
        ) : drilldown.players.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Sin alumnos activos en esta categoría.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {drilldown.players.map((p) => (
              <li key={p.playerId}>
                <button
                  type="button"
                  onClick={() => onSelectPlayer(p)}
                  className="flex w-full items-center justify-between px-2 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{p.playerName}</p>
                    {p.teamName && (
                      <p className="text-xs text-slate-400">{p.teamName}{p.coachName ? ` · ${p.coachName}` : ""}</p>
                    )}
                  </div>
                  <span className={`shrink-0 text-sm font-semibold ml-3 ${p.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {p.balance > 0 ? formatMoney(p.balance, "MXN") : p.balance < 0 ? `Crédito ${formatMoney(Math.abs(p.balance), "MXN")}` : "Al corriente"}
                  </span>
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

// ── Search panel ──────────────────────────────────────────────────────────────

function SearchPanel({
  query,
  setQuery,
  view,
  onSelect,
  isPending,
  inputRef
}: {
  query: string;
  setQuery: (q: string) => void;
  view: View;
  onSelect: (p: CajaPlayerResult) => void;
  isPending: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">Buscar alumno</label>
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Nombre o año de nacimiento (ej. 2013)…"
        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3 text-base shadow-sm focus:border-portoBlue focus:outline-none focus:ring-1 focus:ring-portoBlue"
      />
      {isPending && view.tag === "searching" && (
        <p className="mt-1 text-xs text-slate-400">Buscando…</p>
      )}
      {view.tag === "results" && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
          {view.results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Sin resultados para &ldquo;{view.query}&rdquo;</p>
          ) : (
            <ul>
              {view.results.map((p) => (
                <li key={p.playerId}>
                  <button
                    onClick={() => onSelect(p)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <div>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{p.playerName}</span>
                      <span className="ml-2 text-slate-400 text-xs">{p.campusName}{p.birthYear ? ` · ${p.birthYear}` : ""}</span>
                      {p.teamName && (
                        <p className="text-xs text-slate-400">{p.teamName}{p.coachName ? ` · ${p.coachName}` : ""}</p>
                      )}
                    </div>
                    <span className={`text-xs font-semibold ${p.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {p.balance > 0
                        ? formatMoney(p.balance, "MXN")
                        : p.balance < 0
                        ? `Crédito ${formatMoney(Math.abs(p.balance), "MXN")}`
                        : "Al corriente"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Enrollment panel ──────────────────────────────────────────────────────────

type StagedCartItem = {
  id: string;
  label: string;
  detail?: string | null;
  amount: number;
  payload: CajaCartItemInput;
};

function makeCartItemId() {
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function PosEnrollmentPanel({
  player,
  data,
  allowedCampuses,
  defaultCampusId,
  products,
  productsLoading,
  onCancel,
  onDataUpdate,
  onCheckoutSuccess
}: {
  player: CajaPlayerResult;
  data: CajaEnrollmentData;
  allowedCampuses: AccessibleCampus[];
  defaultCampusId: string | null;
  products: CajaProductCategory[];
  productsLoading: boolean;
  onCancel: () => void;
  onDataUpdate: (updatedData: CajaEnrollmentData) => void;
  onCheckoutSuccess: (receipt: Extract<CajaPaymentResult, { ok: true }>) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CajaProduct | null>(null);
  const [size, setSize] = useState("");
  const [goalkeeper, setGoalkeeper] = useState(false);
  const [manualAmount, setManualAmount] = useState("");
  const [tuitionPeriod, setTuitionPeriod] = useState(
    data.advanceTuitionOptions[0]?.periodMonth.slice(0, 7) ?? getDefaultNextMonthCaja()
  );
  const [stagedItems, setStagedItems] = useState<StagedCartItem[]>([]);
  const [splitMode, setSplitMode] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount2, setPaymentAmount2] = useState("");
  const [paymentMethod2, setPaymentMethod2] = useState("transfer");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentPaidAt, setPaymentPaidAt] = useState("");
  const [operatorCampusId, setOperatorCampusId] = useState(
    defaultCampusId ?? allowedCampuses[0]?.id ?? data.campusId
  );
  const [panelError, setPanelError] = useState<string | null>(null);
  const [isCheckoutPending, startCheckoutTransition] = useTransition();

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      const validIds = new Set(data.pendingCharges.map((charge) => charge.id));
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [data.pendingCharges]);

  const stagedTuitionPeriods = new Set(
    stagedItems.flatMap((item) =>
      item.payload.kind === "tuition" ? [item.payload.periodMonth] : []
    )
  );
  const availableTuitionOptions = data.advanceTuitionOptions.filter(
    (option) => !stagedTuitionPeriods.has(option.periodMonth.slice(0, 7))
  );

  useEffect(() => {
    const firstOption = availableTuitionOptions[0]?.periodMonth.slice(0, 7);
    if (!firstOption) return;
    const hasCurrentOption = availableTuitionOptions.some(
      (option) => option.periodMonth.slice(0, 7) === tuitionPeriod
    );
    if (!hasCurrentOption) {
      setTuitionPeriod(firstOption);
    }
  }, [availableTuitionOptions, tuitionPeriod]);

  const selectedCharges = data.pendingCharges.filter((charge) => selectedIds.has(charge.id));
  const cartTotal =
    selectedCharges.reduce((sum, charge) => sum + charge.pendingAmount, 0) +
    stagedItems.reduce((sum, item) => sum + item.amount, 0);
  const checkoutTotal = cartTotal > 0 ? cartTotal : Math.max(data.balance, 0);
  const payableNow = checkoutTotal > 0;
  const selectedOperatorCampus = allowedCampuses.find((campus) => campus.id === operatorCampusId) ?? null;
  const isCrossCampus = operatorCampusId !== data.campusId;

  useEffect(() => {
    setPaymentAmount(checkoutTotal > 0 ? checkoutTotal.toFixed(2) : "");
  }, [checkoutTotal]);

  useEffect(() => {
    if (!allowedCampuses.some((campus) => campus.id === operatorCampusId)) {
      setOperatorCampusId(defaultCampusId ?? allowedCampuses[0]?.id ?? data.campusId);
    }
  }, [allowedCampuses, data.campusId, defaultCampusId, operatorCampusId]);

  function resetConfigurator(nextProduct?: CajaProduct | null) {
    setSelectedProduct(nextProduct ?? null);
    setSize("");
    setGoalkeeper(false);
    setManualAmount(nextProduct?.defaultAmount != null ? nextProduct.defaultAmount.toFixed(2) : "");
    setPanelError(null);
  }

  function toggleCharge(id: string) {
    setPanelError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addStagedItem(item: StagedCartItem) {
    setStagedItems((prev) => [...prev, item]);
    resetConfigurator(null);
  }

  function addTuitionToCurrentCharge() {
    const selectedOption = availableTuitionOptions.find(
      (option) => option.periodMonth.slice(0, 7) === tuitionPeriod
    );
    if (!selectedOption) {
      setPanelError("No hay mensualidades adelantadas disponibles para agregar.");
      return;
    }

    addStagedItem({
      id: makeCartItemId(),
      label: `Mensualidad ${selectedOption.label}`,
      detail: "Se crea al cobrar el cobro actual",
      amount: selectedOption.amount,
      payload: { kind: "tuition", periodMonth: selectedOption.periodMonth.slice(0, 7) }
    });
  }

  function handleProductTile(product: CajaProduct) {
    if (product.categorySlug === "tuition" || product.hasSizes || product.defaultAmount == null) {
      resetConfigurator(product);
      return;
    }

    addStagedItem({
      id: makeCartItemId(),
      label: product.name,
      amount: product.defaultAmount,
      payload: { kind: "product", productId: product.id }
    });
  }

  function addConfiguredProduct() {
    if (!selectedProduct) return;

    if (selectedProduct.categorySlug === "tuition") {
      addTuitionToCurrentCharge();
      return;
    }

    const resolvedAmount =
      selectedProduct.defaultAmount != null
        ? selectedProduct.defaultAmount
        : Number.parseFloat(manualAmount);
    if (!Number.isFinite(resolvedAmount) || resolvedAmount <= 0) {
      setPanelError("Captura un monto válido para este cargo especial.");
      return;
    }

    const detailParts: string[] = [];
    if (size) detailParts.push(`Talla ${size}`);
    if (goalkeeper) detailParts.push("Portero");

    addStagedItem({
      id: makeCartItemId(),
      label: selectedProduct.name,
      detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
      amount: Math.round(resolvedAmount * 100) / 100,
      payload: {
        kind: "product",
        productId: selectedProduct.id,
        amount: selectedProduct.defaultAmount == null ? resolvedAmount : undefined,
        size: size || null,
        goalkeeper
      }
    });
  }

  function removeStagedItem(id: string) {
    setPanelError(null);
    setStagedItems((prev) => prev.filter((item) => item.id !== id));
  }

  function clearCart() {
    setSelectedIds(new Set());
    setStagedItems([]);
    setPaymentPaidAt("");
    resetConfigurator(null);
  }

  function handleCheckoutSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPanelError(null);
    startCheckoutTransition(async () => {
      const formData = new FormData();
      formData.set("amount", paymentAmount);
      formData.set("method", paymentMethod);
      formData.set("operatorCampusId", operatorCampusId);
      if (paymentNotes.trim()) formData.set("notes", paymentNotes.trim());
      if (paymentPaidAt.trim()) formData.set("paidAt", paymentPaidAt.trim());
      if (splitMode) {
        formData.set("amount2", paymentAmount2);
        formData.set("method2", paymentMethod2);
      }
      formData.set("targetChargeIds", Array.from(selectedIds).join(","));
      formData.set("cartItems", JSON.stringify(stagedItems.map((item) => item.payload)));

      const result = await checkoutCajaCartAction(data.enrollmentId, formData);
      if (!result.ok) {
        setPanelError(errorMessage(result.error));
        return;
      }

      clearCart();
      onCheckoutSuccess(result);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4">
        <div>
          <PlayerProfileLink playerId={player.playerId} playerName={data.playerName} />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {data.campusName}{player.birthYear ? ` · ${player.birthYear}` : ""}
          </p>
          {player.teamName && (
            <p className="mt-0.5 text-xs text-slate-400">
              {player.teamName}{player.coachName ? ` · ${player.coachName}` : ""}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${data.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {data.balance > 0
              ? formatMoney(data.balance, data.currency)
              : data.balance < 0
              ? formatMoney(Math.abs(data.balance), data.currency)
              : "Al corriente"}
          </p>
          <p className="text-xs text-slate-400">
            {data.balance > 0 ? "Saldo pendiente" : data.balance < 0 ? "Crédito en cuenta" : "Al corriente"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.95fr)]">
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Cargos pendientes</p>
              <span className="text-xs text-slate-400">Agrega los que quieras cobrar en este turno</span>
            </div>
            {data.pendingCharges.length === 0 ? (
              <div className="px-4 py-4 text-sm text-emerald-700">
                {data.balance < 0
                  ? `Crédito disponible: ${formatMoney(Math.abs(data.balance), data.currency)}`
                  : "No hay cargos pendientes."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.pendingCharges.map((charge) => {
                  const isSelected = selectedIds.has(charge.id);
                  const isExpanded = expandedId === charge.id;
                  const isPartial = charge.pendingAmount < charge.amount;
                  const overdue = charge.dueDate && new Date(charge.dueDate) < new Date();
                  return (
                    <li key={charge.id} className={isSelected ? "bg-blue-50/70 dark:bg-blue-950/20" : ""}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleCharge(charge.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleCharge(charge.id);
                          }
                        }}
                        className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm"
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedId(isExpanded ? null : charge.id);
                          }}
                          className="shrink-0 text-slate-400 hover:text-slate-600"
                          aria-label={isExpanded ? "Ocultar detalle" : "Ver detalle"}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 dark:text-slate-200">{charge.description}</p>
                          <p className="text-xs text-slate-400">
                            {charge.periodMonth ? (
                              <span className="capitalize">{formatPeriodMonth(charge.periodMonth)}</span>
                            ) : (
                              charge.typeName
                            )}
                            {overdue && <span className="ml-2 text-rose-500">Vencido</span>}
                            {isPartial && <span className="ml-2 text-amber-500">Pago parcial</span>}
                          </p>
                        </div>
                        <span className={`shrink-0 font-semibold ${isSelected ? "text-portoBlue" : "text-rose-600"}`}>
                          {formatMoney(charge.pendingAmount, data.currency)}
                        </span>
                        <span
                          className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                            isSelected
                              ? "bg-portoBlue text-white hover:bg-portoDark"
                              : "border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-portoBlue hover:text-portoBlue"
                          }`}
                        >
                          {isSelected ? "En cobro" : "Tocar para agregar"}
                        </span>
                      </div>
                      {isExpanded && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 border-t border-slate-100 bg-slate-50 px-10 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                          <span>Tipo</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{charge.typeName}</span>
                          <span>Total</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(charge.amount, data.currency)}</span>
                          {isPartial && (
                            <>
                              <span>Ya pagado</span>
                              <span className="font-medium text-emerald-600">
                                {formatMoney(charge.amount - charge.pendingAmount, data.currency)}
                              </span>
                            </>
                          )}
                          <span>Pendiente</span>
                          <span className="font-medium text-rose-600">{formatMoney(charge.pendingAmount, data.currency)}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Mensualidad adelantada</p>
                <p className="text-xs text-emerald-700/80 dark:text-emerald-400">
                  Agrega el próximo mes al cobro actual con la tarifa automática.
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm dark:bg-slate-900 dark:text-emerald-300">
                Hasta 4 meses
              </span>
            </div>

            {availableTuitionOptions.length === 0 ? (
              <div className="rounded-lg border border-emerald-200/70 bg-white px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-slate-900 dark:text-emerald-300">
                No hay mensualidades adelantadas disponibles para agregar en este momento.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-end">
                <label className="space-y-1 text-sm">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Período</span>
                  <select
                    value={tuitionPeriod}
                    onChange={(e) => setTuitionPeriod(e.target.value)}
                    className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none dark:border-emerald-900/40 dark:bg-slate-900"
                  >
                    {availableTuitionOptions.map((option) => (
                      <option key={option.periodMonth} value={option.periodMonth.slice(0, 7)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-1 text-sm">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Monto</span>
                  <p className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 dark:border-emerald-900/40 dark:bg-slate-900 dark:text-slate-300">
                    {availableTuitionOptions.find((option) => option.periodMonth.slice(0, 7) === tuitionPeriod)?.amount != null
                      ? formatMoney(
                          availableTuitionOptions.find((option) => option.periodMonth.slice(0, 7) === tuitionPeriod)!.amount,
                          data.currency
                        )
                      : "Sin opciones"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addTuitionToCurrentCharge}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Agregar al cobro
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Menú POS</p>
                <p className="text-xs text-slate-400">Productos cerrados y cargos especiales con más espacio para configurar.</p>
              </div>
              {productsLoading && <span className="text-xs text-slate-400">Cargando productos…</span>}
            </div>
            {productsLoading ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
                Preparando catálogo…
              </div>
            ) : (
              <div className="space-y-6">
                {products.filter((category) => category.slug !== "tuition").map((category) => {
                  const style = CATEGORY_STYLES[category.slug] ?? DEFAULT_STYLE;
                  return (
                    <div key={category.slug}>
                      <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${style.header}`}>
                        {category.name}
                      </p>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                        {category.products.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => handleProductTile(product)}
                            className={`min-h-[112px] rounded-xl border px-4 py-4 text-left transition-all ${
                              selectedProduct?.id === product.id ? style.selected : style.tile
                            }`}
                          >
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{product.name}</p>
                            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                              {product.defaultAmount != null
                                ? formatMoney(product.defaultAmount, data.currency)
                                : "Cargo especial"}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedProduct && (
              <div className="mt-4 space-y-3 rounded-xl border border-portoBlue bg-blue-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">{selectedProduct.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {selectedProduct.categorySlug === "tuition"
                        ? "La mensualidad se crea hasta cobrar el carrito."
                        : selectedProduct.defaultAmount != null
                        ? "Precio bloqueado del catálogo."
                        : "Cargo especial con monto abierto."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => resetConfigurator(null)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cerrar
                  </button>
                </div>

                {selectedProduct.categorySlug !== "tuition" ? (
                  <>
                    {selectedProduct.hasSizes && (
                      <div className="space-y-3">
                        <div>
                          <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">Talla</p>
                          <div className="flex flex-wrap gap-1.5">
                            {SIZES.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => setSize(size === option ? "" : option)}
                                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  size === option
                                    ? "border-portoBlue bg-portoBlue text-white"
                                    : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                          {!size && (
                            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                              Selecciona una talla antes de agregar este uniforme al cobro actual.
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setGoalkeeper((value) => !value)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            goalkeeper
                              ? "border-violet-500 bg-violet-500 text-white"
                              : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          }`}
                        >
                          Portero {goalkeeper ? "✓" : ""}
                        </button>
                      </div>
                    )}

                    {selectedProduct.defaultAmount == null ? (
                      <label className="block space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={manualAmount}
                          onChange={(e) => setManualAmount(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
                        />
                      </label>
                    ) : (
                      <div className="space-y-1 text-sm">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
                        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {formatMoney(selectedProduct.defaultAmount, data.currency)}
                        </p>
                      </div>
                    )}
                  </>
                ) : null}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={addConfiguredProduct}
                    disabled={(selectedProduct.hasSizes && !size) || (selectedProduct.categorySlug === "tuition" && availableTuitionOptions.length === 0)}
                    className="flex-1 rounded-lg bg-portoBlue py-2.5 text-sm font-semibold text-white hover:bg-portoDark disabled:opacity-50"
                  >
                    Agregar al cobro
                  </button>
                  <button
                    type="button"
                    onClick={() => resetConfigurator(null)}
                    className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Cobro actual</p>
                <p className="text-xs text-slate-400">
                  {cartTotal > 0 ? "Todo se cobra en una sola salida." : "Vacío. Puedes cobrar todo sin armar una selección."}
                </p>
              </div>
              {(selectedIds.size > 0 || stagedItems.length > 0) && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  Limpiar
                </button>
              )}
            </div>
            {selectedIds.size === 0 && stagedItems.length === 0 ? (
              <div className="px-4 py-5 text-sm text-slate-400">
                Sin artículos en el cobro actual. Si continúas, se cobrará el saldo total pendiente.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedCharges.map((charge) => (
                  <li key={charge.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{charge.description}</p>
                      <p className="text-xs text-slate-400">
                        {charge.periodMonth ? formatPeriodMonth(charge.periodMonth) : charge.typeName}
                        {charge.dueDate ? ` | Vence ${(() => { const [y, m, d] = charge.dueDate!.split("-"); return `${d}/${m}/${y}`; })()}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {formatMoney(charge.pendingAmount, data.currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCharge(charge.id)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                ))}
                {stagedItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
                      {item.detail && <p className="text-xs text-slate-400">{item.detail}</p>}
                    </div>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {formatMoney(item.amount, data.currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeStagedItem(item.id)}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {cartTotal > 0 ? "Total del cobro actual" : "Saldo a cobrar"}
              </span>
              <span className="text-lg font-bold text-portoDark">
                {formatMoney(checkoutTotal, data.currency)}
              </span>
            </div>
          </div>

          <form
            onSubmit={handleCheckoutSubmit}
            className="space-y-4 rounded-xl border border-portoBlue bg-white p-5 dark:bg-slate-900"
          >
            <div>
              <p className="font-medium text-slate-800 dark:text-slate-200">
                {cartTotal > 0 ? "Cobro actual" : "Cobrar todo"}
              </p>
              <p className="text-xs text-slate-400">
                {cartTotal > 0
                  ? "Los cargos seleccionados se cobran primero y el excedente sigue FIFO."
                  : "Pago rápido del saldo pendiente completo."}
              </p>
            </div>

            {panelError && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{panelError}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Método</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
                >
                  <option value="cash">Efectivo</option>
                  <option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="stripe_360player">360Player</option>
                  <option value="other">Otro</option>
                </select>
              </label>
            </div>

            {allowedCampuses.length > 1 ? (
              <label className="block space-y-1 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">Campus que recibe</span>
                <select
                  value={operatorCampusId}
                  onChange={(e) => setOperatorCampusId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
                >
                  {allowedCampuses.map((campus) => (
                    <option key={campus.id} value={campus.id}>
                      {campus.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {isCrossCampus ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                El jugador pertenece a {data.campusName}, pero este cobro se registrara operativamente para {selectedOperatorCampus?.name ?? "otro campus"}.
              </div>
            ) : null}

            {!splitMode ? (
              <button
                type="button"
                onClick={() => setSplitMode(true)}
                className="text-xs text-portoBlue hover:underline"
              >
                + Dividir pago en dos métodos
              </button>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Segundo método de pago</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSplitMode(false);
                      setPaymentAmount2("");
                    }}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    × Cancelar división
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Monto 2</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={paymentAmount2}
                      onChange={(e) => setPaymentAmount2(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="font-medium text-slate-700 dark:text-slate-300">Método 2</span>
                    <select
                      value={paymentMethod2}
                      onChange={(e) => setPaymentMethod2(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
                    >
                      <option value="cash">Efectivo</option>
                      <option value="transfer">Transferencia</option>
                      <option value="card">Tarjeta</option>
                      <option value="stripe_360player">360Player</option>
                      <option value="other">Otro</option>
                    </select>
                  </label>
                </div>
              </div>
            )}

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
              <input
                type="text"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Referencia, comentario o aclaración"
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Fecha y hora real del pago (opcional)</span>
              <input
                type="datetime-local"
                value={paymentPaidAt}
                onChange={(e) => setPaymentPaidAt(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Si el pago se te quedo sin registrar, captura aqui la fecha y hora reales.
              </p>
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={!payableNow || isCheckoutPending}
                className="flex-1 rounded-lg bg-portoBlue py-2.5 text-sm font-semibold text-white hover:bg-portoDark disabled:opacity-50"
              >
                {isCheckoutPending ? "Procesando…" : cartTotal > 0 ? "Cobrar carrito" : "Cobrar todo"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const MONTH_NAMES_ES_CAJA = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function getDefaultNextMonthCaja() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptionsCaja() {
  const now = new Date();
  return [-1, 0, 1, 2].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return {
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES_ES_CAJA[d.getMonth()]} ${d.getFullYear()}`,
    };
  });
}

function EnrollmentPanel({
  player,
  data,
  paying,
  targetChargeIds,
  onPay,
  onAddCharge,
  onCancel,
  onSubmit,
  onDataUpdate,
  isPending,
  error
}: {
  player: CajaPlayerResult;
  data: CajaEnrollmentData;
  paying: boolean;
  targetChargeIds: string[];
  onPay: (p: CajaPlayerResult, d: CajaEnrollmentData, targetChargeIds: string[]) => void;
  onAddCharge: (p: CajaPlayerResult, d: CajaEnrollmentData) => void;
  onCancel: () => void;
  onSubmit: (player: CajaPlayerResult, enrollmentId: string, formData: FormData) => void;
  onDataUpdate: (updatedData: CajaEnrollmentData) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState(false);
  const [showTuitionForm, setShowTuitionForm] = useState(false);
  const [tuitionPeriod, setTuitionPeriod] = useState(
    data.advanceTuitionOptions[0]?.periodMonth.slice(0, 7) ?? getDefaultNextMonthCaja()
  );
  const [tuitionError, setTuitionError] = useState<string | null>(null);
  const [isTuitionPending, startTuitionTransition] = useTransition();

  useEffect(() => {
    const firstOption = data.advanceTuitionOptions[0]?.periodMonth.slice(0, 7);
    if (!firstOption) return;
    const hasCurrentOption = data.advanceTuitionOptions.some(
      (option) => option.periodMonth.slice(0, 7) === tuitionPeriod
    );
    if (!hasCurrentOption) {
      setTuitionPeriod(firstOption);
    }
  }, [data.advanceTuitionOptions, tuitionPeriod]);

  function handleTuitionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tuitionPeriod) return;
    setTuitionError(null);
    startTuitionTransition(async () => {
      const result: CajaAdvanceTuitionResult = await createAdvanceTuitionAction(data.enrollmentId, tuitionPeriod);
      if (!result.ok) {
        const msgs: Record<string, string> = {
          duplicate_period: "Ya existe un cargo de mensualidad para ese período.",
          enrollment_inactive: "La inscripción no está activa.",
          charge_type_not_found: "Error de configuración: tipo de cargo no encontrado.",
          tuition_rate_not_found: "No se pudo determinar la tarifa de mensualidad.",
          prior_month_arrears: "El alumno tiene mensualidades anteriores sin pagar. No se puede cobrar por adelantado.",
        };
        setTuitionError(msgs[result.error] ?? "Error al crear el cargo. Intenta de nuevo.");
        return;
      }
      setShowTuitionForm(false);
      setTuitionPeriod(result.updatedData.advanceTuitionOptions[0]?.periodMonth.slice(0, 7) ?? getDefaultNextMonthCaja());
      onDataUpdate(result.updatedData);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.add(result.newChargeId);
        return next;
      });
    });
  }

  const targetSet = new Set(targetChargeIds);
  const targetCharges = data.pendingCharges.filter((c) => targetSet.has(c.id));

  const selectedCharges = data.pendingCharges.filter((c) => selectedIds.has(c.id));
  const selectedTotal = selectedCharges.reduce((sum, c) => sum + c.pendingAmount, 0);

  const defaultAmount = targetChargeIds.length > 0
    ? targetCharges.reduce((sum, c) => sum + c.pendingAmount, 0).toFixed(2)
    : data.balance > 0
    ? data.balance.toFixed(2)
    : "";

  function toggleCharge(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-4">
      {/* Player header */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4">
        <div>
          <PlayerProfileLink playerId={player.playerId} playerName={data.playerName} />
          <p className="text-sm text-slate-500 dark:text-slate-400">{data.campusName}{player.birthYear ? ` · ${player.birthYear}` : ""}</p>
          {player.teamName && (
            <p className="text-xs text-slate-400 mt-0.5">
              {player.teamName}{player.coachName ? ` · ${player.coachName}` : ""}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${data.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {data.balance > 0
              ? formatMoney(data.balance, data.currency)
              : data.balance < 0
              ? formatMoney(Math.abs(data.balance), data.currency)
              : "Al corriente"}
          </p>
          <p className="text-xs text-slate-400">
            {data.balance > 0 ? "Saldo pendiente" : data.balance < 0 ? "Crédito en cuenta" : "Al corriente"}
          </p>
        </div>
      </div>

      {/* Pending charges */}
      {data.pendingCharges.length > 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300">
            Cargos pendientes
            {!paying && data.pendingCharges.length > 1 && (
              <span className="ml-2 text-xs font-normal text-slate-400">Selecciona los que deseas pagar</span>
            )}
          </p>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.pendingCharges.map((c) => {
              const isSelected = selectedIds.has(c.id);
              const isExpanded = expandedId === c.id;
              const isPartial = c.pendingAmount < c.amount;
              const today = new Date();
              const overdue = c.dueDate && new Date(c.dueDate) < today;
              return (
                <li key={c.id} className={`text-sm transition-colors ${!paying && isSelected ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}>
                  {/* Main row */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                      className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                      aria-label={isExpanded ? "Colapsar detalle" : "Ver detalle"}
                    >
                      {isExpanded ? "▾" : "▸"}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{c.description}</p>
                      <p className="text-xs text-slate-400">
                        {c.periodMonth ? <span className="capitalize">{formatPeriodMonth(c.periodMonth)}</span> : c.typeName}
                        {overdue && <span className="ml-2 text-rose-500">Vencido</span>}
                        {isPartial && <span className="ml-2 text-amber-500">Pago parcial</span>}
                      </p>
                    </div>
                    <span className={`shrink-0 font-semibold ${isSelected && !paying ? "text-portoBlue" : "text-rose-600"}`}>
                      {formatMoney(c.pendingAmount, data.currency)}
                    </span>
                    {!paying && (
                      <button
                        type="button"
                        onClick={() => toggleCharge(c.id)}
                        className={`shrink-0 rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                          isSelected
                            ? "bg-portoBlue text-white hover:bg-portoDark"
                            : "border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-portoBlue hover:text-portoBlue"
                        }`}
                      >
                        {isSelected ? "✓ Agregado" : "Agregar"}
                      </button>
                    )}
                  </div>
                  {/* Expandable detail strip */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-10 py-2 text-xs text-slate-500 dark:text-slate-400 grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <span>Tipo</span><span className="font-medium text-slate-700 dark:text-slate-300">{c.typeName}</span>
                      <span>Cargo total</span><span className="font-medium text-slate-700 dark:text-slate-300">{formatMoney(c.amount, data.currency)}</span>
                      {isPartial && <><span>Ya pagado</span><span className="font-medium text-emerald-600">{formatMoney(c.amount - c.pendingAmount, data.currency)}</span></>}
                      <span>Pendiente</span><span className="font-medium text-rose-600">{formatMoney(c.pendingAmount, data.currency)}</span>
                      {c.dueDate && <><span>Vencimiento</span><span className={`font-medium ${overdue ? "text-rose-500" : "text-slate-700 dark:text-slate-300"}`}>{(() => { const [y,m,d] = c.dueDate!.split("-"); return `${d}/${m}/${y}`; })()}</span></>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {data.balance < 0
            ? `Crédito disponible: ${formatMoney(Math.abs(data.balance), data.currency)}. Se aplicará al siguiente cargo.`
            : "No hay cargos pendientes. ✓"}
        </div>
      )}

      {/* Advance tuition inline form */}
      {showTuitionForm && !paying && (
        <form
          onSubmit={handleTuitionSubmit}
          className="rounded-xl border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Mensualidad adelantada</p>
          {tuitionError && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{tuitionError}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Período</span>
              <select
                value={tuitionPeriod}
                onChange={(e) => setTuitionPeriod(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm bg-white dark:bg-slate-800 focus:border-emerald-500 focus:outline-none"
              >
                {data.advanceTuitionOptions.map((opt) => (
                  <option key={opt.periodMonth} value={opt.periodMonth.slice(0, 7)}>{opt.label}</option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-sm">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Monto</span>
              <p className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                {data.advanceTuitionOptions.find((option) => option.periodMonth.slice(0, 7) === tuitionPeriod)?.amount != null
                  ? formatMoney(
                      data.advanceTuitionOptions.find((option) => option.periodMonth.slice(0, 7) === tuitionPeriod)!.amount,
                      data.currency
                    )
                  : "—"}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Incluye descuento anticipado</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isTuitionPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {isTuitionPending ? "Creando…" : "Crear cargo"}
            </button>
            <button
              type="button"
              onClick={() => { setShowTuitionForm(false); setTuitionError(null); }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Payment form */}
      {paying ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(player, data.enrollmentId, new FormData(e.currentTarget));
          }}
          className="space-y-4 rounded-xl border border-portoBlue bg-white dark:bg-slate-900 p-5"
        >
          <p className="font-medium text-slate-800 dark:text-slate-200">Registrar pago</p>

          {/* Targeted charges banner */}
          {targetCharges.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm space-y-1">
              <p className="font-semibold text-amber-800">
                {targetCharges.length === 1 ? "Pagando cargo específico:" : `Pagando ${targetCharges.length} cargos específicos:`}
              </p>
              {targetCharges.map((c) => (
                <div key={c.id} className="flex justify-between text-amber-700">
                  <span>{c.description}</span>
                  <span className="font-medium">{formatMoney(c.pendingAmount, data.currency)}</span>
                </div>
              ))}
            </div>
          )}

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          {targetChargeIds.length > 0 && (
            <input type="hidden" name="targetChargeIds" value={targetChargeIds.join(",")} />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                required
                defaultValue={defaultAmount}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Método</span>
              <select name="method" required className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none">
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta</option>
                <option value="stripe_360player">360Player</option>
                <option value="other">Otro</option>
              </select>
            </label>
          </div>

          {/* Split payment toggle + second row */}
          {!splitMode ? (
            <button
              type="button"
              onClick={() => setSplitMode(true)}
              className="text-xs text-portoBlue hover:underline"
            >
              + Dividir pago en dos métodos
            </button>
          ) : (
            <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Segundo método de pago</span>
                <button
                  type="button"
                  onClick={() => setSplitMode(false)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  × Cancelar división
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Monto 2</span>
                  <input
                    type="number"
                    name="amount2"
                    step="0.01"
                    min="0.01"
                    required
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Método 2</span>
                  <select name="method2" required className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none">
                    <option value="cash">Efectivo</option>
                    <option value="transfer">Transferencia</option>
                    <option value="card">Tarjeta</option>
                    <option value="stripe_360player">360Player</option>
                    <option value="other">Otro</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
            <input
              type="text"
              name="notes"
              placeholder="Referencia, folio, etc."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Fecha y hora real del pago (opcional)</span>
            <input
              type="datetime-local"
              name="paidAt"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">Dejalo vacio para usar la hora actual.</p>
          </label>

          <p className="text-xs text-slate-400">
            {targetCharges.length > 0
              ? "Los cargos seleccionados se pagan primero. El excedente se aplica a los demás por antigüedad. Días 1–10 aplica descuento anticipado."
              : "Los cargos se cubren del más antiguo al más reciente. Días 1–10 aplica descuento de pago anticipado."}
          </p>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-portoBlue py-2.5 text-sm font-semibold text-white hover:bg-portoDark disabled:opacity-50"
            >
              {isPending ? "Registrando…" : "Cobrar"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : selectedIds.size > 0 ? (
        /* Selection action bar */
        <div className="flex items-center gap-3 rounded-xl border border-portoBlue bg-blue-50 px-4 py-3">
          <div className="flex-1 text-sm">
            <span className="font-semibold text-portoBlue">
              {selectedIds.size} {selectedIds.size === 1 ? "cargo" : "cargos"} seleccionado{selectedIds.size !== 1 ? "s" : ""}
            </span>
            <span className="ml-2 font-bold text-slate-800 dark:text-slate-200">{formatMoney(selectedTotal, data.currency)}</span>
          </div>
          <button
            onClick={() => { setShowTuitionForm((v) => !v); setTuitionError(null); }}
            disabled={isPending}
            className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 disabled:opacity-50"
          >
            + Mensualidad
          </button>
          <button
            onClick={() => onPay(player, data, Array.from(selectedIds))}
            className="rounded-lg bg-portoBlue px-4 py-2 text-sm font-semibold text-white hover:bg-portoDark"
          >
            Cobrar selección
          </button>
          <button
            onClick={clearSelection}
            className="rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-white"
          >
            Limpiar
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => onPay(player, data, [])}
            className="flex-1 rounded-xl bg-portoBlue py-3 text-sm font-semibold text-white hover:bg-portoDark"
          >
            Cobrar todo
          </button>
          <button
            onClick={() => { setShowTuitionForm((v) => !v); setTuitionError(null); }}
            disabled={isPending}
            className="rounded-xl border border-emerald-300 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 disabled:opacity-50"
          >
            + Mensualidad
          </button>
          <button
            onClick={() => onAddCharge(player, data)}
            disabled={isPending}
            className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            + Cargo
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ── Receipt panel ─────────────────────────────────────────────────────────────

function ReceiptPanel({
  receipt,
  printerName,
  onDone,
  onBack
}: {
  receipt: Extract<CajaPaymentResult, { ok: true }>;
  printerName: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const receiptData: ReceiptData = {
    playerName: receipt.playerName,
    campusName: receipt.campusName,
    birthYear: receipt.birthYear,
    method: methodLabel(receipt.method),
    amount: receipt.amount,
    currency: receipt.currency,
    remainingBalance: receipt.remainingBalance,
    chargesPaid: receipt.chargesPaid,
    paymentId: receipt.paymentId,
    folio: receipt.folio,
    date: receipt.date,
    time: receipt.time,
    splitPayment: receipt.splitPayment
      ? { amount: receipt.splitPayment.amount, method: methodLabel(receipt.splitPayment.method) }
      : undefined,
  };
  const shouldAutoPrint =
    receipt.method !== "stripe_360player" &&
    receipt.splitPayment?.method !== "stripe_360player";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-center">
        <p className="text-lg font-semibold text-emerald-700">Pago registrado</p>
        <p className="text-2xl font-bold text-emerald-800 mt-1">{formatMoney(receipt.amount, receipt.currency)}</p>
        <p className="text-sm text-emerald-600 mt-1">{receipt.playerName} · {methodLabel(receipt.method)}</p>
        {receipt.remainingBalance > 0 && (
          <p className="mt-2 text-sm text-rose-600">Saldo restante: {formatMoney(receipt.remainingBalance, receipt.currency)}</p>
        )}
        {receipt.remainingBalance === 0 && (
          <p className="mt-2 text-sm text-emerald-600">Cuenta al corriente ✓</p>
        )}
        {receipt.remainingBalance < 0 && (
          <p className="mt-2 text-sm text-emerald-600">Crédito en cuenta: {formatMoney(Math.abs(receipt.remainingBalance), receipt.currency)} ✓</p>
        )}
      </div>

      {false && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          ⚠ Sin sesión de caja abierta. El pago se registró correctamente pero no está vinculado a ninguna sesión.{" "}
          <a href="/caja/sesion" className="font-medium underline hover:no-underline">Abrir sesión</a>
        </div>
      )}

      {!shouldAutoPrint && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
          Pago registrado como <span className="font-medium">360Player</span>. El recibo no se imprimio automaticamente, pero queda guardado y disponible en <a href="/receipts" className="font-medium underline hover:no-underline">Recibos</a>.
        </div>
      )}

      <div className="flex gap-3">
        <PrintReceiptButton data={receiptData} printerName={printerName} autoPrint={shouldAutoPrint} />
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-portoBlue py-2.5 text-sm font-semibold text-portoBlue hover:bg-blue-50"
        >
          Regresar a alumno
        </button>
        <button
          onClick={onDone}
          className="flex-1 rounded-xl bg-portoBlue py-2.5 text-sm font-semibold text-white hover:bg-portoDark"
        >
          Siguiente alumno
        </button>
      </div>
    </div>
  );
}

// ── Product grid panel ────────────────────────────────────────────────────────

const SIZES = ["XCH JR", "CH JR", "M JR", "G JR", "XL JR", "CH", "M", "G", "XL"];

const CATEGORY_STYLES: Record<string, { tile: string; selected: string; header: string }> = {
  uniforms:    { tile: "border-sky-200 bg-sky-50 hover:bg-sky-100",       selected: "border-sky-500 bg-sky-100 ring-2 ring-sky-500",       header: "text-sky-700" },
  tournaments: { tile: "border-amber-200 bg-amber-50 hover:bg-amber-100", selected: "border-amber-500 bg-amber-100 ring-2 ring-amber-500", header: "text-amber-700" },
  tuition:     { tile: "border-emerald-200 bg-emerald-50 hover:bg-emerald-100", selected: "border-emerald-500 bg-emerald-100 ring-2 ring-emerald-500", header: "text-emerald-700" }
};
const DEFAULT_STYLE = { tile: "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700", selected: "border-portoBlue bg-blue-50 ring-2 ring-portoBlue", header: "text-slate-600 dark:text-slate-400" };

function ProductGridPanel({
  player,
  data,
  products,
  onCancel,
  onSubmit,
  isPending,
  error
}: {
  player: CajaPlayerResult;
  data: CajaEnrollmentData;
  products: CajaProductCategory[];
  onCancel: () => void;
  onSubmit: (player: CajaPlayerResult, enrollmentId: string, formData: FormData) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [selected, setSelected] = useState<CajaProduct | null>(null);
  const [amount, setAmount] = useState("");
  const [size, setSize] = useState("");
  const [goalkeeper, setGoalkeeper] = useState(false);

  function handleSelectProduct(product: CajaProduct) {
    setSelected(product);
    setAmount(product.defaultAmount != null ? product.defaultAmount.toFixed(2) : "");
    setSize("");
    setGoalkeeper(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const fd = new FormData();
    fd.set("productId", selected.id);
    fd.set("amount", amount);
    if (size) fd.set("size", size);
    if (goalkeeper) fd.set("goalkeeper", "1");
    onSubmit(player, data.enrollmentId, fd);
  }

  return (
    <div className="space-y-4">
      {/* Player header */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4">
        <div>
          <PlayerProfileLink playerId={player.playerId} playerName={data.playerName} />
          <p className="text-sm text-slate-500 dark:text-slate-400">{data.campusName}{player.birthYear ? ` · ${player.birthYear}` : ""}</p>
          {player.teamName && (
            <p className="text-xs text-slate-400 mt-0.5">
              {player.teamName}{player.coachName ? ` · ${player.coachName}` : ""}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-400">Nuevo cargo</p>
      </div>

      {/* Product grid */}
      <div className="space-y-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {products.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay productos disponibles.</p>
        ) : (
          products.map((category) => {
            const style = CATEGORY_STYLES[category.slug] ?? DEFAULT_STYLE;
            return (
              <div key={category.slug}>
                <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${style.header}`}>
                  {category.name}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {category.products.map((product) => {
                    const isSelected = selected?.id === product.id;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleSelectProduct(product)}
                        className={`rounded-xl border p-4 text-left transition-all ${isSelected ? style.selected : style.tile}`}
                      >
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{product.name}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          {product.defaultAmount != null
                            ? formatMoney(product.defaultAmount, data.currency)
                            : "Precio libre"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* Confirmation form — shown when a product is selected */}
        {selected && (
          <form
            onSubmit={handleSubmit}
            className="mt-2 space-y-3 rounded-xl border border-portoBlue bg-blue-50 p-4"
          >
            <p className="font-semibold text-slate-800 dark:text-slate-200">{selected.name}</p>

            {selected.hasSizes && (
              <div className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">Talla</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SIZES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSize(size === s ? "" : s)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                          size === s
                            ? "border-portoBlue bg-portoBlue text-white"
                            : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setGoalkeeper((g) => !g)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    goalkeeper
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  Portero {goalkeeper ? "✓" : ""}
                </button>
              </div>
            )}

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Monto</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
              />
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-lg bg-portoBlue py-2.5 text-sm font-semibold text-white hover:bg-portoDark disabled:opacity-50"
              >
                {isPending ? "Guardando…" : "Crear cargo"}
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>

      <button
        onClick={onCancel}
        className="w-full rounded-xl border border-slate-300 dark:border-slate-600 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        Volver
      </button>
    </div>
  );
}

// ── Error messages ────────────────────────────────────────────────────────────

function errorMessage(code: string): string {
  const messages: Record<string, string> = {
    invalid_form: "Formulario inválido. Verifica el monto y el método.",
    unauthenticated: "Sesión expirada. Por favor inicia sesión de nuevo.",
    enrollment_not_found: "No se encontró la inscripción.",
    enrollment_inactive: "Esta inscripción está inactiva.",
    payment_insert_failed: "Error al registrar el pago. Intenta de nuevo.",
    allocation_insert_failed: "Error al aplicar el pago. Verifica con el administrador.",
    product_not_found: "Producto no encontrado o inactivo.",
    charge_insert_failed: "Error al crear el cargo del carrito. Intenta de nuevo.",
    reload_failed: "Se cobro, pero no se pudo refrescar la vista. Busca al alumno de nuevo.",
    duplicate_period: "Ya existe una mensualidad para ese periodo.",
    tuition_rate_not_found: "No se pudo determinar la tarifa de mensualidad.",
    prior_month_arrears: "El alumno tiene mensualidades anteriores sin pagar.",
    charge_type_not_found: "Error de configuracion: tipo de cargo no encontrado."
  };
  return messages[code] ?? "Error desconocido. Intenta de nuevo.";
}

function chargeErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    invalid_form: "Verifica el producto y el monto del cargo.",
    unauthenticated: "Sesión expirada. Por favor inicia sesión de nuevo.",
    product_not_found: "Producto no encontrado o inactivo.",
    enrollment_not_found: "No se encontró la inscripción.",
    enrollment_inactive: "Esta inscripción está inactiva.",
    charge_insert_failed: "Error al crear el cargo. Intenta de nuevo.",
    reload_failed: "Cargo creado pero no se pudo recargar. Busca al alumno de nuevo."
  };
  return messages[code] ?? "Error desconocido. Intenta de nuevo.";
}



