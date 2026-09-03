import crypto from 'node:crypto';
import type { CreateInvite, ProvisionTenant } from '@crm/contracts';
import { hashToken, seedDefaultCustomerTemplate } from '@crm/db';
import { CustomError } from '../middlewares/errorHandler.middleware.js';
import type { MailProvider } from '../providers/mail/index.js';
import * as platformRepository from '../repositories/platform.repository.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const isDuplicateKeyError = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && 'code' in e && (e as { code: unknown }).code === 11000;

// FLD-09: o template padrão de `customer` é dado de bootstrap do Tenant —
// nasce junto com ele, nunca por uma rota de setup (AD-018). O seed é
// idempotente por índice único (FLD-10) e nunca sobrescreve customização
// (FLD-11), então reprocessar a provisão é seguro.
export const provisionTenant = async (data: ProvisionTenant): Promise<{ id: string }> => {
  const tenant = await platformRepository.createTenant(data);
  await seedDefaultCustomerTemplate(tenant.id);
  return tenant;
};

export type InviteResult = { id: string; sent: boolean };

// Sem rollback quando o envio falha: o convite fica gravado e reenviável
// (FND-12) — lição do auth.service.ts de referência, resolvida sem desfazer
// a escrita.
export const inviteToTenant = async (
  tenantId: string,
  data: CreateInvite,
  invitedBy: string,
  mailProvider: MailProvider,
  inviteBaseUrl: string,
): Promise<InviteResult> => {
  const existingUser = await platformRepository.findUserByEmailInTenant(tenantId, data.email);
  if (existingUser) {
    throw new CustomError('Este e-mail já pertence a um usuário desta empresa', 409);
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS);

  // FND-13: reenviar para um e-mail com convite pending reaproveita — revoga
  // o anterior e emite um novo, nunca deixando dois válidos. O catch abaixo
  // continua como rede de segurança para a corrida genuína (duas revogações
  // concorrentes seguidas de dois creates); não é mais o caminho normal.
  await platformRepository.revokePendingInvites(tenantId, data.email);

  // O papel é sempre 'admin' neste endpoint, nunca o que o cliente enviar —
  // este módulo convida especificamente o primeiro admin do Tenant (FND-02/AC2).
  // Convite de gestor/operador por um admin do tenant é FND-20 (fora do escopo
  // de execução) e vive num endpoint tenant-scoped à parte.
  let invite: { id: string };
  try {
    invite = await platformRepository.createInvite({
      tenant: tenantId,
      email: data.email,
      role: 'admin',
      tokenHash,
      expiresAt,
      invitedBy,
    });
  } catch (e) {
    if (isDuplicateKeyError(e)) {
      throw new CustomError('Já existe um convite pendente para este e-mail nesta empresa', 409);
    }
    throw e;
  }

  const inviteUrl = `${inviteBaseUrl}?token=${token}`;
  const { sent } = await mailProvider.send(
    data.email,
    'Você foi convidado',
    `Acesse o link para concluir seu cadastro: ${inviteUrl}`,
  );

  if (sent) {
    await platformRepository.markInviteSent(invite.id);
  }

  return { id: invite.id, sent };
};
