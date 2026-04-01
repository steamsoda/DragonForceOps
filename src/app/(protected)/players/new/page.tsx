import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { PlayerCreateForm } from "@/components/players/player-form";
import { createPlayerAction } from "@/server/actions/players";

const errorMessages: Record<string, string> = {
  invalid_form: "Los datos del formulario son invalidos.",
  unauthenticated: "Tu sesion no es valida. Vuelve a iniciar sesion.",
  guardian_failed: "No se pudo registrar al tutor. Intenta de nuevo.",
  player_failed: "No se pudo registrar al jugador. Intenta de nuevo.",
  link_failed: "Error interno al vincular tutor. Intenta de nuevo."
};

export default async function NewPlayerPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string; returning?: string }>;
}) {
  const query = await searchParams;
  const errorMessage = query.err ? (errorMessages[query.err] ?? "Ocurrio un error.") : null;
  const isReturning = query.returning === "1";

  return (
    <PageShell
      title="Nuevo jugador"
      subtitle="Registra al jugador y su tutor principal"
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

        <PlayerCreateForm action={createPlayerAction} initialIsReturning={isReturning} />
      </div>
    </PageShell>
  );
}
