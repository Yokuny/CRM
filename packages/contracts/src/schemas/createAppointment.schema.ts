import { z } from 'zod';
import { idSchema } from './id.schema.js';

// spec.md SCH-30: encaixe do operador. Data e hora chegam em HORA DE PAREDE
// (`date`+`time`), nunca instante ISO (AD-036) — a conversão para UTC é uma
// implementação única no service (`wallClockToUtc`, packages/db).
export const createAppointmentSchema = z
  .object({
    customerId: idSchema,
    professionalId: idSchema,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date inválida (YYYY-MM-DD)'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time inválido (HH:mm)'),
    spaceId: idSchema.optional(),
    notes: z.string().trim().max(500, 'notes inválida').optional(),
  })
  .strict();

export type CreateAppointment = z.infer<typeof createAppointmentSchema>;
