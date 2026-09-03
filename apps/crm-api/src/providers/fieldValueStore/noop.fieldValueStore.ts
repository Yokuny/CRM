import type { FieldValueStore } from './index.js';

// Implementação de produção desta feature: nenhum `Customer`/`Process` existe
// ainda (AD-021), então não há valor algum para contar nem migrar. Ignora o
// plano de migração por completo — nunca escreve, nunca lança.
export const createNoopFieldValueStore = (): FieldValueStore => ({
  countByTemplateVersion: async () => 0,
  migrateValues: async () => ({ migrated: 0 }),
});
