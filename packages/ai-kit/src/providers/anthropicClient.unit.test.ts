import { beforeEach, describe, expect, it, vi } from 'vitest';

const messagesCreateMock = vi.fn();
const anthropicConstructorMock = vi.fn().mockImplementation(function AnthropicMock(this: {
  messages: { create: typeof messagesCreateMock };
}) {
  this.messages = { create: messagesCreateMock };
});

vi.mock('@anthropic-ai/sdk', () => ({ default: anthropicConstructorMock }));

// `resetModules` + import dinâmico por teste: o singleton do módulo (`client`)
// vive no escopo do módulo, então cada teste precisa da sua própria instância
// do módulo para não herdar o singleton criado por um teste anterior.
describe('createAnthropicClient (AIG-13 infraestrutura do loop)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('throws naming ANTHROPIC_API_KEY when apiKey is empty', async () => {
    const { createAnthropicClient } = await import('./anthropicClient.js');

    expect(() => createAnthropicClient('')).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('createMessage forwards the exact params to the underlying SDK client', async () => {
    const { createAnthropicClient } = await import('./anthropicClient.js');
    messagesCreateMock.mockResolvedValueOnce({ id: 'msg_1', content: [] });
    const client = createAnthropicClient('sk-test');
    const params = { model: 'claude-haiku-4-5', max_tokens: 10, messages: [] };

    await client.createMessage(params as never);

    expect(messagesCreateMock).toHaveBeenCalledWith(params);
  });

  it('createMessage resolves to exactly what the underlying SDK client resolved', async () => {
    const { createAnthropicClient } = await import('./anthropicClient.js');
    const fakeResponse = { id: 'msg_2', content: [{ type: 'text', text: 'oi' }] };
    messagesCreateMock.mockResolvedValueOnce(fakeResponse);
    const client = createAnthropicClient('sk-test');

    const result = await client.createMessage({ model: 'claude-haiku-4-5', max_tokens: 10, messages: [] } as never);

    expect(result).toBe(fakeResponse);
  });
});
