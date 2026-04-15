import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { getPermissionContext } from "@/lib/auth/permissions";

export default async function InicioPage() {
  const context = await getPermissionContext();

  const cards = [
    ...(context?.hasOperationalAccess
      ? [
          {
            href: "/caja",
            title: "Caja",
            description: "Cobros, cuenta actual y operación diaria.",
          },
          {
            href: "/players",
            title: "Jugadores",
            description: "Búsqueda, cuentas, incidencias y seguimiento.",
          },
        ]
      : []),
    {
      href: "/sports-signups",
      title: "Inscripciones Torneos",
      description: "Vista rápida de jugadores con productos de torneo pagados.",
    },
    ...(context?.isDirector
      ? [
          {
            href: "/dashboard",
            title: "Panel",
            description: "KPIs operativos, cobranza y tendencias.",
          },
        ]
      : []),
  ];

  return (
    <PageShell title="Inicio" subtitle="Punto de entrada operativo">
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900/60">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Bienvenido</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Usa este inicio como entrada rápida. Muestra solamente los accesos útiles para tu rol y evita abrir el
            dashboard financiero por defecto cuando no corresponde.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-portoBlue hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-800"
            >
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{card.title}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{card.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </PageShell>
  );
}
