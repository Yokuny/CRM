import type { MailProvider } from './mailProvider.type.js';

// Implementação de dev/test: nunca envia de verdade, sempre "sent: true" e
// registra no log estruturado.
export const createLogMailProvider = (): MailProvider => ({
  send: async (to, subject, body) => {
    console.log(JSON.stringify({ event: 'mail.log_send', to, subject, body }));
    return { sent: true };
  },
});
