import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { getPermissionContext } from "@/lib/auth/permissions";
import { directorReadOnlyRequestAllowed } from "@/lib/auth/director-readonly-policy";

export default async function InicioPage() {
  const context = await getPermissionContext();

  const cards = [
    ...(context?.hasOperationalReadAccess
      ? [
          {
            href: "/caja",
            title: "Caja",
            description: context.isDirectorReadOnly ? "Operacion diaria." : "Cobros, cuenta actual y operacion diaria.",
          },
          {
            href: "/players",
            title: "Jugadores",
            description: "Busqueda, cuentas, incidencias y seguimiento.",
          },
        ]
      : []),
    ...(context?.hasPlayerDataAccess && !context.hasOperationalAccess
      ? [
          {
            href: "/players",
            title: "Jugadores",
            description: "Roster, grupos y datos generales de jugadores.",
          },
          {
            href: "/datos-faltantes",
            title: "Datos faltantes",
            description: "Captura rapida de telefonos y datos de tutores.",
          },
        ]
      : []),
    ...(context?.hasPlayerRosterAccess && !context.hasPlayerDataAccess && !context.hasOperationalReadAccess
      ? [
          {
            href: "/players",
            title: "Jugadores",
            description: "Roster por grupos y movimientos de entrenamiento.",
          },
        ]
      : []),
    ...(context?.hasSportsReadAccess
      ? [
          {
            href: "/sports-signups",
            title: "Inscripciones Torneos",
            description: context.isDirectorReadOnly ? "Equipos y jugadores inscritos." : "Vista rapida de jugadores con productos de torneo pagados.",
          },
        ]
      : []),
    ...(context?.hasNutritionReadAccess
      ? [
          {
            href: "/nutrition",
            title: "Nutricion",
            description: "Panel de seguimiento y pendientes de primera toma.",
          },
          {
            href: "/nutrition/measurements",
            title: "Toma de medidas",
            description: "Jugadores activos, historial corporal y nuevas capturas.",
          },
        ]
      : []),
    ...(context?.hasAttendanceReadAccess
      ? [
          {
            href: "/attendance",
            title: "Asistencia de hoy",
            description: "Sesiones del dia para tomar asistencia en cancha.",
          },
          {
            href: "/attendance/groups",
            title: "Grupos y asistencia",
            description: "Vista mensual de grupos, sesiones y asistencia registrada.",
          },
        ]
      : []),
    ...(context?.isDirector || context?.isDirectorReadOnly
      ? [
          {
            href: "/dashboard",
            title: "Panel",
            description: context.isDirectorReadOnly ? "Indicadores operativos y tendencias." : "KPIs operativos, cobranza y tendencias.",
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
            Usa este inicio como entrada rapida.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.filter((card) => !context?.isDirectorReadOnly || directorReadOnlyRequestAllowed("GET", card.href, true)).map((card) => (
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
