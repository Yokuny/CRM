// Porta de envio de e-mail — duas implementações (nodemailer, log). Nunca
// lança: falha de SMTP não pode derrubar a operação que disparou o e-mail
// (FND-12/18).
export type MailProvider = {
  send: (to: string, subject: string, body: string) => Promise<{ sent: boolean }>;
};
