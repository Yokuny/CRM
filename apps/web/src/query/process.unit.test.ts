import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock }));

const { processesQuery, processKeys } = await import('./process.js');

describe('processesQuery (T23 — WEB-05, feeds T26/T27)', () => {
  it('calls GET /processes?customerId=<id>', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [] } });

    await processesQuery('c1').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/processes?customerId=c1');
  });

  it('resolves with items on success', async () => {
    const data = {
      items: [{ id: 'p1', customer: 'c1', template: 't1', templateVersion: 1, stage: 'aberto', values: {} }],
    };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await processesQuery('c1').queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao listar.' });

    await expect(processesQuery('c1').queryFn?.({} as never)).rejects.toThrow('Falha ao listar.');
  });

  it('exposes a queryKey scoped by customerId (so distinct customers cache independently)', () => {
    expect(processesQuery('c1').queryKey).toEqual(processKeys.list('c1'));
    expect(processesQuery('c1').queryKey).not.toEqual(processesQuery('c2').queryKey);
  });
});
