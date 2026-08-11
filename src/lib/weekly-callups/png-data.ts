import type { WeeklyCallupDetailData } from "@/lib/queries/weekly-callups";
import type { WeeklyCallupPngData } from "@/lib/weekly-callups/png-layout";

export function buildWeeklyCallupPngData(callup: WeeklyCallupDetailData): WeeklyCallupPngData {
  const tournamentNames = [...new Set(callup.categories.map((category) => category.tournamentName))];
  const packetTitle = tournamentNames.length > 1
    ? "Convocatoria semanal"
    : tournamentNames[0] ?? callup.tournamentName;

  return {
    tournamentName: packetTitle,
    campusName: callup.campusName,
    program: callup.program,
    weekStart: callup.weekStart,
    weekEnd: callup.weekEnd,
    categories: callup.categories.map((category) => ({
      id: category.id,
      categoryLabel: category.categoryLabel,
      trainingGroupName: category.trainingGroupName,
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
