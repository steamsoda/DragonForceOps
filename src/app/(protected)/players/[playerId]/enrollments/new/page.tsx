import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { requireOperationalContext } from "@/lib/auth/permissions";
import { getEnrollmentCreateFormContext } from "@/lib/queries/enrollments";
import { EnrollmentCreateForm } from "@/components/enrollments/enrollment-form";
import { createEnrollmentAction } from "@/server/actions/enrollments";

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del formulario son invalidos. Revisa los campos.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  player_not_found: "No se encontro al jugador.",
  already_enrolled: "El jugador ya tiene una inscripcion activa.",
  returning_required: "Este jugador tiene una inscripcion anterior. Confirma su reinscripcion y la conciliacion de credito antes de continuar.",
  config_error: "Error de configuracion: tipos de cargo no encontrados. Contacta al administrador.",
  enrollment_failed: "No se pudo crear la inscripcion. Intenta de nuevo.",
  charges_failed: "No se pudo completar la inscripcion ni generar sus cargos. Intenta de nuevo.",
  training_group_invalid: "El grupo seleccionado ya no es compatible. Revisa campus, programa, categoria y genero.",
  training_group_assignment_failed: "No se pudo asignar el grupo. La inscripcion no fue creada; intenta de nuevo.",
  credit_reconciliation_failed: "No se pudo conciliar el credito de la cuenta anterior. No se creo la nueva inscripcion.",
};

export default async function EnrollmentCreatePage({
  params,
  searchParams
}: {
  params: Promise<{ playerId: string }>;
  searchParams: Promise<{ err?: string; returning?: string; returnMode?: string }>;
}) {
  const { playerId } = await params;
  const query = await searchParams;
  await requireOperationalContext("/unauthorized");
  const context = await getEnrollmentCreateFormContext(playerId);

  if (!context) notFound();

  const errorMessage = query.err ? (errorMessages[query.err] ?? "Ocurrio un error.") : null;
  const isReturning = query.returning === "1";
  const initialReturnInscriptionMode =
    query.returnMode === "inscription_only" || query.returnMode === "waived" ? query.returnMode : "full";
  const submit = createEnrollmentAction.bind(null, playerId);
  const pageTitle = isReturning ? "Reinscribir jugador" : "Nueva inscripcion";

  return (
    <PageShell
      title={pageTitle}
      subtitle={isReturning ? `${context.player.fullName} - Reingreso` : context.player.fullName}
      breadcrumbs={[
        { label: "Jugadores", href: "/players" },
        { label: context.player.fullName, href: `/players/${playerId}` },
        { label: pageTitle }
      ]}
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        {context.hasActiveEnrollment && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Este jugador ya tiene una inscripcion activa. No se puede crear otra.
          </div>
        )}

        <div className="text-sm">
          <Link href={`/players/${playerId}`} className="text-portoBlue hover:underline">
            Volver al jugador
          </Link>
        </div>

        {context.pricingVersions.length === 0 ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            No hay un plan de precios activo. Configura uno antes de crear inscripciones.
          </div>
        ) : (
          <EnrollmentCreateForm
            campuses={context.campuses}
            planCode={context.planCode}
            pricingVersions={context.pricingVersions}
            defaultStartDate={context.defaultStartDate}
            isReturning={isReturning}
            initialReturnInscriptionMode={initialReturnInscriptionMode}
            playerBirthDate={context.player.birthDate}
            playerGender={context.player.gender}
            trainingGroups={context.trainingGroups}
            returningAccountSummary={context.returningAccountSummary}
            action={submit}
          />
        )}
      </div>
    </PageShell>
  );
}
