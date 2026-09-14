import { z } from "zod";

const count = z.number().int().nonnegative();
const workflow = z.enum(["all", "pending_sports", "pending_nutrition", "complete"]);
const totals = { total: count, pendingSports: count, pendingNutrition: count, complete: count };
export const intakeReadSchema = z.object({
  campuses: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
  selectedCampusId: z.string(), selectedStartDate: z.string(), selectedEndDate: z.string(),
  selectedBirthYear: z.string(), selectedStatus: workflow,
  campusBoards: z.array(z.object({ campusId: z.string().uuid(), campusName: z.string(), ...totals }).strict()),
  birthYearOptions: z.array(z.number().int()), totals: z.object(totals).strict(),
  access: z.object({ canOpenSports: z.literal(false), canOpenNutrition: z.literal(false), canOpenPlayer: z.literal(false) }).strict(),
  rows: z.array(z.object({
    enrollmentId: z.string().uuid(), playerId: z.string().uuid(), playerName: z.string(),
    campusId: z.string().uuid(), campusName: z.string(), campusCode: z.string(), status: z.enum(["active", "ended", "cancelled"]),
    createdAt: z.string(), inscriptionDate: z.string().nullable(), birthYear: z.number().int().nullable(),
    gender: z.string().nullable(), genderLabel: z.string(), currentTeamId: z.string().uuid().nullable(),
    currentTeamName: z.string().nullable(), currentTrainingGroupId: z.string().uuid().nullable(),
    currentTrainingGroupName: z.string().nullable(), resolvedLevel: z.string().nullable(),
    sportsComplete: z.boolean(), nutritionComplete: z.boolean(),
    sportsActionHref: z.null(), nutritionActionHref: z.null(), playerActionHref: z.null(),
  }).strict()),
}).strict();
