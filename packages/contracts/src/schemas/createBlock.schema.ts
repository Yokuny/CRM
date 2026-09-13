import { z } from 'zod';
import { idSchema } from './id.schema.js';

// spec.md SCH-33: bloqueio de horário (folga, feriado, reunião) — hora de
// parede (AD-036) nas duas pontas. `end` combinado (data+hora) precisa ser
// estritamente depois do `start` combinado; comparar as strings
// zero-padded `${date}T${time}` já ordena corretamente (formato ISO-like).
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createBlockSchema = z
  .object({
    professionalId: idSchema,
    startDate: z.string().regex(DATE_REGEX, 'startDate inválida (YYYY-MM-DD)'),
    startTime: z.string().regex(TIME_REGEX, 'startTime inválido (HH:mm)'),
    endDate: z.string().regex(DATE_REGEX, 'endDate inválida (YYYY-MM-DD)'),
    endTime: z.string().regex(TIME_REGEX, 'endTime inválido (HH:mm)'),
    title: z.string().trim().min(1, 'title é obrigatório').max(120, 'title inválido'),
  })
  .strict()
  .refine((block) => `${block.endDate}T${block.endTime}` > `${block.startDate}T${block.startTime}`, {
    message: 'o fim do bloqueio deve ser depois do início',
    path: ['endTime'],
  });

export type CreateBlock = z.infer<typeof createBlockSchema>;
