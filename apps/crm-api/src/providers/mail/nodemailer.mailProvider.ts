import type { Transporter } from 'nodemailer';
import type { MailProvider } from './mailProvider.type.js';

// Transporter injetado (fábrica testável sem SMTP real). Falha do transporte
// nunca lança — vira {sent: false}, e o convite/operação que disparou o
// e-mail segue seu fluxo normal (FND-12).
export const createNodemailerMailProvider = (transport: Pick<Transporter, 'sendMail'>, from: string): MailProvider => ({
  send: async (to, subject, body) => {
    try {
      await transport.sendMail({ to, subject, html: body, from });
      return { sent: true };
    } catch (e) {
      console.error(JSON.stringify({ event: 'mail.send_failed', message: e instanceof Error ? e.message : String(e) }));
      return { sent: false };
    }
  },
});
