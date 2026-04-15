import Link from "next/link";

type KpiCardProps = {
  label: string;
  value: string;
  description: string;
  href?: string;
};

export function KpiCard({ label, value, description, href }: KpiCardProps) {
  const content = (
    <article className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{description}</p>
    </article>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block transition hover:-translate-y-0.5 hover:opacity-95">
      {content}
    </Link>
  );
}

