import { z } from "zod";

export const configSchema = z.object({
    spaceId: z.string().optional(),
    spaceName: z.string().optional(),
    baseUrl: z.string().optional(),
    recallLimit: z.number().int().positive().default(5),
    recallMode: z.enum(["auto", "always", "off"]).default("auto"),
    captureMode: z.enum(["auto", "off"]).default("auto"),
    debug: z.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;
