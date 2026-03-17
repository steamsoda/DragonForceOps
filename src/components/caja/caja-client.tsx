"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  searchPlayersForCajaAction,
  getEnrollmentForCajaAction,
  postCajaPaymentAction,
  getProductsForCajaAction,
  postCajaChargeAction,
  getCajaDrilldownMetaAction,
  listCajaPlayersByCampusYearAction,
  type CajaPlayerResult,
  type CajaEnrollmentData,
  type CajaPaymentResult,
  type CajaProduct,
  type CajaProductCategory,
  type CajaDrilldownMeta
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
    stripe_360player: "Stripe 360Player",
    other: "Otro"
  };
  return labels[method] ?? method;
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

export function CajaClient() {
  const [view, setView] = useState<View>({ tag: "idle" });
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const [drilldown, setDrilldown] = useState<DrilldownStep>({ step: "closed" });
  const [preloadedMeta, setPreloadedMeta] = useState<CajaDrilldownMeta | null>(null);

  // Preload drill-down meta in background so "Seleccionar por categoría" is instant
  useEffect(() => {
    getCajaDrilldownMetaAction().then(setPreloadedMeta);
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
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
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

      {/* Loading enrollment */}
      {view.tag === "loading-enrollment" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Cargando información de {view.player.playerName}…
        </div>
      )}

      {/* Loading products */}
      {view.tag === "loading-products" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Cargando productos…
        </div>
      )}

      {/* Enrollment panel */}
      {(view.tag === "enrollment" || view.tag === "paying") && (
        <EnrollmentPanel
          player={view.player}
          data={view.data}
          paying={view.tag === "paying"}
          targetChargeIds={view.tag === "paying" ? view.targetChargeIds : []}
          onPay={goToPayment}
          onAddCharge={goToAddCharge}
          onCancel={
            view.tag === "paying"
              ? () => setView({ tag: "enrollment", player: view.player, data: view.data })
              : reset
          }
          onSubmit={handlePaymentSubmit}
          isPending={isPending}
          error={error}
        />
      )}

      {/* Product grid panel */}
      {view.tag === "adding-charge" && (
        <ProductGridPanel
          player={view.player}
          data={view.data}
          products={view.products}
          onCancel={() => setView({ tag: "enrollment", player: view.player, data: view.data })}
          onSubmit={handleChargeSubmit}
          isPending={isPending}
          error={error}
        />
      )}

      {/* Success / receipt */}
      {view.tag === "success" && (
        <ReceiptPanel
          receipt={view.receipt}
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

function EnrollmentPanel({
  player,
  data,
  paying,
  targetChargeIds,
  onPay,
  onAddCharge,
  onCancel,
  onSubmit,
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
  isPending: boolean;
  error: string | null;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          <p className="text-lg font-semibold text-portoDark">{data.playerName}</p>
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
                      {c.dueDate && <><span>Vencimiento</span><span className={`font-medium ${overdue ? "text-rose-500" : "text-slate-700 dark:text-slate-300"}`}>{c.dueDate}</span></>}
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
                <option value="other">Otro</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
            <input
              type="text"
              name="notes"
              placeholder="Referencia, folio, etc."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 focus:border-portoBlue focus:outline-none"
            />
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
  onDone,
  onBack
}: {
  receipt: Extract<CajaPaymentResult, { ok: true }>;
  onDone: () => void;
  onBack: () => void;
}) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  const shortId = receipt.paymentId.slice(-8).toUpperCase();

  return (
    <>
      {/* Screen view */}
      <div className="print:hidden space-y-4">
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
        {receipt.sessionWarning && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            ⚠ Sin sesión de caja abierta. El pago se registró correctamente pero no está vinculado a ninguna sesión.{" "}
            <a href="/caja/sesion" className="font-medium underline hover:no-underline">Abrir sesión</a>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Imprimir recibo
          </button>
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

      {/* Print-only receipt — styled for 80mm thermal paper, two copies */}
      <div className="hidden print:block w-[72mm] font-mono text-[11px] leading-snug">
        {[{ label: "COPIA CLIENTE" }, { label: "COPIA ACADEMIA" }].map(({ label }, idx) => (
          <div key={idx}>
            {idx > 0 && (
              <div className="my-3 flex items-center gap-1 text-[9px] text-black">
                <span className="flex-1 border-t border-dashed border-black" />
                <span>✂</span>
                <span className="flex-1 border-t border-dashed border-black" />
              </div>
            )}

            <div className="text-center mb-2">
              <p className="font-bold text-[13px]">INVICTA · Dragon Force Porto</p>
              <p className="text-[10px]">FC Porto Dragon Force · Monterrey</p>
              <p className="text-[10px]">{receipt.campusName}</p>
            </div>

            <div className="border-t border-dashed border-black my-1.5" />

            <div className="space-y-0.5">
              <p><span className="font-bold">Alumno:</span> {receipt.playerName}</p>
              <p><span className="font-bold">Fecha:</span> {dateStr}</p>
              <p><span className="font-bold">Hora:</span> {timeStr}</p>
              <p><span className="font-bold">Método:</span> {methodLabel(receipt.method)}</p>
              <p><span className="font-bold">Folio:</span> {shortId}</p>
            </div>

            <div className="border-t border-dashed border-black my-1.5" />

            {/* Line items */}
            {receipt.chargesPaid.length > 0 && (
              <div className="space-y-0.5 mb-1.5">
                {receipt.chargesPaid.map((c, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="mr-2 truncate max-w-[44mm]">{c.description}</span>
                    <span className="shrink-0">{formatMoney(c.amount, receipt.currency)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-black my-1" />
            <div className="flex justify-between font-bold text-[12px]">
              <span>TOTAL PAGADO</span>
              <span>{formatMoney(receipt.amount, receipt.currency)}</span>
            </div>

            {receipt.remainingBalance > 0 && (
              <div className="flex justify-between mt-0.5 text-[10px]">
                <span>Saldo pendiente</span>
                <span>{formatMoney(receipt.remainingBalance, receipt.currency)}</span>
              </div>
            )}
            {receipt.remainingBalance <= 0 && (
              <p className="mt-0.5 text-center text-[10px]">Cuenta al corriente ✓</p>
            )}

            <div className="border-t border-dashed border-black my-1.5" />
            <p className="text-center text-[10px]">Gracias por su pago</p>
            <p className="text-center text-[9px] mt-0.5 text-black/60">{label}</p>
          </div>
        ))}
      </div>
    </>
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
          <p className="text-lg font-semibold text-portoDark">{data.playerName}</p>
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
    allocation_insert_failed: "Error al aplicar el pago. Verifica con el administrador."
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
