type KpiCardProps = {
  label: string;
  value: string;
  description: string;
};

export function KpiCard({ label, value, description }: KpiCardProps) {
  return (
    <article className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
    </article>
  );
}

