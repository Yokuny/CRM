import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock }));

const { currentCustomerTemplateQuery, fieldTemplateKeys } = await import('./fieldTemplate.js');

describe('currentCustomerTemplateQuery', () => {
  it('calls GET /field-templates/current?targetType=customer&key=<key>', async () => {
    getMock.mockResolvedValueOnce({
      success: true,
      data: { template: { id: 't1', name: 'Cliente', currentVersion: 1, archived: false }, fields: [] },
    });

    await currentCustomerTemplateQuery('default').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/field-templates/current?targetType=customer&key=default');
  });

  it('resolves with the template/fields/stages on success', async () => {
    const data = { template: { id: 't1', name: 'Cliente', currentVersion: 1, archived: false }, fields: [] };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await currentCustomerTemplateQuery('default').queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when the template is not found', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Template não encontrado' });

    await expect(currentCustomerTemplateQuery('default').queryFn?.({} as never)).rejects.toThrow(
      'Template não encontrado',
    );
  });

  it('exposes a queryKey scoped by targetType+key', () => {
    expect(currentCustomerTemplateQuery('default').queryKey).toEqual(fieldTemplateKeys.current('customer', 'default'));
  });
});
