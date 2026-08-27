"use client";

import { useMemo, useState } from "react";
import { saveSportsSignupTournamentSettingsAction } from "@/server/actions/sports-signups";

type CampusOption = { id: string; name: string };

export type TournamentCampusSetting = {
  campusId: string;
  startDate: string | null;
  endDate: string | null;
  signupDeadline: string | null;
  cajaAvailableUntil: string | null;
  hasPricingRules: boolean;
  hasMixedPricingEndDates: boolean;
};

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-portoBlue focus:outline-none dark:border-slate-600";

function commonValue(settings: TournamentCampusSetting[], key: keyof TournamentCampusSetting) {
  if (settings.length === 0) return "";
  const values = new Set(settings.map((setting) => setting[key] ?? ""));
  return values.size === 1 ? String(settings[0][key] ?? "") : "";
}

export function TournamentSettingsForm({
  productId,
  productName,
  campuses,
  settings,
}: {
  productId: string;
  productName: string;
  campuses: CampusOption[];
  settings: TournamentCampusSetting[];
}) {
  const allDefaults = useMemo(
    () => ({
      startDate: commonValue(settings, "startDate"),
      endDate: commonValue(settings, "endDate"),
      signupDeadline: commonValue(settings, "signupDeadline"),
      cajaAvailableUntil: commonValue(settings, "cajaAvailableUntil"),
    }),
    [settings],
  );
  const [campusId, setCampusId] = useState("__all__");
  const [startDate, setStartDate] = useState(allDefaults.startDate);
  const [endDate, setEndDate] = useState(allDefaults.endDate);
  const [signupDeadline, setSignupDeadline] = useState(allDefaults.signupDeadline);
  const [cajaAvailableUntil, setCajaAvailableUntil] = useState(
    allDefaults.cajaAvailableUntil || allDefaults.signupDeadline,
  );
  const [cajaDateWasEdited, setCajaDateWasEdited] = useState(Boolean(allDefaults.cajaAvailableUntil));

  const selectedSettings = campusId === "__all__"
    ? settings
    : settings.filter((setting) => setting.campusId === campusId);
  const hasPricingRules = selectedSettings.some((setting) => setting.hasPricingRules);
  const hasMixedPricingEndDates = selectedSettings.some((setting) => setting.hasMixedPricingEndDates);

  function selectCampus(nextCampusId: string) {
    setCampusId(nextCampusId);
    const nextSettings = nextCampusId === "__all__"
      ? settings
      : settings.filter((setting) => setting.campusId === nextCampusId);
    const nextStart = commonValue(nextSettings, "startDate");
    const nextEnd = commonValue(nextSettings, "endDate");
    const nextSignup = commonValue(nextSettings, "signupDeadline");
    const nextCaja = commonValue(nextSettings, "cajaAvailableUntil");
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setSignupDeadline(nextSignup);
    setCajaAvailableUntil(nextCaja || nextSignup);
    setCajaDateWasEdited(Boolean(nextCaja));
  }

  function changeSignupDeadline(value: string) {
    const priorSignupDeadline = signupDeadline;
    setSignupDeadline(value);
    if (!cajaDateWasEdited || !cajaAvailableUntil || cajaAvailableUntil === priorSignupDeadline) {
      setCajaAvailableUntil(value);
      setCajaDateWasEdited(false);
    }
  }

  const cajaBeforeSignup = Boolean(
    signupDeadline && cajaAvailableUntil && cajaAvailableUntil < signupDeadline,
  );

  return (
    <form action={saveSportsSignupTournamentSettingsAction} className="mt-4 grid gap-3 lg:grid-cols-6">
      <input type="hidden" name="returnTo" value={`/products/${productId}`} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="name" value={productName} />
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Campus</span>
        <select
          name="campusId"
          value={campusId}
          onChange={(event) => selectCampus(event.target.value)}
          className={inputClass}
        >
          <option value="__all__">Ambos campus</option>
          {campuses.map((campus) => (
            <option key={campus.id} value={campus.id}>{campus.name}</option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Inicio</span>
        <input name="startDate" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={inputClass} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Fin</span>
        <input name="endDate" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={inputClass} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="font-medium text-slate-700">Cierre de inscripcion</span>
        <input
          name="signupDeadline"
          type="date"
          value={signupDeadline}
          onChange={(event) => changeSignupDeadline(event.target.value)}
          className={inputClass}
        />
      </label>
      <label className="space-y-1 text-sm lg:col-span-2">
        <span className="font-medium text-slate-700">Disponible en Caja hasta</span>
        <input
          name="cajaAvailableUntil"
          type="date"
          value={cajaAvailableUntil}
          required={hasPricingRules}
          disabled={!hasPricingRules}
          onChange={(event) => {
            setCajaAvailableUntil(event.target.value);
            setCajaDateWasEdited(true);
          }}
          className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`}
        />
      </label>

      <div className="lg:col-span-5">
        {hasMixedPricingEndDates ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Las reglas finales de precio no terminan el mismo dia. Guardar alineara solo el ultimo periodo de cada regla seleccionada.
          </p>
        ) : null}
        {cajaBeforeSignup ? (
          <p className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            Caja no puede cerrar antes del cierre de inscripcion.
          </p>
        ) : null}
        {!hasPricingRules ? (
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Este producto no usa reglas temporales de precio. Sus fechas de torneo se guardaran, pero su disponibilidad en Caja depende de que el producto siga activo.
          </p>
        ) : null}
      </div>
      <div className="flex items-end lg:justify-end">
        <button
          type="submit"
          disabled={cajaBeforeSignup}
          className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Guardar configuracion
        </button>
      </div>
    </form>
  );
}
