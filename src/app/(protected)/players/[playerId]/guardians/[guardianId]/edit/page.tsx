import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/ui/page-shell";
import { createClient } from "@/lib/supabase/server";
import { GuardianForm } from "@/components/players/guardian-form";
import { updateGuardianAction } from "@/server/actions/players";

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "Nombre, apellido y teléfono principal son requeridos.",
  update_failed: "No se pudo guardar. Intenta de nuevo.",
};

type PageProps = {
  params: Promise<{ playerId: string; guardianId: string }>;
  searchParams: Promise<{ err?: string }>;
};

type GuardianRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone_primary: string;
  phone_secondary: string | null;
  email: string | null;
  relationship_label: string | null;
};

export default async function EditGuardianPage({ params, searchParams }: PageProps) {
  const { playerId, guardianId } = await params;
  const { err } = await searchParams;

  const supabase = await createClient();

  // Verify guardian belongs to player
  const { data: link } = await supabase
    .from("player_guardians")
    .select("guardian_id")
    .eq("player_id", playerId)
    .eq("guardian_id", guardianId)
    .maybeSingle();

  if (!link) notFound();

  const { data: guardian } = await supabase
    .from("guardians")
    .select("id, first_name, last_name, phone_primary, phone_secondary, email, relationship_label")
    .eq("id", guardianId)
    .maybeSingle()
    .returns<GuardianRow | null>();

  if (!guardian) notFound();

  // Also fetch player name for the breadcrumb
  const { data: player } = await supabase
    .from("players")
    .select("first_name, last_name")
    .eq("id", playerId)
    .maybeSingle<{ first_name: string; last_name: string }>();

  if (!player) redirect(`/players`);

  const playerName = `${player.first_name} ${player.last_name}`;
  const action = updateGuardianAction.bind(null, playerId, guardianId);

  return (
    <PageShell
      title="Editar tutor"
      breadcrumbs={[
        { label: "Jugadores", href: "/players" },
        { label: playerName, href: `/players/${playerId}` },
        { label: "Editar tutor" },
      ]}
    >
      <div className="max-w-lg">
        <GuardianForm
          action={action}
          defaultValues={{
            firstName: guardian.first_name,
            lastName: guardian.last_name,
            phonePrimary: guardian.phone_primary,
            phoneSecondary: guardian.phone_secondary,
            email: guardian.email,
            relationshipLabel: guardian.relationship_label,
          }}
          errorMessage={err ? (ERROR_MESSAGES[err] ?? "Ocurrió un error.") : null}
        />
      </div>
    </PageShell>
  );
}
