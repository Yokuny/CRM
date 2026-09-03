import { Session, Tenant, User } from '@crm/db';
import { withDbTiming } from '../metrics/db.metric.js';

export type UserForSignin = {
  id: string;
  tenant?: string;
  password: string;
  active: boolean;
};

export const findUserByEmail = async (email: string): Promise<UserForSignin | null> =>
  withDbTiming('auth.findUserByEmail', async () => {
    const user = await User.findOne({ email }).lean();
    return user
      ? { id: user._id.toString(), tenant: user.Tenant?.toString(), password: user.password, active: user.active }
      : null;
  });

export type UserView = { id: string; name: string; email: string };

export const findUserView = async (userId: string): Promise<UserView | null> =>
  withDbTiming('auth.findUserView', async () => {
    const user = await User.findById(userId).lean();
    return user ? { id: user._id.toString(), name: user.name, email: user.email } : null;
  });

export type TenantView = { id: string; name: string; status: string };

export const findTenantView = async (tenantId: string): Promise<TenantView | null> =>
  withDbTiming('auth.findTenantView', async () => {
    const tenant = await Tenant.findById(tenantId).lean();
    return tenant ? { id: tenant._id.toString(), name: tenant.name, status: tenant.status } : null;
  });

// Escrita da sessão sempre AWAITADA pelo chamador (service) — o cookie nunca
// pode chegar ao cliente antes de o registro existir no banco (Risk 5).
export const createSession = async (data: {
  user: string;
  tenant?: string;
  tokenHash: string;
  deviceInfo: string;
  expiresAt: Date;
}): Promise<void> =>
  withDbTiming('auth.createSession', async () => {
    await Session.create({
      user: data.user,
      Tenant: data.tenant,
      tokenHash: data.tokenHash,
      deviceInfo: data.deviceInfo,
      expiresAt: data.expiresAt,
    });
  });
