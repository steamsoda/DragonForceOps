import Link from "next/link";

type Breadcrumb = { label: string; href?: string };

type PageShellProps = {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  wide?: boolean;
};

export function PageShell({ title, subtitle, children, breadcrumbs, wide = false }: PageShellProps) {
  return (
    <main
      className={`mx-auto flex min-h-[calc(100vh-4rem)] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6 md:min-h-screen md:gap-5 md:py-8 print:min-h-0 print:max-w-none print:px-0 print:py-0 ${
        wide ? "max-w-[96rem]" : "max-w-6xl"
      }`}
    >
      <header className="space-y-1 print:mb-4">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400 print:hidden">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span>/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-portoBlue hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-700 dark:text-slate-300">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle ? <div className="text-sm text-slate-600 dark:text-slate-400">{subtitle}</div> : null}
      </header>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4 print:overflow-visible print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
        {children}
      </section>
    </main>
  );
}
