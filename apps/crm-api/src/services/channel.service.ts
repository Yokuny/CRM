import type { CreateChannel } from '@crm/contracts';
import { decrypt, encrypt, maskSecret } from '@crm/db';
import { env } from '../config/env.config.js';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { ChannelRecord } from '../repositories/channel.repository.js';
import * as channelRepository from '../repositories/channel.repository.js';

export type ChannelPublicRecord = {
  id: string;
  tenant: string;
  phoneNumberId: string;
  wabaId?: string;
  displayPhoneNumber?: string;
  accessToken: string; // sempre mascarado (maskSecret) — nunca em claro
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
};

// O token nunca sai em claro da camada de serviço (AIG-01): decifra só para
// mascarar (últimos 4 caracteres), nunca devolve `accessTokenEnc` bruto.
const toPublicRecord = (channel: ChannelRecord): ChannelPublicRecord => ({
  id: channel.id,
  tenant: channel.tenant,
  phoneNumberId: channel.phoneNumberId,
  wabaId: channel.wabaId,
  displayPhoneNumber: channel.displayPhoneNumber,
  accessToken: maskSecret(decrypt(channel.accessTokenEnc, env.CHANNEL_ENC_KEY)),
  status: channel.status,
  createdAt: channel.createdAt,
  updatedAt: channel.updatedAt,
});

// AIG-01: criptografa o accessToken (AES-256-GCM, packages/db crypto helper)
// ANTES de persistir — o repository (T33) nunca recebe/grava texto puro.
export const createChannel = async (tenantId: string, data: CreateChannel): Promise<ChannelPublicRecord> => {
  const accessTokenEnc = encrypt(data.accessToken, env.CHANNEL_ENC_KEY);
  const channel = await channelRepository.createChannel(tenantId, {
    phoneNumberId: data.phoneNumberId,
    wabaId: data.wabaId,
    displayPhoneNumber: data.displayPhoneNumber,
    accessTokenEnc,
  });
  return toPublicRecord(channel);
};

// AD-010: findByTenant já é tenant-scoped — mesmo idioma 404 de
// customer.service.ts.getCustomerById.
export const getCurrentChannel = async (tenantId: string): Promise<ChannelPublicRecord> => {
  const channel = await channelRepository.findByTenant(tenantId);
  if (!channel) throw new CustomError('Channel não encontrado', 404);
  return toPublicRecord(channel);
};
