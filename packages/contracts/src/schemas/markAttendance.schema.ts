import { z } from 'zod';

// spec.md SCH-34: comparecimento só pode virar completed ou no_show.
export const markAttendanceSchema = z
  .object({
    status: z.enum(['completed', 'no_show']),
  })
  .strict();

export type MarkAttendance = z.infer<typeof markAttendanceSchema>;
