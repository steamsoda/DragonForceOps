import { z } from "zod";

const count = z.number().int().nonnegative();
const guardian = z.object({
  id: z.string().uuid(), firstName: z.string(), lastName: z.string(), fullName: z.string(),
  phonePrimary: z.string(), phoneSecondary: z.string(), email: z.string(), relationshipLabel: z.string(), isPrimary: z.boolean(),
}).strict();
export const contactsReadSchema = z.object({
  campuses: z.array(z.object({ id: z.string().uuid(), name: z.string(), code: z.string() }).strict()),
  selectedCampusId: z.string(), selectedBirthYear: z.number().int().nullable(), selectedGender: z.enum(["male", "female", ""]),
  birthYears: z.array(z.number().int()), q: z.string(),
  status: z.enum(["incomplete", "missing_primary_phone", "missing_secondary_phone", "missing_email", "missing_guardian", "all"]),
  counts: z.object({ incomplete: count, missing_primary_phone: count, missing_secondary_phone: count, missing_email: count, missing_guardian: count, all: count }).strict(),
  rows: z.array(z.object({
    enrollmentId: z.string().uuid(), playerId: z.string().uuid(), publicPlayerId: z.string(), playerName: z.string(),
    birthYear: z.number().int().nullable(), campusId: z.string().uuid(), campusName: z.string(), campusCode: z.string(),
    trainingGroupName: z.string(), trainingGroupSubtitle: z.string(), guardians: z.array(guardian), primaryGuardian: guardian.nullable(),
    missingGuardian: z.boolean(), missingGuardianName: z.boolean(), missingPrimaryPhone: z.boolean(), missingSecondaryPhone: z.boolean(), missingEmail: z.boolean(),
  }).strict()),
}).strict();
