import type { MigrationPlan } from '@crm/contracts';

// Seam de DI (AD-021): a mecânica de migração destrutiva de template não
// conhece nenhuma collection de valores. `crm-core` (feature 3) implementa
// este mesmo tipo sobre `customers`/`processes` e troca só a injeção em
// app.ts — sem tocar em fieldTemplate.service.ts nem em packages/field-engine.
export type FieldValueStore = {
  countByTemplateVersion: (tenantId: string, templateId: string, version: number) => Promise<number>;
  migrateValues: (
    tenantId: string,
    templateId: string,
    fromVersion: number,
    toVersion: number,
    migration: MigrationPlan,
  ) => Promise<{ migrated: number }>;
};

export { createNoopFieldValueStore } from './noop.fieldValueStore.js';
