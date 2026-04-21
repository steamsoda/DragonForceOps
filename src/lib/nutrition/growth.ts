export type GrowthIndicator = "bmi_for_age" | "weight_for_age" | "height_for_age";
export type GrowthSex = "M" | "F";

export type WhoGrowthReferenceRow = {
  indicator: GrowthIndicator;
  sex: GrowthSex;
  age_months: number;
  l: number | string;
  m: number | string;
  s: number | string;
};

export type GrowthClassificationTone = "normal" | "warning" | "danger";

export type GrowthClassification = {
  label: string;
  tone: GrowthClassificationTone;
};

export type GrowthChartPoint = {
  ageMonths: number;
  ageYears: number;
  p3: number;
  p15: number;
  p50: number;
  p85: number;
  p97: number;
  playerValue: number | null;
};

export type GrowthLatestMetric = {
  value: number;
  zScore: number;
  percentile: number;
  ageMonths: number;
  measuredAt: string;
  classification: GrowthClassification | null;
};

export type GrowthIndicatorProfile = {
  indicator: GrowthIndicator;
  label: string;
  unit: string;
  available: boolean;
  unavailableReason: string | null;
  chartPoints: GrowthChartPoint[];
  latest: GrowthLatestMetric | null;
};

export type GrowthProfile = {
  sex: GrowthSex | null;
  indicators: GrowthIndicatorProfile[];
  latestBmi: GrowthLatestMetric | null;
};

type MeasurementInput = {
  id: string;
  measuredAt: string;
  weightKg: number;
  heightCm: number;
};

type ReferencePoint = {
  indicator: GrowthIndicator;
  sex: GrowthSex;
  ageMonths: number;
  l: number;
  m: number;
  s: number;
};

const PERCENTILE_Z = {
  p3: -1.881,
  p15: -1.036,
  p50: 0,
  p85: 1.036,
  p97: 1.881,
};

const INDICATOR_META: Record<GrowthIndicator, { label: string; unit: string }> = {
  bmi_for_age: { label: "IMC", unit: "kg/m2" },
  weight_for_age: { label: "Peso", unit: "kg" },
  height_for_age: { label: "Estatura", unit: "cm" },
};

function toNumber(value: number | string) {
  return typeof value === "number" ? value : Number(value);
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

export function getGrowthSex(gender: string | null | undefined): GrowthSex | null {
  if (gender === "male") return "M";
  if (gender === "female") return "F";
  return null;
}

export function ageInMonths(birthDate: string, measuredAt: string) {
  const birth = parseDateOnly(birthDate);
  const measured = new Date(measuredAt);
  if (!birth || Number.isNaN(measured.getTime())) return null;

  let months = (measured.getUTCFullYear() - birth.getUTCFullYear()) * 12;
  months += measured.getUTCMonth() - birth.getUTCMonth();
  if (measured.getUTCDate() < birth.getUTCDate()) months -= 1;
  return months;
}

function lmsToValue(l: number, m: number, s: number, z: number) {
  if (l === 0) return m * Math.exp(s * z);
  return m * Math.pow(1 + l * s * z, 1 / l);
}

function calculateZScore(point: ReferencePoint, value: number) {
  if (point.l === 0) return Math.log(value / point.m) / point.s;
  return (Math.pow(value / point.m, point.l) - 1) / (point.l * point.s);
}

function zToPercentile(z: number) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const erf = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));
  return Math.max(0, Math.min(100, Math.round(0.5 * (1 + sign * erf) * 100)));
}

function classifyBmiZScore(z: number): GrowthClassification {
  if (z < -3) return { label: "Delgadez severa", tone: "danger" };
  if (z < -2) return { label: "Delgadez", tone: "warning" };
  if (z <= 1) return { label: "Normal", tone: "normal" };
  if (z <= 2) return { label: "Sobrepeso", tone: "warning" };
  return { label: "Obesidad", tone: "danger" };
}

function getMeasurementValue(indicator: GrowthIndicator, measurement: MeasurementInput) {
  if (indicator === "weight_for_age") return measurement.weightKg;
  if (indicator === "height_for_age") return measurement.heightCm;
  if (measurement.heightCm <= 0) return null;
  const heightM = measurement.heightCm / 100;
  return measurement.weightKg / (heightM * heightM);
}

