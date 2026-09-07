import type { EncryptedSecret } from '@crm/db';
import { Channel, type ChannelDocument, tenantScoped } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type ChannelRecord = {
  id: string;
  tenant: string;
  phoneNumberId: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  accessTokenEnc: EncryptedSecret;
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
};

const toRecord = (doc: ChannelDocument): ChannelRecord => ({
  id: doc._id.toString(),
  tenant: doc.Tenant.toString(),
  phoneNumberId: doc.phoneNumberId,
  wabaId: doc.wabaId,
  displayPhoneNumber: doc.displayPhoneNumber,
  accessTokenEnc: doc.accessTokenEnc,
  status: doc.status,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

export type CreateChannelData = {
  phoneNumberId: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  accessTokenEnc: EncryptedSecret;
};

// `tenantId` é parâmetro próprio (nunca lido de `data`) — cada campo de
// `data` é copiado individualmente para `Channel.create` (nunca um spread
// `...data`), então uma segunda chave `Tenant`/`tenant` forjada dentro de
// `data` nunca tem efeito (AIG-03, mesmo idioma de customer.repository.ts).
export const createChannel = async (tenantId: string, data: CreateChannelData): Promise<ChannelRecord> =>
  withDbTiming('channel.createChannel', async () => {
    const doc = await Channel.create({
      Tenant: tenantId,
      phoneNumberId: data.phoneNumberId,
      wabaId: data.wabaId,
      displayPhoneNumber: data.displayPhoneNumber,
      accessTokenEnc: data.accessTokenEnc,
    });
    return toRecord(doc);
  });

// Sem filtro de Tenant DE PROPÓSITO (AD-010, exceção documentada): é o
// próprio resolvedor de tenant do webhook — mesma chamada cross-tenant já
// usada internamente por packages/ai-kit/src/ingest.ts.
export const findByPhoneNumberId = async (phoneNumberId: string): Promise<ChannelRecord | null> =>
  withDbTiming('channel.findByPhoneNumberId', async () => {
    const doc = await Channel.findOne({ phoneNumberId }).lean();
    return doc ? toRecord(doc) : null;
  });

// Tenant-scoped (AD-010): v1 é um Channel por Tenant (índice único {Tenant:1},
// design.md), então devolve no máximo um documento.
export const findByTenant = async (tenantId: string): Promise<ChannelRecord | null> =>
  withDbTiming('channel.findByTenant', async () => {
    const doc = await Channel.findOne(tenantScoped({ Tenant: tenantId })).lean();
    return doc ? toRecord(doc) : null;
  });
