import mongoose, { Schema } from 'mongoose';

export interface UserDocument {
  _id: mongoose.Types.ObjectId;
  name: string;
  email: string;
  password: string;
  Tenant?: mongoose.Types.ObjectId;
  role: Array<'admin' | 'gestor' | 'operador'>;
  isPlatformAdmin: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, minlength: 3, maxlength: 80, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    Tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: false },
    role: { type: [String], enum: ['admin', 'gestor', 'operador'], default: [] },
    isPlatformAdmin: { type: Boolean, default: false, required: true },
    active: { type: Boolean, default: true, required: true },
  },
  { timestamps: true },
);

// AD-016: Tenant é obrigatório exatamente quando o usuário não é admin da
// plataforma — isPlatformAdmin é a única exceção a ter Tenant ausente.
userSchema.pre('validate', function () {
  if (!this.isPlatformAdmin && !this.Tenant) {
    this.invalidate('Tenant', 'Tenant é obrigatório para usuários que não são admin da plataforma');
  }
});

export const User = mongoose.model<UserDocument>('User', userSchema);
