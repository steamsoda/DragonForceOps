import fs from "node:fs";

const board = fs.readFileSync("src/components/sports/sports-signups-board.tsx", "utf8");
const review = fs.readFileSync("src/components/sports/competition-roster-invitation-review.tsx", "utf8");
const actions = fs.readFileSync("src/server/actions/competition-rosters.ts", "utf8");

const checks = [
  [board.includes("CompetitionRosterInvitationReview"), "Inscripciones Torneos must render the invitation review helper."],
  [board.includes("reviewPlayers={selectedCompetitionBase?.eligibilityReviewPlayers ?? []}"), "The helper must receive all campus review records, even when filtering by program."],
  [review.includes("Asignar invitado"), "The helper must use the Invitado language."],
  [review.includes("Su grupo de entrenamiento, inscripción, asistencia y pago no cambiarán."), "The confirmation must explain the unchanged operational records."],
  [review.includes("setCompetitionRosterManualMemberInlineAction"), "Invited assignments must reuse the audited durable manual-membership action."],
  [review.includes("assignedIds.has(player.enrollmentId)"), "Resolved invitations must disappear from the review queue."],
  [!review.toLowerCase().includes("no participará"), "The helper must not provide a silent no-participation action."],
  [
    actions.includes("inlineManagerContext({ tournamentId, campusId, program })")
      && actions.includes('inlineErrorMessage("squad_permission_denied")'),
    "The server action must retain sports-manager authorization.",
  ],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length > 0) {
  console.error(failures.map((message) => `- ${message}`).join("\n"));
  process.exit(1);
}

console.log("Competition roster invitation review assertions passed.");
