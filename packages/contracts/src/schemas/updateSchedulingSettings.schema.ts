import { z } from 'zod';

// spec.md SCH-06: teto de horários por resposta, configurável por tenant,
// faixa 1..50 (0 e 51 rejeitados — mesmo teto de sanidade de create_order).
export const updateSchedulingSettingsSchema = z
  .object({
    maxSlotsPerResponse: z
      .number()
      .int('maxSlotsPerResponse deve ser inteiro')
      .min(1, 'maxSlotsPerResponse inválido')
      .max(50, 'maxSlotsPerResponse inválido'),
  })
  .strict();

export type UpdateSchedulingSettings = z.infer<typeof updateSchedulingSettingsSchema>;
