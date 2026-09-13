import { z } from 'zod';

// spec.md SCH-01/02/03: grade semanal com 0..N janelas por weekday, horas de
// parede 'HH:mm' (AD-036 — nunca instante ISO). end>start por janela;
// janelas do mesmo weekday não podem se sobrepor (uma grade ambígua
// produziria slot duplicado) — adjacentes (fim 12:00 / início 12:00) são
// aceitas.
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const scheduleWindowSchema = z
  .object({
    weekday: z.number().int('weekday deve ser inteiro').min(0, 'weekday inválido').max(6, 'weekday inválido'),
    start: z.string().regex(TIME_REGEX, 'start inválido (HH:mm)'),
    end: z.string().regex(TIME_REGEX, 'end inválido (HH:mm)'),
  })
  .strict()
  .refine((window) => window.end > window.start, {
    message: 'end deve ser maior que start',
    path: ['end'],
  });

export const weeklyScheduleSchema = z.array(scheduleWindowSchema).superRefine((windows, ctx) => {
  const byWeekday = new Map<number, Array<{ start: string; end: string; index: number }>>();
  windows.forEach((window, index) => {
    const list = byWeekday.get(window.weekday) ?? [];
    list.push({ start: window.start, end: window.end, index });
    byWeekday.set(window.weekday, list);
  });

  for (const list of byWeekday.values()) {
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 1; i < sorted.length; i++) {
      const previous = sorted[i - 1] as { start: string; end: string; index: number };
      const current = sorted[i] as { start: string; end: string; index: number };
      if (current.start < previous.end) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'janelas sobrepostas no mesmo weekday',
          path: [current.index, 'start'],
        });
      }
    }
  }
});

export const createProfessionalSchema = z
  .object({
    name: z.string().trim().min(1, 'name é obrigatório').max(200, 'name inválido'),
    slotDurationMinutes: z
      .number()
      .int('slotDurationMinutes deve ser inteiro')
      .min(5, 'slotDurationMinutes inválido')
      .max(480, 'slotDurationMinutes inválido'),
    weeklySchedule: weeklyScheduleSchema,
  })
  .strict();

export type CreateProfessional = z.infer<typeof createProfessionalSchema>;
