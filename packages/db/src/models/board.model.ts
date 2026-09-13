import mongoose, { Schema } from 'mongoose';

// design.md: Board embute só columns[] (array pequeno, curado manualmente).
// Card vive em collection própria (card.model.ts) — não o documento único
// embutido do DentalEase (decisão confirmada na fase Design).
export interface BoardColumn {
  _id: mongoose.Types.ObjectId;
  label: string; // 1..60
  order: number;
  color?: string; // hex #RRGGBB (KAN-29)
}

export interface BoardDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  name: string; // 3..80
  description?: string; // <=500
  // Sempre length >= 1 — invariante do service (board.service.ts, T8), não
  // deste model: mesmo raciocínio de weeklySchedule em professional.model.ts,
  // um `required:true` sozinho no array não bloqueia `[]`.
  columns: BoardColumn[];
  createdAt: Date;
  updatedAt: Date;
}

// Subdocumento COM _id próprio (ao contrário de scheduleWindowSchema): o
// design usa columns[]._id como o identificador de coluna, sem um campo
// `key` redundante (design.md, "Identificador de coluna").
const boardColumnSchema = new Schema<BoardColumn>({
  label: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
  order: { type: Number, required: true },
  color: { type: String, required: false, match: /^#[0-9A-Fa-f]{6}$/ },
});

const boardSchema = new Schema<BoardDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    description: { type: String, required: false, trim: true, maxlength: 500 },
    columns: { type: [boardColumnSchema], required: true },
  },
  { timestamps: true, collection: 'boards' },
);

// {Tenant,updatedAt} — hub lista os boards do tenant ordenados por
// atualização mais recente (KAN-03).
boardSchema.index({ Tenant: 1, updatedAt: -1 });

export const Board = mongoose.model<BoardDocument>('Board', boardSchema);
