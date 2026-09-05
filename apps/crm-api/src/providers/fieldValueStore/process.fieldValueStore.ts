import type { MigrationPlan } from '@crm/contracts';
import { Process, tenantScoped } from '@crm/db';
import { withDbTiming } from '../../metrics/db.metric.js';
import type { FieldValueStore } from './index.js';

// Mesmo trade-off de idempotência do design.md/AD-024: nenhum campo não citado
// no plano é tocado, e um valor sem entrada em `mapOptions.mapping` é mantido
// como está — nunca descartado silenciosamente.
const applyMigrationToValues = (values: Record<string, unknown>, migration: MigrationPlan): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...values };
  for (const [fieldId, action] of Object.entries(migration)) {
    if (!(fieldId in next)) continue;
    const value = next[fieldId];
    switch (action.action) {
      case 'discard':
        delete next[fieldId];
        break;
      case 'mapField':
        delete next[fieldId];
        next[action.toFieldId] = value;
        break;
      case 'mapOptions':
        next[fieldId] = typeof value === 'string' && value in action.mapping ? action.mapping[value] : value;
        break;
    }
  }
  return next;
};

// Adapter real do AD-021 sobre `processes` — mesma forma do adapter de
// `customer` (T10), só a collection alvo muda.
export const createProcessFieldValueStore = (): FieldValueStore => ({
  countByTemplateVersion: async (tenantId, templateId, version) =>
    withDbTiming('processFieldValueStore.countByTemplateVersion', async () =>
      Process.countDocuments(tenantScoped({ Tenant: tenantId, template: templateId, templateVersion: version })),
    ),

  migrateValues: async (tenantId, templateId, fromVersion, toVersion, migration) =>
    withDbTiming('processFieldValueStore.migrateValues', async () => {
      const docs = await Process.find(
        tenantScoped({ Tenant: tenantId, template: templateId, templateVersion: fromVersion }),
      ).lean();
      if (docs.length === 0) return { migrated: 0 };

      const result = await Process.bulkWrite(
        docs.map((doc) => ({
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { values: applyMigrationToValues(doc.values, migration), templateVersion: toVersion } },
          },
        })),
      );

      return { migrated: result.modifiedCount };
    }),
});
