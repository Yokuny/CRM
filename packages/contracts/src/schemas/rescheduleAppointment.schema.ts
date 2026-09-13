import { z } from 'zod';
import { idSchema } from './id.schema.js';

// spec.md SCH-31: novo horário (hora de parede, AD-036) e, opcionalmente,
// outro profissional.
export const rescheduleAppointmentSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date inválida (YYYY-MM-DD)'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time inválido (HH:mm)'),
    professionalId: idSchema.optional(),
  })
  .strict();

export type RescheduleAppointment = z.infer<typeof rescheduleAppointmentSchema>;
