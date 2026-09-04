import { z } from 'zod';

// CORE-09/17: o valor de `stage` só é validado contra os `stages` da
// `templateVersion` do Process no service (é lá que a guarda de transição
// vive) — aqui só garante uma string não vazia.
export const updateProcessStageSchema = z
  .object({
    stage: z.string().trim().min(1, 'stage é obrigatório'),
  })
  .strict();

export type UpdateProcessStage = z.infer<typeof updateProcessStageSchema>;
