import { z } from "zod";

export const PaginationSchema = z.object({
  page: z
    .string()
    .optional()
    .default("1")
    .transform(Number)
    .pipe(z.number().int().min(1, "page must be >= 1")),
  limit: z
    .string()
    .optional()
    .default("20")
    .transform(Number)
    .pipe(z.number().int().min(1).max(100, "limit must be between 1 and 100")),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;
