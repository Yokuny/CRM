import { describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('../lib/api/client.api.js', () => ({ get: getMock }));

const { currentCustomerTemplateQuery, fieldTemplateKeys, fieldTemplatesQuery, processTemplateVersionQuery } =
  await import('./fieldTemplate.js');

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

describe('fieldTemplatesQuery (T25 — WEB-07)', () => {
  it('calls GET /field-templates?targetType=<type>', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { items: [] } });

    await fieldTemplatesQuery('process').queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/field-templates?targetType=process');
  });

  it('resolves with items on success', async () => {
    const data = { items: [{ key: 'compra', label: 'Compra', archived: false }] };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await fieldTemplatesQuery('process').queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Falha ao listar.' });

    await expect(fieldTemplatesQuery('process').queryFn?.({} as never)).rejects.toThrow('Falha ao listar.');
  });

  it('exposes a queryKey scoped by targetType', () => {
    expect(fieldTemplatesQuery('process').queryKey).toEqual(fieldTemplateKeys.list('process'));
    expect(fieldTemplatesQuery('process').queryKey).not.toEqual(fieldTemplatesQuery('customer').queryKey);
  });
});

describe('processTemplateVersionQuery (T26 — WEB-08 AC1)', () => {
  it('calls GET /field-templates/:templateId/versions/:version', async () => {
    getMock.mockResolvedValueOnce({ success: true, data: { fields: [] } });

    await processTemplateVersionQuery('t1', 2).queryFn?.({} as never);

    expect(getMock).toHaveBeenCalledWith('/field-templates/t1/versions/2');
  });

  it('resolves with fields/stages on success', async () => {
    const data = { fields: [{ fieldId: 'obs', label: 'Observação', type: 'text' }], stages: ['aberto'] };
    getMock.mockResolvedValueOnce({ success: true, data });

    const result = await processTemplateVersionQuery('t1', 1).queryFn?.({} as never);

    expect(result).toEqual(data);
  });

  it('throws with the backend message when success:false', async () => {
    getMock.mockResolvedValueOnce({ success: false, message: 'Versão de template não encontrada' });

    await expect(processTemplateVersionQuery('t1', 1).queryFn?.({} as never)).rejects.toThrow(
      'Versão de template não encontrada',
    );
  });

  it('exposes a queryKey scoped by templateId+version (a bump never collides with an earlier snapshot)', () => {
    expect(processTemplateVersionQuery('t1', 1).queryKey).toEqual(fieldTemplateKeys.version('t1', 1));
    expect(processTemplateVersionQuery('t1', 1).queryKey).not.toEqual(processTemplateVersionQuery('t1', 2).queryKey);
  });
});
