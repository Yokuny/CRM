import type { Role } from '@crm/contracts';
import { Invite, Tenant, User } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export const createTenant = async (data: { name: string; document: string }): Promise<{ id: string }> =>
  withDbTiming('platform.createTenant', async () => {
    const tenant = await Tenant.create(data);
    return { id: tenant.id };
  });

export const findUserByEmailInTenant = async (tenantId: string, email: string): Promise<{ id: string } | null> =>
  withDbTiming('platform.findUserByEmailInTenant', async () => {
    const user = await User.findOne({ Tenant: tenantId, email }).lean();
    return user ? { id: user._id.toString() } : null;
  });

export type CreateInviteInput = {
  tenant: string;
  email: string;
  role: Role;
  tokenHash: string;
  expiresAt: Date;
  invitedBy: string;
};

// FND-13: reenvio reaproveita — o convite pending anterior (se houver) é
// revogado antes de criar o novo, nunca deixando dois válidos ao mesmo
// tempo. O índice parcial único do model continua sendo a garganta de
// segurança contra corrida (duas revogações concorrentes seguidas de dois
// creates), não o caminho normal de reenvio.
export const revokePendingInvites = async (tenantId: string, email: string): Promise<void> =>
  withDbTiming('platform.revokePendingInvites', async () => {
    await Invite.updateMany({ Tenant: tenantId, email, status: 'pending' }, { $set: { status: 'revoked' } });
  });

export const createInvite = async (data: CreateInviteInput): Promise<{ id: string }> =>
  withDbTiming('platform.createInvite', async () => {
    const invite = await Invite.create({
      Tenant: data.tenant,
      email: data.email,
      role: data.role,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      invitedBy: data.invitedBy,
    });
    return { id: invite.id };
  });

// sentAt ausente = e-mail não saiu (FND-12); só marcado quando o envio confirma sucesso.
export const markInviteSent = async (id: string): Promise<void> =>
  withDbTiming('platform.markInviteSent', async () => {
    await Invite.findByIdAndUpdate(id, { sentAt: new Date() });
  });
