import type { SchedulingSettingsDocument } from '@crm/db';
import { SchedulingSettings, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type SchedulingSettingsRecord = {
  id: string;
  tenant: string;
  maxSlotsPerResponse: number;
  createdAt: Date;
  updatedAt: Date;
};

const toRecord = (doc: SchedulingSettingsDocument): SchedulingSettingsRecord => ({
  id: doc._id.toString(),
  tenant: doc.Tenant.toString(),
  maxSlotsPerResponse: doc.maxSlotsPerResponse,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

// Tenant-scoped (AD-010): v1 é uma SchedulingSettings por Tenant (índice
// único {Tenant:1}, design.md), então devolve no máximo um documento — mesmo
// padrão de asaasIntegration.repository.findByTenant.
export const getByTenant = async (tenantId: string): Promise<SchedulingSettingsRecord | null> =>
  withDbTiming('schedulingSettings.getByTenant', async () => {
    const doc = await SchedulingSettings.findOne(tenantScoped({ Tenant: tenantId })).lean();
    return doc ? toRecord(doc) : null;
  });

export type UpsertSchedulingSettingsInput = {
  maxSlotsPerResponse: number;
};

// upsert:true cria o único documento do Tenant na primeira chamada e
// atualiza esse MESMO documento nas chamadas seguintes (índice único
// {Tenant:1} do model garante que nunca surge um segundo documento).
export const upsert = async (
  tenantId: string,
  data: UpsertSchedulingSettingsInput,
): Promise<SchedulingSettingsRecord> =>
  withDbTiming('schedulingSettings.upsert', async () => {
    const doc = await SchedulingSettings.findOneAndUpdate(
      tenantScoped({ Tenant: tenantId }),
      { $set: { maxSlotsPerResponse: data.maxSlotsPerResponse } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    // upsert:true garante que `doc` nunca é null aqui.
    return toRecord(doc as SchedulingSettingsDocument);
  });
