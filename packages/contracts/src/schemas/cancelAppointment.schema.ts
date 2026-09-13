import { z } from 'zod';

// spec.md SCH-32: motivo opcional do cancelamento pelo operador — mesmo
// molde de rejectOrder.schema.ts.
export const cancelAppointmentSchema = z
  .object({
    reason: z.string().trim().max(500, 'reason inválido').optional(),
  })
  .strict();

export type CancelAppointment = z.infer<typeof cancelAppointmentSchema>;
