const MONTERREY_TIMEZONE = "America/Monterrey";

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
