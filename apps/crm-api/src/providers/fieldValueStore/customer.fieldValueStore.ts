import type { MigrationPlan } from '@crm/contracts';
import { Customer, tenantScoped } from '@crm/db';
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

// Adapter real do AD-021 sobre `customers`: substitui o no-op de
// dynamic-field-engine sem tocar em fieldTemplate.service.ts. A atomicidade é
// a de AD-024 — o filtro `templateVersion: fromVersion` exclui, ele mesmo,
// qualquer documento já migrado, então reaplicar o MESMO bump é seguro.
export const createCustomerFieldValueStore = (): FieldValueStore => ({
  countByTemplateVersion: async (tenantId, templateId, version) =>
    withDbTiming('customerFieldValueStore.countByTemplateVersion', async () =>
      Customer.countDocuments(tenantScoped({ Tenant: tenantId, template: templateId, templateVersion: version })),
    ),

  migrateValues: async (tenantId, templateId, fromVersion, toVersion, migration) =>
    withDbTiming('customerFieldValueStore.migrateValues', async () => {
      const docs = await Customer.find(
        tenantScoped({ Tenant: tenantId, template: templateId, templateVersion: fromVersion }),
      ).lean();
      if (docs.length === 0) return { migrated: 0 };

      const result = await Customer.bulkWrite(
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
