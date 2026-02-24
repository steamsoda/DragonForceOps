type PageShellProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export function PageShell({ title, subtitle, children }: PageShellProps) {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 px-6 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
      </header>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">{children}</section>
    </main>
  );
}
