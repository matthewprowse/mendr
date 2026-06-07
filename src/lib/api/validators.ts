import { z } from 'zod';
export const emailSchema = z.string().email();
export const phoneSchema = z.string().min(7).max(15);
export const uuidSchema = z.string().uuid();
export const paginationSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
});
