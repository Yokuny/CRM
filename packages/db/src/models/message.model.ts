import mongoose, { Schema } from 'mongoose';

export type MessageDirection = 'in' | 'out';
export type MessageType = 'text' | 'audio' | 'image' | 'document' | 'location' | 'unsupported';
export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageMedia {
  mediaId: string;
  mime?: string;
  caption?: string;
}

export interface MessageDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  Conversation: mongoose.Types.ObjectId;
  Channel: mongoose.Types.ObjectId;
  Customer: mongoose.Types.ObjectId;
  direction: MessageDirection;
  type: MessageType;
  status?: MessageStatus;
  text?: string;
  media?: MessageMedia;
  wamid?: string;
  templateName?: string;
  templateLanguage?: string;
  templateParams?: Record<string, string>;
  claimedBy?: string;
  claimedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<MessageMedia>(
  {
    mediaId: { type: String, required: true },
    mime: { type: String, required: false },
    caption: { type: String, required: false },
  },
  { _id: false },
);

const messageSchema = new Schema<MessageDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    Conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    Channel: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    Customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    type: { type: String, enum: ['text', 'audio', 'image', 'document', 'location', 'unsupported'], required: true },
    // status só é obrigatório para 'out' (mensagens 'in' nunca passam pela
    // fila outbox) — validação condicional no schema, não em `required` fixo.
    status: {
      type: String,
      enum: ['queued', 'sending', 'sent', 'delivered', 'read', 'failed'],
      required: function (this: MessageDocument) {
        return this.direction === 'out';
      },
    },
    text: { type: String, required: false },
    media: { type: mediaSchema, required: false },
    // Chave de idempotência (ADR-0005) — sparse: mensagens 'out' recém-criadas
    // ainda não têm wamid (só ganham depois do envio à Meta), então múltiplos
    // documentos sem o campo precisam coexistir.
    wamid: { type: String, required: false, unique: true, sparse: true },
    templateName: { type: String, required: false },
    templateLanguage: { type: String, required: false },
    templateParams: { type: Schema.Types.Mixed, required: false },
    claimedBy: { type: String, required: false },
    claimedAt: { type: Date, required: false },
    error: { type: String, required: false },
  },
  { timestamps: true, collection: 'messages' },
);

// Histórico de uma Conversation, em ordem (contextBuild, T20).
messageSchema.index({ Tenant: 1, Conversation: 1, createdAt: 1 });
// Claim atômico da outbox (T29) — só documentos direction:'out' participam,
// mas o índice não precisa de filtro parcial: 'in' nunca tem status:'queued'.
messageSchema.index({ status: 1, createdAt: 1 });

export const Message = mongoose.model<MessageDocument>('Message', messageSchema);
