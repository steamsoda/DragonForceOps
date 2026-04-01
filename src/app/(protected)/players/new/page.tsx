import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { EnrollmentIntakeForm } from "@/components/enrollments/enrollment-intake-form";
import { getEnrollmentIntakeContext } from "@/lib/queries/enrollments";
import { isReturningInscriptionMode, type ReturningInscriptionMode } from "@/lib/enrollments/returning";

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del formulario son invalidos.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  guardian_failed: "No se pudo registrar al tutor. Intenta de nuevo.",
  player_failed: "No se pudo registrar al jugador. Intenta de nuevo.",
  link_failed: "Error interno al vincular tutor. Intenta de nuevo.",
  config_error: "Falta configuracion de cargos o precios para completar la inscripcion.",
  enrollment_failed: "No se pudo crear la inscripcion. Intenta de nuevo.",
  charges_failed: "No se pudieron crear los cargos iniciales. Intenta de nuevo.",
};

export default async function NewPlayerPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string; returning?: string; returnMode?: string }>;
}) {
  const query = await searchParams;
  const intakeContext = await getEnrollmentIntakeContext();
  const errorMessage = query.err ? (errorMessages[query.err] ?? "Ocurrio un error.") : null;
  const isReturning = query.returning === "1";
  const initialReturnMode: ReturningInscriptionMode = isReturningInscriptionMode(query.returnMode)
    ? query.returnMode
    : "full";

  return (
    <PageShell
      title="Nuevo jugador"
      subtitle="Registro completo: jugador, tutor, inscripcion y envio directo a Caja"
      breadcrumbs={[{ label: "Jugadores", href: "/players" }, { label: "Nuevo jugador" }]}
    >
      <div className="space-y-4">
        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {errorMessage}
          </div>
        )}

        <div className="text-sm">
          <Link href="/players" className="text-portoBlue hover:underline">
            Volver a Jugadores
          </Link>
        </div>

        <EnrollmentIntakeForm
          campuses={intakeContext.campuses}
          planCode={intakeContext.planCode}
          pricingVersions={intakeContext.pricingVersions}
          defaultStartDate={intakeContext.defaultStartDate}
          initialIsReturning={isReturning}
          initialReturnInscriptionMode={initialReturnMode}
        />
      </div>
    </PageShell>
  );
}
