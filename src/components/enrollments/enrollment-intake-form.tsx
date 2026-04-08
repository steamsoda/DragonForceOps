"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  RETURNING_INSCRIPTION_OPTIONS,
  getReturningInscriptionOption,
  type ReturningInscriptionMode,
} from "@/lib/enrollments/returning";
import {
  quoteEnrollmentPricingFromVersions,
  type PricingPlanVersionSnapshot,
} from "@/lib/pricing/plans";
import { formatDateOnlyDdMmYyyy, parseDateOnlyInput } from "@/lib/time";
import {
  createEnrollmentIntakeAction,
  searchLikelyPlayersForIntakeAction,
  type IntakeMatch,
} from "@/server/actions/intake";

type EnrollmentIntakeFormProps = {
  campuses: Array<{ id: string; code: string; name: string }>;
  planCode: string;
  pricingVersions: PricingPlanVersionSnapshot[];
  defaultStartDate: string;
  initialIsReturning?: boolean;
  initialReturnInscriptionMode?: ReturningInscriptionMode;
};

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900";

const UNIFORM_SIZES = ["XCH JR", "CH JR", "M JR", "G JR", "XL JR", "CH", "M", "G", "XL"];

function formatDateMask(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

type MaskedDateFieldProps = {
  label: string;
  name: string;
  value: string;
  required?: boolean;
  hint?: string;
  onChange: (value: string) => void;
};

function MaskedDateField({ label, name, value, required, hint, onChange }: MaskedDateFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function openCalendar() {
    const input = inputRef.current;
    if (!input) return;

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  }

  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <div className="flex gap-2">
        <input
          type="text"
          required={required}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(formatDateMask(event.target.value))}
          placeholder="DD/MM/AAAA"
          pattern="\d{2}/\d{2}/\d{4}"
          title="Usa el formato DD/MM/AAAA"
          className={inputClass}
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
        ref={inputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={parseDateOnlyInput(value) ?? ""}
        onChange={(event) => onChange(formatDateOnlyDdMmYyyy(event.target.value))}
        className="sr-only"
      />
      {hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      <input type="hidden" name={name} value={parseDateOnlyInput(value) ?? ""} />
    </label>
  );
}

function formatMatchBirthDate(value: string) {
  return formatDateOnlyDdMmYyyy(value);
}

export function EnrollmentIntakeForm({
  campuses,
  planCode,
  pricingVersions,
  defaultStartDate,
  initialIsReturning = false,
  initialReturnInscriptionMode = "full",
}: EnrollmentIntakeFormProps) {
  const [isReturning, setIsReturning] = useState(initialIsReturning);
  const [returnInscriptionMode, setReturnInscriptionMode] =
    useState<ReturningInscriptionMode>(initialReturnInscriptionMode);
  const [campusId, setCampusId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDateText, setBirthDateText] = useState("");
  const [guardianFirstName, setGuardianFirstName] = useState("");
  const [guardianLastName, setGuardianLastName] = useState("");
  const [startDateText, setStartDateText] = useState(formatDateOnlyDdMmYyyy(defaultStartDate));
  const [matches, setMatches] = useState<IntakeMatch[]>([]);
  const [isCheckingMatches, setIsCheckingMatches] = useState(false);
  const requestRef = useRef(0);
  const [uniformSize, setUniformSize] = useState("");
  const [kitFulfillment, setKitFulfillment] = useState<"deliver_now" | "pending_order">("deliver_now");
  const [kitIsGoalkeeper, setKitIsGoalkeeper] = useState(false);
  const [addExtraKit, setAddExtraKit] = useState(false);
  const [extraKitSize, setExtraKitSize] = useState("");
  const [extraKitIsGoalkeeper, setExtraKitIsGoalkeeper] = useState(false);
  const [addGameUniform, setAddGameUniform] = useState(false);
  const [gameUniformSize, setGameUniformSize] = useState("");
  const [gameUniformIsGoalkeeper, setGameUniformIsGoalkeeper] = useState(false);

  const birthDate = useMemo(() => parseDateOnlyInput(birthDateText), [birthDateText]);
  const startDate = useMemo(() => parseDateOnlyInput(startDateText), [startDateText]);
  const deferredFirstName = useDeferredValue(firstName.trim());
  const deferredLastName = useDeferredValue(lastName.trim());
  const deferredBirthDate = useDeferredValue(birthDate);

  const quote = useMemo(() => {
    if (!startDate) return null;
    return quoteEnrollmentPricingFromVersions(pricingVersions, startDate);
  }, [pricingVersions, startDate]);

  const selectedCampus = campuses.find((campus) => campus.id === campusId) ?? null;
  const selectedReturnOption = getReturningInscriptionOption(returnInscriptionMode);
  const inscriptionAmount = isReturning ? selectedReturnOption.amount : (quote?.inscriptionAmount ?? 0);
  const monthlyAmount = quote?.tuitionAmount ?? 0;
  const startDay = startDate ? Number(startDate.slice(8, 10)) : null;
  const submitDisabled = !quote || !campusId || !birthDate || !startDate;

  useEffect(() => {
    if (!deferredFirstName || !deferredLastName || !deferredBirthDate) {
      setMatches([]);
      setIsCheckingMatches(false);
      return;
    }

    const currentRequest = requestRef.current + 1;
    requestRef.current = currentRequest;
    setIsCheckingMatches(true);

    const timer = window.setTimeout(() => {
      void searchLikelyPlayersForIntakeAction({
        firstName: deferredFirstName,
        lastName: deferredLastName,
        birthDate: deferredBirthDate,
      })
        .then((result) => {
          if (requestRef.current !== currentRequest) return;
          setMatches(result);
          setIsCheckingMatches(false);
        })
        .catch(() => {
          if (requestRef.current !== currentRequest) return;
          setMatches([]);
          setIsCheckingMatches(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [deferredBirthDate, deferredFirstName, deferredLastName]);

  return (
    <form action={createEnrollmentIntakeAction} className="space-y-6">
      <input type="hidden" name="pricingPlanCode" value={planCode} />
      <input type="hidden" name="campusId" value={campusId} />
      <input type="hidden" name="startDate" value={startDate ?? ""} />
      <input type="hidden" name="isReturning" value={isReturning ? "1" : "0"} />
      <input type="hidden" name="returnInscriptionMode" value={isReturning ? returnInscriptionMode : ""} />
      <input type="hidden" name="uniformSize" value={uniformSize} />
      <input type="hidden" name="kitFulfillment" value={kitFulfillment} />
      <input type="hidden" name="kitIsGoalkeeper" value={kitIsGoalkeeper ? "1" : "0"} />
      <input type="hidden" name="addExtraKit" value={addExtraKit ? "1" : "0"} />
      <input type="hidden" name="extraKitSize" value={extraKitSize} />
      <input type="hidden" name="extraKitIsGoalkeeper" value={extraKitIsGoalkeeper ? "1" : "0"} />
      <input type="hidden" name="addGameUniform" value={addGameUniform ? "1" : "0"} />
      <input type="hidden" name="gameUniformSize" value={gameUniformSize} />
      <input type="hidden" name="gameUniformIsGoalkeeper" value={gameUniformIsGoalkeeper ? "1" : "0"} />

      <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tipo de alta</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Selecciona si este registro es un alta nueva o un reingreso. El flujo termina en Caja para cobrar.
          </p>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setIsReturning(false)}
            className={`rounded-md border px-3 py-3 text-left text-sm transition ${
              !isReturning
                ? "border-portoBlue bg-blue-50 text-slate-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <p className="font-semibold">Nuevo ingreso</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Usa la inscripcion estandar del plan y la mensualidad automatica.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setIsReturning(true)}
            className={`rounded-md border px-3 py-3 text-left text-sm transition ${
              isReturning
                ? "border-emerald-500 bg-emerald-50 text-slate-900"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <p className="font-semibold">Reingreso</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Activa las opciones especiales de inscripcion para reingreso.
            </p>
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Datos del jugador</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Captura los datos del jugador. Si el sistema detecta coincidencias, las mostrara como advertencia.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Nombre(s) <span className="text-rose-500">*</span>
            </span>
            <input
              type="text"
              name="firstName"
              required
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="Ej. Carlos"
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Apellidos <span className="text-rose-500">*</span>
            </span>
            <input
              type="text"
              name="lastName"
              required
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Ej. Garcia Lopez"
              className={inputClass}
            />
          </label>
          <MaskedDateField
            label="Fecha de nacimiento"
            name="birthDate"
            value={birthDateText}
            onChange={setBirthDateText}
            required
            hint="Escribe por ejemplo: 01012010"
          />
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Genero</span>
            <select name="gender" className={inputClass} defaultValue="">
              <option value="">Sin especificar</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </label>
        </div>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Notas medicas (opcional)</span>
          <textarea
            name="medicalNotes"
            rows={2}
            placeholder="Alergias, condiciones, etc."
            className={inputClass}
          />
        </label>

        {isCheckingMatches || matches.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                  Posibles coincidencias
                </p>
                <p className="mt-1 text-sm text-slate-700">
                  {isCheckingMatches
                    ? "Buscando jugadores con nombre y ano de nacimiento similares..."
                    : "Revisa si se trata de un jugador historico antes de continuar."}
                </p>
              </div>
              {!isCheckingMatches ? (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700">
                  Continuar sigue permitido
                </span>
              ) : null}
            </div>
            {!isCheckingMatches && matches.length > 0 ? (
              <div className="mt-3 space-y-2">
                {matches.map((match) => (
                  <div
                    key={match.playerId}
                    className="flex flex-col gap-2 rounded-lg border border-amber-100 bg-white px-3 py-3 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-900">{match.fullName}</p>
                      <p className="text-xs text-slate-600">
                        Nac.: {formatMatchBirthDate(match.birthDate)}
                        {match.campusLabel ? ` • ${match.campusLabel}` : ""}
                        {match.hasActiveEnrollment ? " • Inscripcion activa" : " • Sin inscripcion activa"}
                      </p>
                    </div>
                    <Link
                      href={`/players/${match.playerId}`}
                      className="inline-flex items-center justify-center rounded-md border border-amber-300 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                    >
                      Ver jugador
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tutor principal</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            En esta version se captura un solo tutor principal antes de enviar a Caja.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Nombre(s) <span className="text-rose-500">*</span>
            </span>
            <input
              type="text"
              name="guardianFirstName"
              required
              value={guardianFirstName}
              onChange={(event) => setGuardianFirstName(event.target.value)}
              placeholder="Ej. Maria"
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Apellidos <span className="text-rose-500">*</span>
            </span>
            <input
              type="text"
              name="guardianLastName"
              required
              value={guardianLastName}
              onChange={(event) => setGuardianLastName(event.target.value)}
              placeholder="Ej. Lopez Ruiz"
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Telefono principal <span className="text-rose-500">*</span>
            </span>
            <input
              type="tel"
              name="guardianPhone"
              required
              placeholder="Ej. 8112345678"
              className={inputClass}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Telefono secundario</span>
            <input type="tel" name="guardianPhoneSecondary" placeholder="Opcional" className={inputClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Email</span>
            <input type="email" name="guardianEmail" placeholder="Opcional" className={inputClass} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Parentesco</span>
            <input
              type="text"
              name="guardianRelationship"
              placeholder="Ej. Madre, Padre, Tutor"
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Inscripcion y mensualidad</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            El sistema calcula automaticamente los cargos iniciales segun la fecha de inicio.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <fieldset className="space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Campus <span className="text-rose-500">*</span>
            </span>
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
            <p className="text-xs text-slate-500 dark:text-slate-400">Selecciona el campus antes de crear.</p>
          </fieldset>

          <MaskedDateField
            label="Fecha de inicio"
            name="_unusedStartDateMasked"
            value={startDateText}
            onChange={setStartDateText}
            required
            hint="Escribe por ejemplo: 01052026"
          />
        </div>

        {isReturning ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Modo Reingreso</p>
            <p className="mt-1 text-sm text-slate-700">
              Selecciona la modalidad de inscripcion. La mensualidad usa las mismas reglas del alta normal.
            </p>
          </div>
        ) : null}

        {quote ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">
                {isReturning ? "Inscripcion regreso" : "Inscripcion"}
              </p>
              {isReturning ? (
                <div className="mt-3 space-y-2">
                  {RETURNING_INSCRIPTION_OPTIONS.map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => setReturnInscriptionMode(option.mode)}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                        returnInscriptionMode === option.mode
                          ? "border-portoBlue bg-white text-slate-900 shadow-sm"
                          : "border-sky-100 bg-sky-50/60 text-slate-700 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{option.label}</p>
                          <p className="mt-1 text-xs text-slate-500">{option.description}</p>
                        </div>
                        <span className="text-lg font-bold text-slate-900">${option.amount.toFixed(2)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <p className="mt-2 text-2xl font-bold text-slate-900">${quote.inscriptionAmount.toFixed(2)}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Se usa el valor actual del plan. No se captura manualmente.
                  </p>
                </>
              )}
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {quote.tuitionRuleLabel}
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">${quote.tuitionAmount.toFixed(2)}</p>
              <p className="mt-1 text-xs text-slate-600">
                Periodo a crear: {quote.tuitionPeriodMonth.slice(5, 7)}/{quote.tuitionPeriodMonth.slice(0, 4)}
              </p>
              {isReturning ? (
                <p className="mt-2 text-xs text-slate-600">
                  Modalidad de regreso:{" "}
                  <span className="font-semibold text-slate-700">{selectedReturnOption.label}</span>
                </p>
              ) : null}
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
            placeholder="Descuentos, acuerdos especiales, etc."
            className={inputClass}
          />
        </label>
      </section>

      {/* ── Uniformes ─────────────────────────────────────────────────────── */}
      <section className="space-y-4 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Uniformes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Registra los uniformes que se entregan o agregan en este alta.
          </p>
        </div>

        {/* Included training kits — shown when inscription includes uniforms */}
        {(!isReturning || returnInscriptionMode === "full") && (
          <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              2 kits de entrenamiento incluidos en la inscripción
            </p>
            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">Talla (ambos kits)</p>
                <div className="flex flex-wrap gap-1.5">
                  {UNIFORM_SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setUniformSize(uniformSize === s ? "" : s)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        uniformSize === s
                          ? "border-portoBlue bg-portoBlue text-white"
                          : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setKitIsGoalkeeper((g) => !g)}
                    className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                      kitIsGoalkeeper
                        ? "border-violet-500 bg-violet-500 text-white"
                        : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    Portero {kitIsGoalkeeper ? "✓" : ""}
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">Entrega</p>
                <div className="flex rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden w-fit">
                  <button
                    type="button"
                    onClick={() => setKitFulfillment("deliver_now")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      kitFulfillment === "deliver_now"
                        ? "bg-portoBlue text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    Entregar ahora
                  </button>
                  <button
                    type="button"
                    onClick={() => setKitFulfillment("pending_order")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-slate-300 dark:border-slate-600 ${
                      kitFulfillment === "pending_order"
                        ? "bg-portoBlue text-white"
                        : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    Sin stock — pedido pendiente
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Extra training kit — shown for returning players who skipped kits */}
        {isReturning && returnInscriptionMode !== "full" && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={addExtraKit}
                onChange={(e) => { setAddExtraKit(e.target.checked); if (!e.target.checked) setExtraKitSize(""); }}
                className="h-4 w-4 rounded border-slate-300 text-portoBlue focus:ring-portoBlue"
              />
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Agregar kit de entrenamiento adicional — <span className="text-slate-500">$600.00</span>
              </span>
            </label>
            {addExtraKit && (
              <div className="ml-6 space-y-1">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Talla</p>
                <div className="flex flex-wrap gap-1.5">
                  {UNIFORM_SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setExtraKitSize(extraKitSize === s ? "" : s)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                        extraKitSize === s
                          ? "border-portoBlue bg-portoBlue text-white"
                          : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setExtraKitIsGoalkeeper((g) => !g)}
                    className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                      extraKitIsGoalkeeper
                        ? "border-violet-500 bg-violet-500 text-white"
                        : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    Portero {extraKitIsGoalkeeper ? "✓" : ""}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Game uniform — always optional */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={addGameUniform}
              onChange={(e) => { setAddGameUniform(e.target.checked); if (!e.target.checked) setGameUniformSize(""); }}
              className="h-4 w-4 rounded border-slate-300 text-portoBlue focus:ring-portoBlue"
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Agregar uniforme de juego — <span className="text-slate-500">$600.00</span>
            </span>
          </label>
          {addGameUniform && (
            <div className="ml-6 space-y-1">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Talla</p>
              <div className="flex flex-wrap gap-1.5">
                {UNIFORM_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setGameUniformSize(gameUniformSize === s ? "" : s)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      gameUniformSize === s
                        ? "border-portoBlue bg-portoBlue text-white"
                        : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setGameUniformIsGoalkeeper((g) => !g)}
                  className={`rounded-md border px-3 py-1 text-xs font-semibold transition-colors ${
                    gameUniformIsGoalkeeper
                      ? "border-violet-500 bg-violet-500 text-white"
                      : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  Portero {gameUniformIsGoalkeeper ? "✓" : ""}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Resumen antes de crear</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Al enviar, se crea el jugador, el tutor principal, la inscripcion y sus cargos iniciales, y luego se abre
            Caja.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">Jugador</p>
            <p className="mt-1 text-slate-600">
              {firstName || lastName ? `${firstName} ${lastName}`.trim() : "Sin capturar"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {birthDate ? `Nac.: ${formatDateOnlyDdMmYyyy(birthDate)}` : "Fecha de nacimiento pendiente"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">Tutor principal</p>
            <p className="mt-1 text-slate-600">
              {guardianFirstName || guardianLastName
                ? `${guardianFirstName} ${guardianLastName}`.trim()
                : "Sin capturar"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {selectedCampus ? `Campus: ${selectedCampus.name}` : "Campus pendiente"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">Tipo de alta</p>
            <p className="mt-1 text-slate-600">{isReturning ? "Reingreso" : "Nuevo ingreso"}</p>
            <p className="mt-1 text-xs text-slate-500">
              {isReturning ? selectedReturnOption.label : "Inscripcion estandar del plan"}
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-800">Primeros cargos</p>
            <p className="mt-1 text-slate-600">
              Inscripcion: <span className="font-semibold">${inscriptionAmount.toFixed(2)}</span>
            </p>
            <p className="mt-1 text-slate-600">
              Mensualidad: <span className="font-semibold">${monthlyAmount.toFixed(2)}</span>
            </p>
            {addExtraKit && (
              <p className="mt-1 text-slate-600">
                + Kit entrenamiento: <span className="font-semibold">$600.00</span>
              </p>
            )}
            {addGameUniform && (
              <p className="mt-1 text-slate-600">
                + Uniforme de juego: <span className="font-semibold">$600.00</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={submitDisabled}
            className="rounded-md bg-portoBlue px-4 py-2 text-sm font-medium text-white hover:bg-portoDark disabled:cursor-not-allowed disabled:opacity-50"
          >
            Crear registro y abrir Caja
          </button>
          <Link href="/players" className="text-sm text-portoBlue hover:underline">
            Cancelar y volver a Jugadores
          </Link>
        </div>
      </section>
    </form>
  );
}
