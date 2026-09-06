import { describe, expect, it } from 'vitest';
import { sendMessageSchema } from './sendMessage.schema.js';

describe('sendMessageSchema', () => {
  it('accepts {text} alone', () => {
    const result = sendMessageSchema.safeParse({ text: 'Olá, tudo bem?' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ text: 'Olá, tudo bem?' });
    }
  });

  it('accepts {templateName, templateLanguage, templateParams} alone', () => {
    const body = {
      templateName: 'confirmacao_consulta',
      templateLanguage: 'pt_BR',
      templateParams: { '1': 'Maria', '2': '10/09' },
    };
    const result = sendMessageSchema.safeParse(body);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(body);
    }
  });

  it('rejects an empty body', () => {
    const result = sendMessageSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a body with both text and templateName at the same time', () => {
    const result = sendMessageSchema.safeParse({
      text: 'Olá',
      templateName: 'confirmacao_consulta',
      templateLanguage: 'pt_BR',
      templateParams: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects every tenant-forging key alongside a valid text body', () => {
    for (const forged of ['Tenant', 'tenantId', 'orgId']) {
      const result = sendMessageSchema.safeParse({ text: 'Olá', [forged]: 'forjado' });
      expect(result.success, `${forged} deveria ser rejeitado`).toBe(false);
    }
  });
});
