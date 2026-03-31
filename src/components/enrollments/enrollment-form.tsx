"use client";

import { useMemo, useRef, useState } from "react";
import {
  quoteEnrollmentPricingFromVersions,
  type PricingPlanVersionSnapshot,
} from "@/lib/pricing/plans";
import { formatDateOnlyDdMmYyyy, parseDateOnlyInput } from "@/lib/time";

type EnrollmentCreateFormProps = {
  campuses: Array<{ id: string; code: string; name: string }>;
  planCode: string;
  pricingVersions: PricingPlanVersionSnapshot[];
  defaultStartDate: string;
  action: (formData: FormData) => Promise<void>;
};

export function EnrollmentCreateForm({
  campuses,
  planCode,
  pricingVersions,
  defaultStartDate,
  action,
}: EnrollmentCreateFormProps) {
  const [campusId, setCampusId] = useState("");
  const [startDateText, setStartDateText] = useState(formatDateOnlyDdMmYyyy(defaultStartDate));
  const calendarInputRef = useRef<HTMLInputElement | null>(null);

  const startDate = useMemo(() => parseDateOnlyInput(startDateText), [startDateText]);
  const quote = startDate ? quoteEnrollmentPricingFromVersions(pricingVersions, startDate) : null;
  const startDay = startDate ? Number(startDate.slice(8, 10)) : null;

  function formatDateMask(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  }

  function openCalendar() {
    const input = calendarInputRef.current;
    if (!input) return;

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  }

  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <input type="hidden" name="pricingPlanCode" value={planCode} />
      <input type="hidden" name="campusId" value={campusId} />
      <input type="hidden" name="startDate" value={startDate ?? ""} />

      <div className="grid gap-3 md:grid-cols-2">
        <fieldset className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Campus</span>
          <div className="grid grid-cols-2 gap-2">
            {campuses.map((campus) => (
              <button
                key={campus.id}
                type="button"
                onClick={() => setCampusId(campus.id)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  campusId === campus.id
                    ? "border-portoBlue bg-portoBlue text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {campus.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona el campus antes de crear la inscripcion.</p>
        </fieldset>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Fecha de inicio</span>
          <div className="flex gap-2">
            <input
              type="text"
              required
              inputMode="numeric"
              value={startDateText}
              onChange={(event) => setStartDateText(formatDateMask(event.target.value))}
              placeholder="DD/MM/AAAA"
              pattern="\d{2}/\d{2}/\d{4}"
              title="Usa el formato DD/MM/AAAA"
              className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
            />
            <button
              type="button"
              onClick={openCalendar}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Calendario
            </button>
          </div>
          <input
            ref={calendarInputRef}
            type="date"
            tabIndex={-1}
            aria-hidden="true"
            value={startDate ?? ""}
            onChange={(event) => setStartDateText(formatDateOnlyDdMmYyyy(event.target.value))}
            className="sr-only"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">Escribe por ejemplo: 01012020</p>
        </label>
      </div>

      {quote ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Inscripcion</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              ${quote.inscriptionAmount.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              El sistema usa el valor del plan activo. Ya no se captura manualmente.
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {quote.tuitionRuleLabel}
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900">
              ${quote.tuitionAmount.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              Periodo a crear: {quote.tuitionPeriodMonth.slice(5, 7)}/{quote.tuitionPeriodMonth.slice(0, 4)}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          No se encontro una configuracion de precios valida para esa fecha.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Reglas automaticas</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              quote && quote.chargeMonthOffset === 0 && startDay !== null && startDay <= 10
                ? "border-portoBlue bg-blue-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <p className="font-semibold">Dias 1 al 10</p>
            <p>Mensualidad completa del mes de inicio.</p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              quote && quote.chargeMonthOffset === 0 && startDay !== null && startDay >= 11 && startDay <= 20
                ? "border-portoBlue bg-blue-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <p className="font-semibold">Dias 11 al 20</p>
            <p>Mensualidad ajustada de media ventana.</p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              quote && quote.chargeMonthOffset === 1
                ? "border-portoBlue bg-blue-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <p className="font-semibold">Dias 21 en adelante</p>
            <p>Se omite el mes actual y se crea solo el siguiente mes.</p>
          </div>
        </div>
      </div>

      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Notas (opcional)</span>
        <textarea
          name="notes"
          rows={2}
          className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          placeholder="Descuentos, acuerdos especiales, etc."
        />
      </label>

      <button
        type="submit"
        disabled={!quote || !campusId}
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
      >
        Crear inscripcion
      </button>
    </form>
  );
}
