import fs from "node:fs";

const board = fs.readFileSync("src/components/sports/sports-signups-board.tsx", "utf8");
const review = fs.readFileSync("src/components/sports/competition-roster-invitation-review.tsx", "utf8");
const actions = fs.readFileSync("src/server/actions/competition-rosters.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260818120000_assign_competition_roster_invited_member.sql", "utf8");

const checks = [
  [board.includes("CompetitionRosterInvitationReview"), "Inscripciones Torneos must render the invitation review helper."],
  [board.includes("reviewPlayers={selectedCompetitionBase?.eligibilityReviewPlayers ?? []}"), "The helper must receive all campus review records, even when filtering by program."],
  [review.includes("Asignar invitado"), "The helper must use the Invitado language."],
  [review.includes("Su grupo de entrenamiento, inscripción, asistencia y pago no cambiarán."), "The confirmation must explain the unchanged operational records."],
  [review.includes("assignCompetitionRosterInvitedMemberInlineAction"), "Invited assignments must use the atomic reviewed-membership action."],
  [review.includes('member.source === "manual"'), "Only reviewed manual placements may resolve the invitation queue."],
  [review.includes('member.source === "paid"'), "Provisional paid placements must remain available for confirmation or reassignment."],
  [!review.toLowerCase().includes("no participará"), "The helper must not provide a silent no-participation action."],
  [
    actions.includes("inlineManagerContext({ tournamentId, campusId, program })")
      && actions.includes('inlineErrorMessage("squad_permission_denied")'),
    "The server action must retain sports-manager authorization.",
  ],
  [actions.includes('rpc("assign_competition_roster_invited_member"'), "The server action must call the atomic invited assignment RPC."],
  [migration.includes("delete from public.competition_roster_squad_members"), "The invited assignment must remove provisional tournament memberships atomically."],
  [migration.includes("'manual'"), "The reviewed destination membership must be durable across automatic refreshes."],
  [migration.includes("member.invited_assigned"), "The invited assignment must write an audit event."],
  [
    !migration.includes("update public.training_group_assignments")
      && !migration.includes("update public.charges")
      && !migration.includes("update public.payments")
      && !migration.includes("update public.payment_allocations"),
    "The invited assignment must not mutate training groups or finance.",
  ],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length > 0) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log("Competition roster invitation review assertions passed.");
