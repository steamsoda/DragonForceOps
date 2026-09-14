import { z } from "zod";

const count = z.number().int().nonnegative();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const trialsReadSchema = z.object({
  campuses: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
  selectedCampusId: z.string(), q: z.string(), selectedStatus: z.enum(["all", "active", "converted", "closed"]),
  page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100), totalRows: count,
  prospects: z.array(z.object({
    id: z.string().uuid(), campusName: z.string(), firstName: z.string(), lastName: z.string(), birthDate: date,
    gender: z.enum(["male", "female"]), guardianName: z.string().nullable(), guardianPhone: z.string(),
    status: z.enum(["active", "converted", "closed"]), preferredGroupName: z.string(),
    visits: z.array(z.object({ id: z.string().uuid(), visitDate: date, visitNumber: z.number().int().positive(), groupName: z.string(), coachNames: z.array(z.string()) }).strict()),
  }).strict()),
  report: z.object({
    dateFrom: date, dateTo: date, registeredProspects: count, convertedProspects: count, visits: count,
    visitingProspects: count, birthYears: z.array(z.object({ birthYear: z.number().int().nullable(), count }).strict()),
  }).strict(),
}).strict();
