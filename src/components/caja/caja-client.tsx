"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  searchPlayersForCajaAction,
  getEnrollmentForCajaAction,
  postCajaPaymentAction,
  getAdHocChargeTypesAction,
  postCajaChargeAction,
  type CajaPlayerResult,
  type CajaEnrollmentData,
  type CajaPaymentResult,
  type CajaChargeTypeOption
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

type View =
  | { tag: "idle" }
  | { tag: "searching"; query: string }
  | { tag: "results"; query: string; results: CajaPlayerResult[] }
  | { tag: "loading-enrollment"; player: CajaPlayerResult }
  | { tag: "enrollment"; player: CajaPlayerResult; data: CajaEnrollmentData }
  | { tag: "paying"; player: CajaPlayerResult; data: CajaEnrollmentData }
  | { tag: "loading-charge-types"; player: CajaPlayerResult; data: CajaEnrollmentData }
  | { tag: "adding-charge"; player: CajaPlayerResult; data: CajaEnrollmentData; chargeTypes: CajaChargeTypeOption[] }
  | { tag: "success"; receipt: Extract<CajaPaymentResult, { ok: true }> };

// ── Main component ─────────────────────────────────────────────────────────────

export function CajaClient() {
  const [view, setView] = useState<View>({ tag: "idle" });
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

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

  function goToPayment(player: CajaPlayerResult, data: CajaEnrollmentData) {
    setView({ tag: "paying", player, data });
  }

  function reset() {
    setView({ tag: "idle" });
    setQuery("");
    setError(null);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  async function handlePaymentSubmit(enrollmentId: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await postCajaPaymentAction(enrollmentId, formData);
      if (!result.ok) {
        setError(errorMessage(result.error));
        return;
      }
      setView({ tag: "success", receipt: result });
    });
  }

  function goToAddCharge(player: CajaPlayerResult, data: CajaEnrollmentData) {
    setError(null);
    setView({ tag: "loading-charge-types", player, data });
    startTransition(async () => {
      const chargeTypes = await getAdHocChargeTypesAction();
      setView({ tag: "adding-charge", player, data, chargeTypes });
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* Search box — always visible unless in a later state */}
      {(view.tag === "idle" || view.tag === "searching" || view.tag === "results") && (
        <SearchPanel
          query={query}
          setQuery={setQuery}
          view={view}
          onSelect={selectPlayer}
          isPending={isPending}
          inputRef={searchRef}
        />
      )}

      {/* Loading enrollment */}
      {view.tag === "loading-enrollment" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Cargando información de {view.player.playerName}…
        </div>
      )}

      {/* Loading charge types */}
      {view.tag === "loading-charge-types" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Cargando tipos de cargo…
        </div>
      )}

      {/* Enrollment panel */}
      {(view.tag === "enrollment" || view.tag === "paying") && (
        <EnrollmentPanel
          player={view.player}
          data={view.data}
          paying={view.tag === "paying"}
          onPay={goToPayment}
          onAddCharge={goToAddCharge}
          onCancel={reset}
          onSubmit={handlePaymentSubmit}
          isPending={isPending}
          error={error}
        />
      )}

      {/* Add charge panel */}
      {view.tag === "adding-charge" && (
        <AddChargePanel
          player={view.player}
          data={view.data}
          chargeTypes={view.chargeTypes}
          onCancel={() => setView({ tag: "enrollment", player: view.player, data: view.data })}
          onSubmit={handleChargeSubmit}
          isPending={isPending}
          error={error}
        />
      )}

      {/* Success / receipt */}
      {view.tag === "success" && <ReceiptPanel receipt={view.receipt} onDone={reset} />}

      {/* Generic error */}
      {error && view.tag === "idle" && (
        <p className="rounded-md bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
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
      <label className="mb-2 block text-sm font-medium text-slate-700">Buscar alumno</label>
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Escribe el nombre del alumno…"
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base shadow-sm focus:border-portoBlue focus:outline-none focus:ring-1 focus:ring-portoBlue"
      />
      {isPending && view.tag === "searching" && (
        <p className="mt-1 text-xs text-slate-400">Buscando…</p>
      )}
      {view.tag === "results" && (
        <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
          {view.results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">Sin resultados para &ldquo;{view.query}&rdquo;</p>
          ) : (
            <ul>
              {view.results.map((p) => (
                <li key={p.playerId}>
                  <button
                    onClick={() => onSelect(p)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-slate-50"
                  >
                    <div>
                      <span className="font-medium text-slate-800">{p.playerName}</span>
                      <span className="ml-2 text-slate-400 text-xs">{p.campusName}{p.birthYear ? ` · ${p.birthYear}` : ""}</span>
                    </div>
                    <span className={`text-xs font-semibold ${p.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {p.balance > 0 ? formatMoney(p.balance, "MXN") : "Al corriente"}
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
  onPay: (p: CajaPlayerResult, d: CajaEnrollmentData) => void;
  onAddCharge: (p: CajaPlayerResult, d: CajaEnrollmentData) => void;
  onCancel: () => void;
  onSubmit: (enrollmentId: string, formData: FormData) => Promise<void>;
  isPending: boolean;
  error: string | null;
}) {
  const defaultAmount = data.balance > 0 ? data.balance.toFixed(2) : "";

  return (
    <div className="space-y-4">
      {/* Player header */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-lg font-semibold text-portoDark">{data.playerName}</p>
          <p className="text-sm text-slate-500">{data.campusName}</p>
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${data.balance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {data.balance > 0 ? formatMoney(data.balance, data.currency) : "Al corriente"}
          </p>
          <p className="text-xs text-slate-400">Saldo pendiente</p>
        </div>
      </div>

      {/* Pending charges */}
      {data.pendingCharges.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-medium text-slate-700">Cargos pendientes</p>
          <ul className="divide-y divide-slate-100">
            {data.pendingCharges.map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{c.description}</p>
                  {c.periodMonth && <p className="text-xs text-slate-400 capitalize">{formatPeriodMonth(c.periodMonth)}</p>}
                </div>
                <span className="font-semibold text-rose-600">{formatMoney(c.pendingAmount, data.currency)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          No hay cargos pendientes. Un pago generará crédito en la cuenta.
        </div>
      )}

      {/* Payment form */}
      {paying ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(data.enrollmentId, new FormData(e.currentTarget));
          }}
          className="space-y-4 rounded-xl border border-portoBlue bg-white p-5"
        >
          <p className="font-medium text-slate-800">Registrar pago</p>

          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Monto</span>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                required
                defaultValue={defaultAmount}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-portoBlue focus:outline-none"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700">Método</span>
              <select name="method" required className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-portoBlue focus:outline-none">
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="card">Tarjeta</option>
                <option value="other">Otro</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">Notas (opcional)</span>
            <input
              type="text"
              name="notes"
              placeholder="Referencia, folio, etc."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-portoBlue focus:outline-none"
            />
          </label>

          <p className="text-xs text-slate-400">
            Los cargos se cubren del más antiguo al más reciente. Si pagas días 1–10 del mes, se aplica descuento pago anticipado automáticamente.
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
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={() => onPay(player, data)}
            className="flex-1 rounded-xl bg-portoBlue py-3 text-sm font-semibold text-white hover:bg-portoDark"
          >
            Cobrar
          </button>
          <button
            onClick={() => onAddCharge(player, data)}
            disabled={isPending}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            + Cargo
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700 hover:bg-slate-50"
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
  onDone
}: {
  receipt: Extract<CajaPaymentResult, { ok: true }>;
  onDone: () => void;
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
          {receipt.remainingBalance <= 0 && (
            <p className="mt-2 text-sm text-emerald-600">Cuenta al corriente ✓</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-xl border border-slate-300 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Imprimir recibo
          </button>
          <button
            onClick={onDone}
            className="flex-1 rounded-xl bg-portoBlue py-2.5 text-sm font-semibold text-white hover:bg-portoDark"
          >
            Siguiente alumno
          </button>
        </div>
      </div>

      {/* Print-only receipt — styled for 80mm thermal paper */}
      <div className="hidden print:block w-[72mm] font-mono text-[11px] leading-snug">
        <div className="text-center mb-3">
          <p className="font-bold text-[13px]">Dragon Force Porto</p>
          <p className="text-[10px]">FC Porto Dragon Force · Monterrey</p>
          <p className="text-[10px]">{receipt.campusName}</p>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        <div className="space-y-0.5">
          <p><span className="font-bold">Alumno:</span> {receipt.playerName}</p>
          <p><span className="font-bold">Fecha:</span> {dateStr}</p>
          <p><span className="font-bold">Hora:</span> {timeStr}</p>
          <p><span className="font-bold">Método:</span> {methodLabel(receipt.method)}</p>
          <p><span className="font-bold">Folio:</span> {shortId}</p>
        </div>

        <div className="border-t border-dashed border-black my-2" />

        <div className="flex justify-between font-bold text-[12px]">
          <span>TOTAL PAGADO</span>
          <span>{formatMoney(receipt.amount, receipt.currency)}</span>
        </div>

        {receipt.remainingBalance > 0 && (
          <div className="flex justify-between mt-1">
            <span>Saldo pendiente</span>
            <span>{formatMoney(receipt.remainingBalance, receipt.currency)}</span>
          </div>
        )}
        {receipt.remainingBalance <= 0 && (
          <p className="mt-1 text-center">Cuenta al corriente ✓</p>
        )}

        <div className="border-t border-dashed border-black my-2" />
        <p className="text-center text-[10px]">Gracias por su pago</p>
        <p className="text-center text-[10px]">{receipt.paymentId}</p>
      </div>
    </>
  );
}

// ── Add charge panel ──────────────────────────────────────────────────────────

function AddChargePanel({
  player,
  data,
  chargeTypes,
  onCancel,
  onSubmit,
  isPending,
  error
}: {
  player: CajaPlayerResult;
  data: CajaEnrollmentData;
  chargeTypes: CajaChargeTypeOption[];
  onCancel: () => void;
  onSubmit: (player: CajaPlayerResult, enrollmentId: string, formData: FormData) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [selectedType, setSelectedType] = useState<CajaChargeTypeOption | null>(
    chargeTypes[0] ?? null
  );

  return (
    <div className="space-y-4">
      {/* Player header */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <p className="text-lg font-semibold text-portoDark">{data.playerName}</p>
          <p className="text-sm text-slate-500">{data.campusName}</p>
        </div>
        <p className="text-xs text-slate-400">Nuevo cargo</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(player, data.enrollmentId, new FormData(e.currentTarget));
        }}
        className="space-y-4 rounded-xl border border-amber-300 bg-white p-5"
      >
        <p className="font-medium text-slate-800">Agregar cargo adicional</p>

        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        {chargeTypes.length === 0 ? (
          <p className="text-sm text-slate-500">No hay tipos de cargo disponibles.</p>
        ) : (
          <>
            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700">Tipo de cargo</span>
              <select
                name="chargeTypeId"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-portoBlue focus:outline-none"
                onChange={(e) => {
                  const found = chargeTypes.find((ct) => ct.id === e.target.value) ?? null;
                  setSelectedType(found);
                }}
              >
                {chargeTypes.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700">Descripción</span>
              <input
                key={selectedType?.id}
                type="text"
                name="description"
                required
                defaultValue={selectedType?.name ?? ""}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-portoBlue focus:outline-none"
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="font-medium text-slate-700">Monto</span>
              <input
                type="number"
                name="amount"
                step="0.01"
                min="0.01"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-portoBlue focus:outline-none"
              />
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-lg bg-amber-500 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {isPending ? "Guardando…" : "Crear cargo"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </form>
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
    invalid_form: "Verifica el tipo, descripción y monto del cargo.",
    unauthenticated: "Sesión expirada. Por favor inicia sesión de nuevo.",
    enrollment_not_found: "No se encontró la inscripción.",
    enrollment_inactive: "Esta inscripción está inactiva.",
    charge_insert_failed: "Error al crear el cargo. Intenta de nuevo.",
    reload_failed: "Cargo creado pero no se pudo recargar. Busca al alumno de nuevo."
  };
  return messages[code] ?? "Error desconocido. Intenta de nuevo.";
}
