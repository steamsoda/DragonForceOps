export const AREA_MAP_TYPE_CODES: { code: string; label: string }[] = [
  { code: "C",   label: "C — Constatación" },
  { code: "SM",  label: "SM — Sugerencia de Mejoría" },
  { code: "R",   label: "R — Reclamación" },
  { code: "NC",  label: "NC — No Conforme" },
  { code: "PNC", label: "PNC — Posible No Conforme" },
  { code: "AS",  label: "AS — Auditoría" },
  { code: "OM",  label: "OM — Orden de Mejora" },
  { code: "M",   label: "M — Mantenimiento" }
];

export const AREA_MAP_TOPICS = [
  "Instalaciones",
  "Entrenadores",
  "Organización de la escuela",
  "Padres de familia y alumnos",
  "Torneos y equipos de competencia",
  "Kit alumnos",
  "Kit entrenadores",
  "Material Deportivo",
  "Decoración y publicidad",
  "Nutrición",
  "Psicología",
  "Fisioterapia",
  "Secretaria",
  "Auditoría Externa",
  "Auditoría Interna",
  "Hardware",
  "Software"
];

export const EFFECTIVENESS_LABELS: Record<string, string> = {
  E:  "Eficaz",
  NE: "No Eficaz",
  SP: "Sin efecto"
};
