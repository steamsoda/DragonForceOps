import type { WeeklyCallupDetailData } from "@/lib/queries/weekly-callups";
import type { WeeklyCallupPngData } from "@/lib/weekly-callups/png-layout";

export function buildWeeklyCallupPngData(callup: WeeklyCallupDetailData): WeeklyCallupPngData {
  return {
    tournamentName: "Rol de juegos",
    campusName: callup.campusName,
    program: callup.program,
    weekStart: callup.weekStart,
    weekEnd: callup.weekEnd,
    categories: callup.categories.map((category) => ({
      id: category.id,
      categoryLabel: category.categoryLabel,
      trainingGroupName: formatParentFacingTeamTitle({
        program: callup.program,
        categoryLabel: category.categoryLabel,
        teamName: category.trainingGroupName,
      }),
      tournamentName: category.tournamentName,
      coachNames: category.coachNames,
      isRest: category.isRest,
      games: category.games.map((game) => ({
        matchDate: game.matchDate,
        arrivalTime: game.arrivalTime,
        venue: game.venue,
        opponent: game.opponent,
        players: game.players
          .filter((player) => player.rosterStatus === "included")
          .map((player) => ({ id: player.enrollmentId, playerName: player.playerName })),
      })),
      players: category.players
        .filter((player) => player.rosterStatus === "included")
        .map((player) => ({ id: player.id, playerName: player.playerName })),
    })),
  };
}

function formatParentFacingTeamTitle({
  program,
  categoryLabel,
  teamName,
}: {
  program: WeeklyCallupDetailData["program"];
  categoryLabel: string;
  teamName: string;
}) {
  const teamColor = /\bazul\b/i.test(teamName)
    ? "AZUL"
    : /\bblanco\b/i.test(teamName)
      ? "BLANCO"
      : null;
  const genderLabel = /\bfemenil\b/i.test(teamName) ? "FEMENIL" : null;
  const baseTitle = program === "selectivo"
    ? ["SELECTIVO", categoryLabel, genderLabel].filter(Boolean).join(" ")
    : [categoryLabel, genderLabel].filter(Boolean).join(" ");

  if (!teamColor) return baseTitle;
  return program === "selectivo"
    ? `${baseTitle} - ${teamColor}`
    : `${baseTitle} ${teamColor}`;
}
