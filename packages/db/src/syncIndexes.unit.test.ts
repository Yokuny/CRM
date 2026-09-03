import { describe, expect, it, vi } from 'vitest';
import { syncIndexes } from './index.js';
import { FieldTemplate } from './models/fieldTemplate.model.js';
import { FieldTemplateVersion } from './models/fieldTemplateVersion.model.js';
import { Invite } from './models/invite.model.js';
import { Session } from './models/session.model.js';
import { Tenant } from './models/tenant.model.js';
import { User } from './models/user.model.js';

describe('syncIndexes', () => {
  it('calls createIndexes on the 6 models', async () => {
    const spies = [Tenant, User, Invite, Session, FieldTemplate, FieldTemplateVersion].map((model) =>
      vi.spyOn(model, 'createIndexes').mockResolvedValue(undefined as never),
    );

    await syncIndexes();

    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
    for (const spy of spies) spy.mockRestore();
  });
});
