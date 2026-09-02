export { connect, disconnect } from './connection.js';
export type { InviteDocument, InviteStatus } from './models/invite.model.js';
export { hashToken, Invite } from './models/invite.model.js';
export type { SessionDocument } from './models/session.model.js';
export { Session } from './models/session.model.js';
export type { TenantDocument, TenantStatus } from './models/tenant.model.js';
export { Tenant, transitionTenantStatus } from './models/tenant.model.js';
export type { UserDocument } from './models/user.model.js';
export { User } from './models/user.model.js';
export { tenantScoped } from './tenantScoped.js';

import { Invite } from './models/invite.model.js';
import { Session } from './models/session.model.js';
import { Tenant } from './models/tenant.model.js';
import { User } from './models/user.model.js';

export const syncIndexes = async (): Promise<void> => {
  await Promise.all([Tenant.createIndexes(), User.createIndexes(), Invite.createIndexes(), Session.createIndexes()]);
};
