import { describe, expect, it, vi } from 'vitest';
import { createLogMailProvider } from './log.mailProvider.js';

describe('createLogMailProvider', () => {
  it('always resolves {sent: true} and writes a structured log entry with the message details', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const provider = createLogMailProvider();

    const result = await provider.send('convidado@example.com', 'Convite', 'corpo do e-mail');

    expect(result).toEqual({ sent: true });
    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged).toEqual({
      event: 'mail.log_send',
      to: 'convidado@example.com',
      subject: 'Convite',
      body: 'corpo do e-mail',
    });

    spy.mockRestore();
  });
});
