import mongoose, { Schema } from 'mongoose';

export interface AiSessionDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  Conversation: mongoose.Types.ObjectId;
  rawHistory: { role: 'user' | 'assistant'; content: unknown }[];
  summary?: string;
  totalMessageCount: number;
  lastRunAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Mesmo trade-off Mixed de customer.model.ts/process.model.ts: `rawHistory` é
// o formato Anthropic.MessageParam (content pode ser string ou blocos
// estruturados de tool_use/tool_result), arbitrário demais para Mongoose
// tipar sem duplicar o SDK.
const aiSessionSchema = new Schema<AiSessionDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    Conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, unique: true },
    rawHistory: { type: Schema.Types.Mixed, required: true, default: [] },
    summary: { type: String, required: false },
    totalMessageCount: { type: Number, required: true, default: 0, min: 0 },
    lastRunAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: 'aiSessions' },
);

export const AiSession = mongoose.model<AiSessionDocument>('AiSession', aiSessionSchema);
