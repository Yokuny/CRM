import mongoose, { Schema } from 'mongoose';

export type TenantStatus = 'provisioned' | 'active' | 'suspended';

export interface TenantDocument {
  _id: mongoose.Types.ObjectId;
  name: string;
  document: string;
  status: TenantStatus;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<TenantDocument>(
  {
    name: { type: String, minlength: 3, maxlength: 120, required: true },
    document: { type: String, required: true, unique: true, match: /^\d+$/ },
    status: {
      type: String,
      enum: ['provisioned', 'active', 'suspended'],
      default: 'provisioned',
      required: true,
    },
  },
  { timestamps: true },
);

export const Tenant = mongoose.model<TenantDocument>('Tenant', tenantSchema);

// A guarda de transição é a própria query: só atualiza se o status atual for
// exatamente `from`. Chamador fora da máquina de estados (from não bate com o
// status real) recebe null — nenhum `if` de regra de negócio aqui.
export const transitionTenantStatus = async (
  id: string,
  from: TenantStatus,
  to: TenantStatus,
): Promise<TenantDocument | null> => {
  return Tenant.findOneAndUpdate({ _id: id, status: from }, { status: to }, { returnDocument: 'after' }).lean();
};
