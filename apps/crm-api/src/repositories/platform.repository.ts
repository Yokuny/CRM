import type { Role } from '@crm/contracts';
import { Invite, Tenant, User } from '@crm/db';

export const createTenant = async (data: { name: string; document: string }): Promise<{ id: string }> => {
  const tenant = await Tenant.create(data);
  return { id: tenant.id };
};

export const findUserByEmailInTenant = async (tenantId: string, email: string): Promise<{ id: string } | null> => {
  const user = await User.findOne({ Tenant: tenantId, email }).lean();
  return user ? { id: user._id.toString() } : null;
};

export type CreateInviteInput = {
  tenant: string;
  email: string;
  role: Role;
  tokenHash: string;
  expiresAt: Date;
  invitedBy: string;
};

// Duplicidade (mesmo par Tenant+email pending) é responsabilidade do índice
// parcial único do model — o erro de chave duplicada sobe para o service
// traduzir em 409 (FND-13).
export const createInvite = async (data: CreateInviteInput): Promise<{ id: string }> => {
  const invite = await Invite.create({
    Tenant: data.tenant,
    email: data.email,
    role: data.role,
    tokenHash: data.tokenHash,
    expiresAt: data.expiresAt,
    invitedBy: data.invitedBy,
  });
  return { id: invite.id };
};

// sentAt ausente = e-mail não saiu (FND-12); só marcado quando o envio confirma sucesso.
export const markInviteSent = async (id: string): Promise<void> => {
  await Invite.findByIdAndUpdate(id, { sentAt: new Date() });
};
