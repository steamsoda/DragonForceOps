import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { EnrollmentDropoutForm } from "@/components/enrollments/enrollment-dropout-form";
import { getEnrollmentDropoutContext } from "@/lib/queries/enrollments";
import { dropoutEnrollmentAction } from "@/server/actions/enrollments";

const errorMessages: Record<string, string> = {
  invalid_form: "Debes capturar una fecha valida y seleccionar un motivo de baja.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  not_found: "No se encontro la inscripcion.",
  not_active: "Solo se puede dar de baja una inscripcion activa.",
  update_failed: "No se pudo registrar la baja. Intenta de nuevo.",
};

type SearchParams = Promise<{ err?: string }>;

export default async function EnrollmentDropoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ playerId: string; enrollmentId: string }>;
  searchParams: SearchParams;
}) {
  const { playerId, enrollmentId } = await params;
  const query = await searchParams;
  const context = await getEnrollmentDropoutContext(enrollmentId);

  if (!context) notFound();

  const errorMessage = query.err ? errorMessages[query.err] ?? "Ocurrio un error." : null;
  const submit = dropoutEnrollmentAction.bind(null, enrollmentId, playerId);

  return (
    <PageShell
      title="Dar de baja"
      subtitle={`${context.enrollment.playerName} - ${context.enrollment.campusName}`}
      breadcrumbs={[
        { label: "Jugadores", href: "/players" },
        { label: context.enrollment.playerName, href: `/players/${playerId}` },
        { label: "Dar de baja" },
      ]}
    >
      <div className="space-y-4">
        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        ) : null}

        <div className="text-sm">
          <Link href={`/players/${playerId}`} className="text-portoBlue hover:underline">
            Volver al jugador
          </Link>
        </div>

        <EnrollmentDropoutForm enrollment={context.enrollment} action={submit} />
      </div>
    </PageShell>
  );
}
