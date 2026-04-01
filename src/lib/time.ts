const MONTERREY_TIMEZONE = "America/Monterrey";

function isValidDateOnlyParts(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

export function formatDateMonterrey(value: string | Date) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MONTERREY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function formatTimeMonterrey(value: string | Date) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: MONTERREY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatDateTimeMonterrey(value: string | Date) {
  return `${formatDateMonterrey(value)} ${formatTimeMonterrey(value)}`;
}

export function getMonterreyDateParts(value: string | Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: MONTERREY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date(value));
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return { year, month, day };
}

export function getMonterreyDateString(value: string | Date = new Date()) {
  const { year, month, day } = getMonterreyDateParts(value);
  return `${year}-${month}-${day}`;
}

export function getMonterreyMonthString(value: string | Date = new Date()) {
  const { year, month } = getMonterreyDateParts(value);
  return `${year}-${month}`;
}

export function getMonterreyMonthBounds(month: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) {
    throw new Error(`Invalid month: ${month}`);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, 6, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 6, 0, 0, 0));

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    periodMonth: `${match[1]}-${match[2]}-01`,
  };
}

export function getMonterreyDayBounds(dateStr: string) {
  const start = new Date(`${dateStr}T06:00:00.000Z`);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatDateOnlyDdMmYyyy(value: string | null | undefined) {
  if (!value) return "";

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  return value;
}

export function parseDateOnlyInput(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidDateOnlyParts(year, month, day)) return null;
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!displayMatch) return null;

  const day = Number(displayMatch[1]);
  const month = Number(displayMatch[2]);
  const year = Number(displayMatch[3]);
  if (!isValidDateOnlyParts(year, month, day)) return null;

  return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;
}

export function parseMonterreyDateTimeLocalInput(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? "00");

  if (!isValidDateOnlyParts(year, month, day)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

  return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${String(second).padStart(2, "0")}-06:00`).toISOString();
}
