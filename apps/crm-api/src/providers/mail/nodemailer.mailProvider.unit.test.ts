import { describe, expect, it, vi } from 'vitest';
import { createNodemailerMailProvider } from './nodemailer.mailProvider.js';

describe('createNodemailerMailProvider', () => {
  it('returns {sent: false} without throwing when the transport rejects (SMTP down)', async () => {
    const transport = { sendMail: vi.fn().mockRejectedValue(new Error('SMTP indisponível')) };
    const provider = createNodemailerMailProvider(transport, 'noreply@crm.com');

    await expect(provider.send('convidado@example.com', 'Convite', 'corpo')).resolves.toEqual({ sent: false });
    expect(transport.sendMail).toHaveBeenCalledWith({
      to: 'convidado@example.com',
      subject: 'Convite',
      html: 'corpo',
      from: 'noreply@crm.com',
    });
  });

  it('returns {sent: true} when the transport resolves', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue(undefined) };
    const provider = createNodemailerMailProvider(transport, 'noreply@crm.com');

    await expect(provider.send('convidado@example.com', 'Convite', 'corpo')).resolves.toEqual({ sent: true });
  });
});
