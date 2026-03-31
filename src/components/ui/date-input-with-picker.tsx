"use client";

import { useRef, useState } from "react";
import { formatDateOnlyDdMmYyyy, parseDateOnlyInput } from "@/lib/time";

type DateInputWithPickerProps = {
  name: string;
  required?: boolean;
  defaultValue?: string;
  className?: string;
};

function formatDateMask(rawValue: string) {
  const digits = rawValue.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateInputWithPicker({
  name,
  required = false,
  defaultValue = "",
  className,
}: DateInputWithPickerProps) {
  const [textValue, setTextValue] = useState(formatDateOnlyDdMmYyyy(defaultValue));
  const calendarInputRef = useRef<HTMLInputElement | null>(null);
  const isoValue = parseDateOnlyInput(textValue) ?? "";

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
    <div className="space-y-1">
      <div className="flex gap-2">
        <input
          type="text"
          name={name}
          required={required}
          inputMode="numeric"
          value={textValue}
          onChange={(event) => setTextValue(formatDateMask(event.target.value))}
          placeholder="DD/MM/AAAA"
          pattern="\d{2}/\d{2}/\d{4}"
          title="Usa el formato DD/MM/AAAA"
          autoComplete="bday"
          className={className}
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
        value={isoValue}
        onChange={(event) => setTextValue(formatDateOnlyDdMmYyyy(event.target.value))}
        className="sr-only"
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">Escribe por ejemplo: 01012020</p>
    </div>
  );
}
