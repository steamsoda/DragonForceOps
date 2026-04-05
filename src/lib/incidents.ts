export type ActiveIncidentType = "absence" | "injury";

export type ActiveIncident = {
  type: ActiveIncidentType;
  label: string;
  startsOn: string | null;
  endsOn: string | null;
};

export type IncidentRangeRow = {
  incidentType: string;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
  cancelledAt?: string | null;
};

const ACTIVE_INCIDENT_LABELS: Record<ActiveIncidentType, string> = {
  absence: "Ausencia activa",
  injury: "Lesión activa",
};

function getMonterreyDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getIncidentPriority(type: string) {
  return type === "injury" ? 2 : type === "absence" ? 1 : 0;
}

export function resolveActiveIncident(
  rows: IncidentRangeRow[],
  today = getMonterreyDateKey(),
): ActiveIncident | null {
  const activeRows = rows
    .filter((row) => !row.cancelledAt)
    .filter((row) => row.incidentType === "absence" || row.incidentType === "injury")
    .filter((row) => !!row.startsOn && row.startsOn <= today)
    .filter((row) => !row.endsOn || row.endsOn >= today)
    .sort((a, b) => {
      const priorityDelta = getIncidentPriority(b.incidentType) - getIncidentPriority(a.incidentType);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const active = activeRows[0];
  if (!active) return null;

  const type = active.incidentType as ActiveIncidentType;

  return {
    type,
    label: ACTIVE_INCIDENT_LABELS[type],
    startsOn: active.startsOn,
    endsOn: active.endsOn,
  };
}
