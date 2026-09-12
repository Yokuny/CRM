import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DISPLAY_TIMEZONE } from '@crm/contracts';
import { connect, disconnect, FieldTemplate } from '@crm/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { contextBuild } from './contextBuild.js';

const randomId = (): string => crypto.randomBytes(12).toString('hex');

const seedProcessTemplate = async (
  tenant: string,
  key: string,
  name: string,
  overrides: { archived?: boolean } = {},
) => {
  return FieldTemplate.create({
    Tenant: tenant,
    targetType: 'process',
    key,
    name,
    currentVersion: 1,
    archived: overrides.archived ?? false,
  });
};

const textOf = (content: unknown): string => (typeof content === 'string' ? content : JSON.stringify(content));

describe('contextBuild (AIG-13)', () => {
  beforeAll(async () => {
    await connect(process.env.MONGODB_URI as string);
  });

  afterEach(async () => {
    await FieldTemplate.deleteMany({});
  });

  afterAll(async () => {
    await disconnect();
  });

  it('produces a byte-identical system prompt across different tenants — the tenant name never appears in system', async () => {
    const tenantA = { tenantId: randomId(), name: 'Empresa A' };
    const tenantB = { tenantId: randomId(), name: 'Empresa B' };
    const conversation = {};
    const aiSession = { rawHistory: [] };

    const resultA = await contextBuild(tenantA, conversation, aiSession, 'oi');
    const resultB = await contextBuild(tenantB, conversation, aiSession, 'oi');

    expect(resultA.system).toBe(resultB.system);
    expect(resultA.system).not.toContain('Empresa A');
    expect(resultB.system).not.toContain('Empresa B');
  });

  it('the system prompt stays byte-identical across two calls for the SAME tenant too (frozen between turns)', async () => {
    const tenant = { tenantId: randomId(), name: 'Empresa A' };

    const first = await contextBuild(tenant, {}, { rawHistory: [] }, 'oi');
    const second = await contextBuild(tenant, {}, { rawHistory: [] }, 'tudo bem?');

    expect(first.system).toBe(second.system);
  });

  it("includes the tenant's own process FieldTemplate key+name list in the user turn — never another tenant's", async () => {
    const tenant = randomId();
    const otherTenant = randomId();
    await seedProcessTemplate(tenant, 'orcamento', 'Orçamento');
    await seedProcessTemplate(otherTenant, 'contrato', 'Contrato');

    const result = await contextBuild({ tenantId: tenant, name: 'Empresa A' }, {}, { rawHistory: [] }, 'oi');

    const lastMessage = result.messages[result.messages.length - 1];
    const text = textOf(lastMessage.content);
    expect(text).toContain('orcamento: Orçamento');
    expect(text).not.toContain('contrato: Contrato');
  });

  it('describes all 10 tools by name and the scheduling sequence (scheduling T30, SCH-09/15)', async () => {
    const result = await contextBuild({ tenantId: randomId(), name: 'Empresa A' }, {}, { rawHistory: [] }, 'oi');

    for (const toolName of [
      'get_process_template',
      'find_or_create_customer',
      'open_process',
      'set_process_fields',
      'search_products',
      'get_order_status',
      'create_order',
      'issue_payment_link',
      'get_available_slots',
      'book_appointment',
    ]) {
      expect(result.system).toContain(toolName);
    }
    expect(result.system).toContain('get_available_slots');
    expect(result.system.toLowerCase()).toContain('confirmationurl');
  });

  it('formatNow uses DISPLAY_TIMEZONE from @crm/contracts, and the label in the user turn names it (AD-036)', async () => {
    const result = await contextBuild({ tenantId: randomId(), name: 'Empresa A' }, {}, { rawHistory: [] }, 'oi');

    const lastMessage = result.messages[result.messages.length - 1];
    const text = textOf(lastMessage.content);
    expect(text).toContain(`(${DISPLAY_TIMEZONE})`);

    // Nenhum literal 'America/Sao_Paulo' sobra no arquivo-fonte — a
    // constante vem só de @crm/contracts (AD-036, correção da fase Tasks).
    const sourcePath = fileURLToPath(new URL('./contextBuild.ts', import.meta.url));
    const source = readFileSync(sourcePath, 'utf-8');
    expect(source).not.toContain('America/Sao_Paulo');
  });

  it('messages includes the summary (when present) BEFORE rawHistory', async () => {
    const tenant = { tenantId: randomId(), name: 'Empresa A' };
    const rawHistory: { role: 'user' | 'assistant'; content: unknown }[] = [
      { role: 'user', content: 'primeira mensagem' },
      { role: 'assistant', content: 'primeira resposta' },
    ];

    const result = await contextBuild(
      tenant,
      {},
      { rawHistory, summary: 'Cliente já perguntou sobre horários antes.' },
      'nova mensagem',
    );

    expect(result.messages).toHaveLength(4); // summary + 2 rawHistory + turno dinâmico
    expect(textOf(result.messages[0].content)).toContain('Cliente já perguntou sobre horários antes.');
    expect(result.messages[1]).toEqual(rawHistory[0]);
    expect(result.messages[2]).toEqual(rawHistory[1]);
  });

  it('omits the summary message entirely when aiSession has no summary', async () => {
    const tenant = { tenantId: randomId(), name: 'Empresa A' };
    const rawHistory: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: 'oi' }];

    const result = await contextBuild(tenant, {}, { rawHistory }, 'de novo');

    expect(result.messages).toHaveLength(2); // rawHistory + turno dinâmico, sem summary
    expect(result.messages[0]).toEqual(rawHistory[0]);
  });

  it('reflects the 24h window state (open vs. expired) in the user turn', async () => {
    const tenant = { tenantId: randomId(), name: 'Empresa A' };

    const open = await contextBuild(
      tenant,
      { windowExpiresAt: new Date(Date.now() + 60_000) },
      { rawHistory: [] },
      'oi',
    );
    const expired = await contextBuild(
      tenant,
      { windowExpiresAt: new Date(Date.now() - 60_000) },
      { rawHistory: [] },
      'oi',
    );

    expect(textOf(open.messages[0].content)).toContain('dentro da janela');
    expect(textOf(expired.messages[0].content)).toContain('fora da janela');
  });
});
