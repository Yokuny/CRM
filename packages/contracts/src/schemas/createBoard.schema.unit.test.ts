import { describe, expect, it } from 'vitest';
import { createBoardSchema } from './createBoard.schema.js';

const basePayload = {
  name: 'Cobranças em atraso',
  columns: [{ label: 'A fazer' }],
};

describe('createBoardSchema (KAN-01, KAN-02, KAN-04)', () => {
  it('accepts a full valid payload with description and multiple columns', () => {
    const result = createBoardSchema.safeParse({
      name: 'Cobranças em atraso',
      description: 'Board de cobranças',
      columns: [
        { label: 'A fazer' },
        { label: 'Em andamento', color: '#00AA00' },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty columns array (KAN-02)', () => {
    const result = createBoardSchema.safeParse({ ...basePayload, columns: [] });

    expect(result.success).toBe(false);
  });

  it('rejects a name shorter than 3 characters', () => {
    const result = createBoardSchema.safeParse({ ...basePayload, name: 'ab' });

    expect(result.success).toBe(false);
  });

  it('rejects a name longer than 80 characters', () => {
    const result = createBoardSchema.safeParse({ ...basePayload, name: 'a'.repeat(81) });

    expect(result.success).toBe(false);
  });

  it('rejects a column color outside the #RRGGBB regex', () => {
    const result = createBoardSchema.safeParse({
      ...basePayload,
      columns: [{ label: 'A fazer', color: 'red' }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a column with an empty label', () => {
    const result = createBoardSchema.safeParse({ ...basePayload, columns: [{ label: '' }] });

    expect(result.success).toBe(false);
  });

  it('rejects every tenant-forging key in the body (AD-010, .strict())', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = createBoardSchema.safeParse({ ...basePayload, [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
