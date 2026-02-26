type TrendCardProps = {
  label: string;
  currentValue: string;
  previousValue: string;
  currentRaw: number;
  previousRaw: number;
  description: string;
};

function getDelta(current: number, previous: number) {
  if (previous === 0) {
    return {
      amount: current,
      percent: current === 0 ? 0 : 100
    };
  }

  return {
    amount: current - previous,
    percent: ((current - previous) / previous) * 100
  };
}

export function TrendCard({
  label,
  currentValue,
  previousValue,
  currentRaw,
  previousRaw,
  description
}: TrendCardProps) {
  const delta = getDelta(currentRaw, previousRaw);
  const sign = delta.amount > 0 ? "+" : delta.amount < 0 ? "-" : "";
  const toneClass =
    delta.amount > 0 ? "text-emerald-700" : delta.amount < 0 ? "text-rose-700" : "text-slate-700";

  return (
    <article className="rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{currentValue}</p>
      <p className="mt-1 text-xs text-slate-600">Mes anterior: {previousValue}</p>
      <p className={`mt-1 text-xs font-medium ${toneClass}`}>
        {sign}
        {Math.abs(delta.percent).toFixed(1)}% contra mes anterior
      </p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
    </article>
  );
}
