import { z } from 'zod';
import { weeklyScheduleSchema } from './createProfessional.schema.js';

// spec.md SCH-01/02/03: PATCH aceita qualquer subconjunto dos mesmos campos
// de createProfessionalSchema — inclusive `active` (SCH-05, professional
// pausado sem apagar histórico) — todos opcionais, mesmas regras quando
// presentes.
export const updateProfessionalSchema = z
  .object({
    name: z.string().trim().min(1, 'name é obrigatório').max(200, 'name inválido').optional(),
    slotDurationMinutes: z
      .number()
      .int('slotDurationMinutes deve ser inteiro')
      .min(5, 'slotDurationMinutes inválido')
      .max(480, 'slotDurationMinutes inválido')
      .optional(),
    weeklySchedule: weeklyScheduleSchema.optional(),
    active: z.boolean().optional(),
  })
  .strict();

export type UpdateProfessional = z.infer<typeof updateProfessionalSchema>;
