export { connect, disconnect } from './connection.js';
export type { EncryptedSecret } from './crypto.helper.js';
export { decrypt, encrypt, maskSecret, sha256 } from './crypto.helper.js';
export type { AiSessionDocument } from './models/aiSession.model.js';
export { AiSession } from './models/aiSession.model.js';
export type { ChannelDocument } from './models/channel.model.js';
export { Channel } from './models/channel.model.js';
export type { ConversationDocument, ConversationMode, TurnLock } from './models/conversation.model.js';
export { Conversation, claimTurnLock, releaseTurnLock } from './models/conversation.model.js';
export type { CustomerDocument } from './models/customer.model.js';
export { Customer } from './models/customer.model.js';
export type { FieldTemplateDocument } from './models/fieldTemplate.model.js';
export {
  archiveFieldTemplate,
  DEFAULT_CUSTOMER_FIELDS,
  FieldTemplate,
  seedDefaultCustomerTemplate,
} from './models/fieldTemplate.model.js';
export type { FieldTemplateVersionDocument } from './models/fieldTemplateVersion.model.js';
export { FieldTemplateVersion } from './models/fieldTemplateVersion.model.js';
export type { InviteDocument, InviteStatus } from './models/invite.model.js';
export { hashToken, Invite } from './models/invite.model.js';
export type {
  MessageDirection,
  MessageDocument,
  MessageMedia,
  MessageStatus,
  MessageType,
} from './models/message.model.js';
export { Message } from './models/message.model.js';
export type { ProcessDocument } from './models/process.model.js';
export { Process } from './models/process.model.js';
export type { SessionDocument } from './models/session.model.js';
export { Session } from './models/session.model.js';
export type { TenantDocument, TenantStatus } from './models/tenant.model.js';
export { Tenant, transitionTenantStatus } from './models/tenant.model.js';
export type { UserDocument } from './models/user.model.js';
export { User } from './models/user.model.js';
export { tenantScoped } from './tenantScoped.js';

import { AiSession } from './models/aiSession.model.js';
import { Channel } from './models/channel.model.js';
import { Conversation } from './models/conversation.model.js';
import { Customer } from './models/customer.model.js';
import { FieldTemplate } from './models/fieldTemplate.model.js';
import { FieldTemplateVersion } from './models/fieldTemplateVersion.model.js';
import { Invite } from './models/invite.model.js';
import { Message } from './models/message.model.js';
import { Process } from './models/process.model.js';
import { Session } from './models/session.model.js';
import { Tenant } from './models/tenant.model.js';
import { User } from './models/user.model.js';

export const syncIndexes = async (): Promise<void> => {
  await Promise.all([
    Tenant.createIndexes(),
    User.createIndexes(),
    Invite.createIndexes(),
    Session.createIndexes(),
    FieldTemplate.createIndexes(),
    FieldTemplateVersion.createIndexes(),
    Customer.createIndexes(),
    Process.createIndexes(),
    Channel.createIndexes(),
    Conversation.createIndexes(),
    Message.createIndexes(),
    AiSession.createIndexes(),
  ]);
};
