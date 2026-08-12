import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildSportsSignupPacketPngSvg } from "../src/lib/sports-signups/png-layout";
import { buildWeeklyCallupPngSvg, type WeeklyCallupPngCategory } from "../src/lib/weekly-callups/png-layout";

const outputDirectory = join(process.cwd(), ".tmp", "png-polish");

function players(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    playerName: `${index % 2 ? "Amanda Mariana" : "Jose Antonio"} Garza Escobedo ${index + 1}`,
  }));
}

function category(index: number, playerCount: number): WeeklyCallupPngCategory {
  const roster = players(playerCount, `category-${index}`);
  return {
    id: `category-${index}`,
    categoryLabel: String(2021 - index),
    trainingGroupName: `${2021 - index}${index % 3 === 0 ? " Azul" : ""}`,
    tournamentName: index % 2 ? "Rosa Power Cup 13 Edicion" : "Superliga Regia 17 Edicion",
    coachNames: index % 2 ? "Arturo Gonzalez" : "Johan Villalba",
    isRest: index % 7 === 6,
    players: roster,
    games: index % 7 === 6 ? [] : [{
      matchDate: `2026-08-${String(10 + (index % 6)).padStart(2, "0")}`,
      arrivalTime: index % 2 ? "19:15" : "08:05",
      venue: `Linda Vista F${index + 1}`,
      opponent: `Rival Deportivo ${index + 1}`,
      players: roster,
    }],
  };
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const logo = await readFile(join(process.cwd(), "public", "logo Invicta-02.png"));
  const logoDataUrl = `data:image/png;base64,${logo.toString("base64")}`;

  const small = buildWeeklyCallupPngSvg({
    tournamentName: "Superliga Regia 17 Edicion",
    campusName: "Contry",
    program: "selectivo",
    weekStart: "2026-08-10",
    weekEnd: "2026-08-16",
    logoDataUrl,
    categories: [category(0, 14), category(1, 16)],
  });

  const large = buildWeeklyCallupPngSvg({
    tournamentName: "Convocatoria semanal",
    campusName: "Linda Vista",
    program: "futbol_para_todos",
    weekStart: "2026-08-10",
    weekEnd: "2026-08-16",
    logoDataUrl,
    categories: Array.from({ length: 14 }, (_, index) => category(index, 8 + (index * 7) % 22)),
  });

  const sportsGroups = Array.from({ length: 18 }, (_, index) => ({
    id: `group-${index}`,
    label: `${2022 - index}`,
    subtitle: `Categoria ${2022 - index}`,
    programLabel: "",
    players: players(5 + (index * 9) % 24, `sport-${index}`).map((player) => ({ ...player, birthYear: 2022 - index })),
  }));
  const sports = buildSportsSignupPacketPngSvg({
    competitionLabel: "Superliga Regia 17 Edicion",
    campusName: "Linda Vista",
    programLabel: "Todos los programas",
    paidFilterLabel: "Todos los pagos confirmados",
    totalConfirmed: sportsGroups.reduce((total, group) => total + group.players.length, 0),
    groups: sportsGroups,
  });

  await Promise.all([
    writeFile(join(outputDirectory, "weekly-small.svg"), small.svg),
    writeFile(join(outputDirectory, "weekly-large.svg"), large.svg),
    writeFile(join(outputDirectory, "sports-large.svg"), sports.svg),
    writeFile(
      join(outputDirectory, "dimensions.json"),
      JSON.stringify(
        {
          small: { width: small.width, height: small.height },
          large: { width: large.width, height: large.height },
          sports: { width: sports.width, height: sports.height },
        },
        null,
        2,
      ),
    ),
  ]);

  console.log(outputDirectory);
}

void main();
