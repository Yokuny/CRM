import mongoose, { Schema } from 'mongoose';

export type ConversationMode = 'bot' | 'human';

export interface TurnLock {
  holder: string;
  claimedAt: Date;
}

export interface ConversationDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  Channel: mongoose.Types.ObjectId;
  Customer: mongoose.Types.ObjectId;
  mode: ConversationMode;
  assignee?: mongoose.Types.ObjectId;
  lastInboundAt?: Date;
  windowExpiresAt?: Date;
  lastActivityAt: Date;
  turnLock: TurnLock | null;
  rateWindowStart?: Date;
  rateWindowCount?: number;
  // AIG-11 fix: marca a janela (por valor de rateWindowStart) em que o
  // cliente já recebeu o aviso fixo de rate limit — "no máximo 1 aviso por
  // janela de 60s" (spec.md Assumptions). Mesmo estilo de rateWindowStart:
  // vive só no documento, nunca em memória do processo.
  rateLimitWarnedWindowStart?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const turnLockSchema = new Schema<TurnLock>(
  {
    holder: { type: String, required: true },
    claimedAt: { type: Date, required: true },
  },
  { _id: false },
);

const conversationSchema = new Schema<ConversationDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    Channel: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    Customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    mode: { type: String, enum: ['bot', 'human'], default: 'bot', required: true },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    lastInboundAt: { type: Date, required: false },
    windowExpiresAt: { type: Date, required: false },
    lastActivityAt: { type: Date, required: true, default: () => new Date() },
    // Claim atômico de turno (ADR-0007-like, design.md) — `null` livre,
    // `{holder,claimedAt}` reivindicado. `default: undefined` evita o Mongoose
    // materializar `{}`/valor default de sub-schema no lugar do `null`
    // explícito que o claim exige comparar.
    turnLock: { type: turnLockSchema, required: false, default: null },
    rateWindowStart: { type: Date, required: false },
    rateWindowCount: { type: Number, required: false },
    rateLimitWarnedWindowStart: { type: Date, required: false },
  },
  { timestamps: true, collection: 'conversations' },
);

// {Channel,Customer} é a chave de identidade de uma Conversation (spec.md
// Edge Cases) — primeira mensagem de um Customer cria, as demais reusam.
conversationSchema.index({ Channel: 1, Customer: 1 }, { unique: true });
// Suporte à varredura de idle sweep (T31, AIG-33): só conversas mode:'human'
// interessam, ordenadas por atividade.
conversationSchema.index({ Tenant: 1, mode: 1, lastActivityAt: 1 });

export const Conversation = mongoose.model<ConversationDocument>('Conversation', conversationSchema);

// Mesmo padrão de findOneAndUpdate atômico do claim da outbox (ADR-0007) —
// reivindica só se turnLock ainda estiver livre (null). Chamador que perde a
// corrida recebe null, nunca lança.
export const claimTurnLock = async (id: string, holder: string): Promise<ConversationDocument | null> => {
  return Conversation.findOneAndUpdate(
    { _id: id, turnLock: null },
    { $set: { turnLock: { holder, claimedAt: new Date() } } },
    { returnDocument: 'after' },
  ).lean();
};

// Libera o lock incondicionalmente (persist/dispatch, T23) — quem chama já
// sabe que é o holder atual (fluxo síncrono de um único request).
export const releaseTurnLock = async (id: string): Promise<ConversationDocument | null> => {
  return Conversation.findOneAndUpdate({ _id: id }, { $set: { turnLock: null } }, { returnDocument: 'after' }).lean();
};
