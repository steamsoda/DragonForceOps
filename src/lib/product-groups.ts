// Display grouping for products. This is purely a UI/app layer concern —
// charge_type codes are the financial source of truth (unchanged).
// To add a new display group, add a charge_type in the DB and an entry here.

export const PRODUCT_GROUPS = [
  { key: "uniforms",    label: "Uniformes", codes: ["uniform_training", "uniform_game"] },
  { key: "tournaments", label: "Torneos",   codes: ["tournament", "cup"] },
  { key: "trips",       label: "Viajes",    codes: ["trip"] },
  { key: "events",      label: "Eventos",   codes: ["event"] },
] as const;

export type ProductGroupDef = typeof PRODUCT_GROUPS[number];
