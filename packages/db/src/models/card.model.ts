import mongoose, { Schema } from 'mongoose';

// design.md: Card é collection própria (não embutido no Board, ao contrário
// do documento único do DentalEase — decisão confirmada na fase Design).
// `card` é 100% livre: só `Tenant`/`board`/`column`/`title`/`position` são
// obrigatórios; customer/process/order/assignee são referências opcionais e
// independentes (context.md, "Card é 100% livre").
export interface CardDocument {
  _id: mongoose.Types.ObjectId;
  Tenant: mongoose.Types.ObjectId;
  board: mongoose.Types.ObjectId;
  // Não é uma referência Mongoose real: é o `_id` de um subdocumento dentro
  // de `Board.columns[]` — sem `ref`, sem FK de verdade dentro de um array
  // embutido de outro documento (design.md, Risk). Validado em runtime só
  // por card.service.ts (T9), nunca pelo Mongoose.
  column: mongoose.Types.ObjectId;
  title: string; // 1..120
  description?: string; // <=2000
  position: number; // ordem dentro da coluna
  customer?: mongoose.Types.ObjectId;
  process?: mongoose.Types.ObjectId;
  // Nome de campo != `position` (o campo de ordenação acima), evita colisão
  // com o Order de negócio (design.md, Tech Decisions).
  order?: mongoose.Types.ObjectId;
  assignee?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const cardSchema = new Schema<CardDocument>(
  {
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    board: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    column: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    description: { type: String, required: false, trim: true, maxlength: 2000 },
    position: { type: Number, required: true, min: 0 },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: false },
    process: { type: Schema.Types.ObjectId, ref: 'Process', required: false },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: false },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', required: false },
  },
  { timestamps: true, collection: 'cards' },
);

// {Tenant,board,column,position} — leitura primária: cards de um board
// agrupados por coluna, já ordenados (design.md; cobre {Tenant,board} como
// prefixo, sem índice redundante).
cardSchema.index({ Tenant: 1, board: 1, column: 1, position: 1 });

export const Card = mongoose.model<CardDocument>('Card', cardSchema);
