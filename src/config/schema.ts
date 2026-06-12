import { z } from "zod";

export const configSchema = z.object({
    spaceId: z.string().optional(),
    spaceName: z.string().optional(),
    baseUrl: z.string().optional(),
    recallLimit: z.number().int().positive().default(5),
    debug: z.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;
