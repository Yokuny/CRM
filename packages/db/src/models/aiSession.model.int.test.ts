import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../tests/helpers/db.helper.js';
import { AiSession } from './aiSession.model.js';

const baseSession = (overrides: Partial<Record<string, unknown>> = {}) => ({
  Tenant: new mongoose.Types.ObjectId(),
  Conversation: new mongoose.Types.ObjectId(),
  ...overrides,
});

describe('AiSession model', () => {
  useTestDb();

  it('rejects a second AiSession for the same Conversation (unique index)', async () => {
    await AiSession.init();
    const Conversation = new mongoose.Types.ObjectId();
    await AiSession.create(baseSession({ Conversation }));

    await expect(AiSession.create(baseSession({ Conversation }))).rejects.toThrow();
  });

  it('persists an arbitrary nested rawHistory array without losing structure', async () => {
    const rawHistory = [
      { role: 'user', content: 'oi' },
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_process_template', input: { key: 'onboarding' } }],
      },
    ];

    const created = await AiSession.create(baseSession({ rawHistory }));
    const reloaded = await AiSession.findById(created._id).lean();

    expect(reloaded?.rawHistory).toEqual(rawHistory);
  });

  it('defaults totalMessageCount to 0 and stamps lastRunAt/createdAt/updatedAt', async () => {
    const created = await AiSession.create(baseSession());

    expect(created.totalMessageCount).toBe(0);
    expect(created.lastRunAt).toBeInstanceOf(Date);
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  it('persists an optional summary field when provided', async () => {
    const created = await AiSession.create(baseSession({ summary: 'cliente pediu orçamento' }));

    expect(created.summary).toBe('cliente pediu orçamento');
  });
});
