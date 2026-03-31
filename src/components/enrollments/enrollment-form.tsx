"use client";

import { useState } from "react";
import {
  quoteEnrollmentPricingFromVersions,
  type PricingPlanVersionSnapshot,
} from "@/lib/pricing/plans";

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
  const [startDate, setStartDate] = useState(defaultStartDate);
  const quote = quoteEnrollmentPricingFromVersions(pricingVersions, startDate);

  return (
    <form action={action} className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <input type="hidden" name="pricingPlanCode" value={planCode} />

      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Campus</span>
          <select
            name="campusId"
            required
            defaultValue=""
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          >
            <option value="" disabled>
              Selecciona un campus
            </option>
            {campuses.map((campus) => (
              <option key={campus.id} value={campus.id}>
                {campus.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Fecha de inicio</span>
          <input
            type="date"
            name="startDate"
            required
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600"
          />
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
              quote && quote.chargeMonthOffset === 0 && Number(startDate.slice(8, 10)) <= 10
                ? "border-portoBlue bg-blue-50 text-slate-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <p className="font-semibold">Dias 1 al 10</p>
            <p>Mensualidad completa del mes de inicio.</p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              quote && quote.chargeMonthOffset === 0 && Number(startDate.slice(8, 10)) >= 11 && Number(startDate.slice(8, 10)) <= 20
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
        disabled={!quote}
        className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
      >
        Crear inscripcion
      </button>
    </form>
  );
}
