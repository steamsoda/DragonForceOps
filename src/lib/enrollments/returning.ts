export const RETURNING_INSCRIPTION_OPTIONS = [
  {
    mode: "full",
    label: "Inscripcion completa",
    description: "Cargo completo de regreso con uniformes incluidos.",
    amount: 1800,
    chargeDescription: "Inscripcion completa regreso",
  },
  {
    mode: "inscription_only",
    label: "Solo inscripcion",
    description: "Solo se cobra la inscripcion porque ya cuenta con uniforme.",
    amount: 600,
    chargeDescription: "Solo inscripcion regreso",
  },
  {
    mode: "waived",
    label: "Exento de inscripcion",
    description: "No se cobra inscripcion al regreso.",
    amount: 0,
    chargeDescription: "Inscripcion exenta regreso",
  },
] as const;

export type ReturningInscriptionMode = (typeof RETURNING_INSCRIPTION_OPTIONS)[number]["mode"];

export function isReturningInscriptionMode(value: string | null | undefined): value is ReturningInscriptionMode {
  return RETURNING_INSCRIPTION_OPTIONS.some((option) => option.mode === value);
}

export function getReturningInscriptionOption(mode: ReturningInscriptionMode) {
  return RETURNING_INSCRIPTION_OPTIONS.find((option) => option.mode === mode)!;
}
