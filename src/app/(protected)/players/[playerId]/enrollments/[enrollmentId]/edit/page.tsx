import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { getEnrollmentEditContext } from "@/lib/queries/enrollments";
import { EnrollmentEditForm } from "@/components/enrollments/enrollment-edit-form";
import { updateEnrollmentAction } from "@/server/actions/enrollments";

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del formulario son invalidos.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  not_found: "No se encontro la inscripcion.",
  update_failed: "No se pudo guardar el cambio. Intenta de nuevo."
};

export default async function EnrollmentEditPage({
  params,
  searchParams
}: {
  params: Promise<{ playerId: string; enrollmentId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { playerId, enrollmentId } = await params;
  const query = await searchParams;
  const context = await getEnrollmentEditContext(enrollmentId);

  if (!context) notFound();

  const errorMessage = query.err ? (errorMessages[query.err] ?? "Ocurrio un error.") : null;
  const submit = updateEnrollmentAction.bind(null, enrollmentId, playerId);

  return (
    <PageShell
      title="Editar inscripcion"
      subtitle={`${context.enrollment.playerName} · ${context.enrollment.campusName}`}
      breadcrumbs={[
        { label: "Jugadores", href: "/players" },
        { label: context.enrollment.playerName, href: `/players/${playerId}` },
        { label: "Editar inscripcion" }
      ]}
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        <div className="text-sm">
          <div className="flex flex-wrap gap-4">
            <Link href={`/players/${playerId}`} className="text-portoBlue hover:underline">
              Volver al jugador
            </Link>
            {context.enrollment.status === "active" ? (
              <Link
                href={`/players/${playerId}/enrollments/${enrollmentId}/dropout`}
                className="text-rose-600 hover:underline"
              >
                Dar de baja
              </Link>
            ) : null}
          </div>
        </div>

        <EnrollmentEditForm
          enrollment={context.enrollment}
          campuses={context.campuses}
          action={submit}
        />
      </div>
    </PageShell>
  );
}