function roundMetric(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildGrowthProfile(params: {
  birthDate: string | null;
  gender: string | null;
  measurements: MeasurementInput[];
  referenceRows: WhoGrowthReferenceRow[];
}): GrowthProfile {
  const sex = getGrowthSex(params.gender);

  if (!params.birthDate) {
    return {
      sex,
      latestBmi: null,
      indicators: buildUnavailableIndicators("Se requiere fecha de nacimiento para calcular curvas OMS."),
    };
  }

  if (!sex) {
    return {
      sex,
      latestBmi: null,
      indicators: buildUnavailableIndicators("Se requiere genero del jugador para seleccionar la referencia OMS."),
    };
  }

  const references = params.referenceRows
    .filter((row) => row.sex === sex)
    .map((row) => ({
      indicator: row.indicator,
      sex: row.sex,
      ageMonths: row.age_months,
      l: toNumber(row.l),
      m: toNumber(row.m),
      s: toNumber(row.s),
    }))
    .filter((row) => Number.isFinite(row.ageMonths) && Number.isFinite(row.l) && Number.isFinite(row.m) && Number.isFinite(row.s));

  const indicators = (Object.keys(INDICATOR_META) as GrowthIndicator[]).map((indicator) =>
    buildIndicatorProfile(indicator, params.birthDate!, params.measurements, references),
  );

  return {
    sex,
    indicators,
    latestBmi: indicators.find((indicator) => indicator.indicator === "bmi_for_age")?.latest ?? null,
  };
}

function buildUnavailableIndicators(reason: string): GrowthIndicatorProfile[] {
  return (Object.keys(INDICATOR_META) as GrowthIndicator[]).map((indicator) => ({
    indicator,
    label: INDICATOR_META[indicator].label,
    unit: INDICATOR_META[indicator].unit,
    available: false,
    unavailableReason: reason,
    chartPoints: [],
    latest: null,
  }));
}

function buildIndicatorProfile(
  indicator: GrowthIndicator,
  birthDate: string,
  measurements: MeasurementInput[],
  references: ReferencePoint[],
): GrowthIndicatorProfile {
  const meta = INDICATOR_META[indicator];
  const indicatorReferences = references.filter((row) => row.indicator === indicator).sort((left, right) => left.ageMonths - right.ageMonths);

  if (indicatorReferences.length === 0) {
    return {
      indicator,
      label: meta.label,
      unit: meta.unit,
      available: false,
      unavailableReason: "No hay referencia OMS disponible para este indicador.",
      chartPoints: [],
      latest: null,
    };
  }

  const referenceByAge = new Map(indicatorReferences.map((row) => [row.ageMonths, row]));
  const measurementsByAge = new Map<number, MeasurementInput>();
  const metrics: GrowthLatestMetric[] = [];
  const minAge = indicatorReferences[0]?.ageMonths ?? 0;
  const maxAge = indicatorReferences[indicatorReferences.length - 1]?.ageMonths ?? 0;

  for (const measurement of measurements) {
    const ageMonths = ageInMonths(birthDate, measurement.measuredAt);
    const value = getMeasurementValue(indicator, measurement);
    if (ageMonths == null || value == null || ageMonths < minAge || ageMonths > maxAge) continue;

    const reference = referenceByAge.get(ageMonths);
    if (!reference) continue;

    const zScore = calculateZScore(reference, value);
    if (!measurementsByAge.has(ageMonths)) {
      measurementsByAge.set(ageMonths, measurement);
    }
    metrics.push({
      value: roundMetric(value),
      zScore: roundMetric(zScore, 2),
      percentile: zToPercentile(zScore),
      ageMonths,
      measuredAt: measurement.measuredAt,
      classification: indicator === "bmi_for_age" ? classifyBmiZScore(zScore) : null,
    });
  }

  const chartPoints = indicatorReferences.map((reference) => {
    const measurement = measurementsByAge.get(reference.ageMonths);
    const playerValue = measurement ? getMeasurementValue(indicator, measurement) : null;
    return {
      ageMonths: reference.ageMonths,
      ageYears: roundMetric(reference.ageMonths / 12, 2),
      p3: roundMetric(lmsToValue(reference.l, reference.m, reference.s, PERCENTILE_Z.p3)),
      p15: roundMetric(lmsToValue(reference.l, reference.m, reference.s, PERCENTILE_Z.p15)),
      p50: roundMetric(lmsToValue(reference.l, reference.m, reference.s, PERCENTILE_Z.p50)),
      p85: roundMetric(lmsToValue(reference.l, reference.m, reference.s, PERCENTILE_Z.p85)),
      p97: roundMetric(lmsToValue(reference.l, reference.m, reference.s, PERCENTILE_Z.p97)),
      playerValue: playerValue == null ? null : roundMetric(playerValue),
    };
  });

  const latest = metrics.sort((left, right) => right.measuredAt.localeCompare(left.measuredAt))[0] ?? null;
  const hasMeasurements = measurements.length > 0;

  return {
    indicator,
    label: meta.label,
    unit: meta.unit,
    available: metrics.length > 0,
    unavailableReason: getUnavailableReason(indicator, hasMeasurements, minAge, maxAge),
    chartPoints,
    latest,
  };
}

function getUnavailableReason(indicator: GrowthIndicator, hasMeasurements: boolean, minAge: number, maxAge: number) {
  if (!hasMeasurements) return "Aun no hay mediciones para graficar.";
  if (indicator === "weight_for_age") {
    return "Peso para la edad OMS solo esta disponible de 5 a 10 anos.";
  }
  return `La referencia OMS disponible cubre de ${Math.floor(minAge / 12)} a ${Math.floor(maxAge / 12)} anos.`;
}
