import { z } from "zod";

export const uniformsReadSchema = z.object({
  campuses: z.array(z.object({ id: z.string().uuid(), name: z.string() }).strict()),
  selectedCampusId: z.string(), selectedType: z.enum(["", "training", "game"]),
  selectedQueue: z.enum(["all", "pending_order", "ordered", "pending_delivery", "delivered"]), q: z.string(),
  page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100), totalRows: z.number().int().nonnegative(),
  counts: z.object({ pendingOrder: z.number().int().nonnegative(), ordered: z.number().int().nonnegative(), delivered: z.number().int().nonnegative() }).strict(),
  rows: z.array(z.object({
    id: z.string().uuid(), playerName: z.string(), campusId: z.string().uuid(), campusName: z.string(), birthYear: z.number().int().nullable(),
    uniformType: z.enum(["training", "game"]), size: z.string().nullable(), status: z.enum(["pending_order", "ordered", "delivered"]),
    orderedAt: z.string().datetime({ offset: true }).nullable(), deliveredAt: z.string().datetime({ offset: true }).nullable(),
  }).strict()),
}).strict();
