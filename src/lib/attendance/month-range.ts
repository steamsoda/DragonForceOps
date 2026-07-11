const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function isMonth(value: string | null | undefined) {
  if (!value || !MONTH_PATTERN.test(value)) return false;
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

export function resolveAttendanceMonthRange({
  month,
  monthFrom,
  monthTo,
  currentMonth,
}: {
  month?: string;
  monthFrom?: string;
  monthTo?: string;
  currentMonth: string;
}) {
  const legacyMonth = isMonth(month) ? month! : null;
  const resolvedFrom = isMonth(monthFrom) ? monthFrom! : legacyMonth ?? currentMonth;
  const requestedTo = isMonth(monthTo) ? monthTo! : legacyMonth ?? resolvedFrom;
  const [fromYear, fromMonth] = resolvedFrom.split("-").map(Number);
  const [toYear, toMonth] = requestedTo.split("-").map(Number);
  const monthSpan = (toYear * 12 + toMonth) - (fromYear * 12 + fromMonth);

  if (monthSpan < 0) {
    return {
      monthFrom: resolvedFrom,
      monthTo: resolvedFrom,
      error: "El mes Hasta no puede ser anterior al mes Desde. Se muestra solo el mes inicial.",
    };
  }
  if (monthSpan > 2) {
    return {
      monthFrom: resolvedFrom,
      monthTo: resolvedFrom,
      error: "El rango máximo es de 3 meses consecutivos. Se muestra solo el mes inicial.",
    };
  }
  return { monthFrom: resolvedFrom, monthTo: requestedTo, error: null };
}
