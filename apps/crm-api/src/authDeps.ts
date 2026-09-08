import { Session, Tenant, User } from '@crm/db';
import type { AuthDeps } from './middlewares/authentication.middleware.js';

// Adaptador real de AuthDeps sobre @crm/db — a única fonte de req.tenantUser
// (FND-05). Extraído de app.ts (T6, design.md Componente 1/6) pra ser
// reusado tanto pelo pipeline HTTP (app.ts) quanto pelo handshake WS
// (server.ts → createInboxSocketServer, T4), sem duplicar as 4 funções de
// acesso a banco entre os dois pontos de entrada.
export const buildAuthDeps = (): AuthDeps => ({
  findSessionByHash: async (tokenHash) => {
    const session = await Session.findOne({ tokenHash }).lean();
    return session ? { user: session.user.toString(), deviceInfo: session.deviceInfo } : null;
  },
  revokeAllSessions: async (userId) => {
    await Session.deleteMany({ user: userId });
  },
  getUserById: async (userId) => {
    const user = await User.findById(userId).lean();
    return user
      ? {
          id: user._id.toString(),
          tenant: user.Tenant?.toString(),
          role: user.role,
          isPlatformAdmin: user.isPlatformAdmin,
          active: user.active,
        }
      : null;
  },
  getTenantById: async (tenantId) => {
    const tenant = await Tenant.findById(tenantId).lean();
    return tenant ? { id: tenant._id.toString(), name: tenant.name, status: tenant.status } : null;
  },
});
