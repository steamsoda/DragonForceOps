export const PORTO_VIEWS = {
  players: { title: "Jugadores", detail: "ID", extra: "Categoria" },
  guardians: { title: "Tutores", detail: "Jugador", extra: "Contacto" },
  groups: { title: "Grupos", detail: "Programa", extra: "Profesor" },
  attendance: { title: "Asistencia", detail: "Grupo", extra: "Hora" },
  squads: { title: "Equipos", detail: "Jugador", extra: "Torneo" },
  schedules: { title: "Partidos", detail: "Torneo", extra: "Hora / Sede / Rival" },
  registrations: { title: "Inscripciones", detail: "ID", extra: "Ingreso" },
  trials: { title: "Clases de prueba", detail: "Grupo", extra: "Tutor / Contacto" },
} as const;
export type PortoView = keyof typeof PORTO_VIEWS;
export function parsePortoView(value: string | undefined): PortoView {
  return value && Object.hasOwn(PORTO_VIEWS, value) ? value as PortoView : "players";
}
export function parsePortoPage(value: string | undefined): number {
  const page = Number(value ?? 0);
  return Number.isInteger(page) && page >= 0 && page <= 1000 ? page : 0;
}
