import { describe, expect, it, vi } from 'vitest';
import { syncIndexes } from './index.js';
import { AiSession } from './models/aiSession.model.js';
import { Appointment } from './models/appointment.model.js';
import { AsaasEvent } from './models/asaasEvent.model.js';
import { AsaasIntegration } from './models/asaasIntegration.model.js';
import { Channel } from './models/channel.model.js';
import { Conversation } from './models/conversation.model.js';
import { Customer } from './models/customer.model.js';
import { FieldTemplate } from './models/fieldTemplate.model.js';
import { FieldTemplateVersion } from './models/fieldTemplateVersion.model.js';
import { Invite } from './models/invite.model.js';
import { Message } from './models/message.model.js';
import { Order } from './models/order.model.js';
import { Payment } from './models/payment.model.js';
import { Process } from './models/process.model.js';
import { Product } from './models/product.model.js';
import { Professional } from './models/professional.model.js';
import { SchedulingSettings } from './models/schedulingSettings.model.js';
import { Session } from './models/session.model.js';
import { Space } from './models/space.model.js';
import { Tenant } from './models/tenant.model.js';
import { User } from './models/user.model.js';

describe('syncIndexes', () => {
  it('calls createIndexes on the 21 models', async () => {
    const spies = [
      Tenant,
      User,
      Invite,
      Session,
      FieldTemplate,
      FieldTemplateVersion,
      Customer,
      Process,
      Product,
      Professional,
      Space,
      SchedulingSettings,
      Order,
      Payment,
      AsaasIntegration,
      AsaasEvent,
      Channel,
      Conversation,
      Message,
      AiSession,
      Appointment,
    ].map((model) => vi.spyOn(model, 'createIndexes').mockResolvedValue(undefined as never));

    await syncIndexes();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
    for (const spy of spies) spy.mockRestore();
  });
});
