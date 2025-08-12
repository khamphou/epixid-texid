import type { z } from 'zod';

export declare const modeConfigSchema: z.ZodTypeAny;
export type ModeConfig = z.infer<typeof modeConfigSchema>;
export default modeConfigSchema;
