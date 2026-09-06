import { Customer, FieldTemplate, tenantScoped } from '@crm/db';
import type { ToolContext } from './toolContext.js';

export type FindOrCreateCustomerInput = { name?: string; phone: string; document?: string };
export type FindOrCreateCustomerResult = { customerId: string; created: boolean };

// AIG-16: spec Assumptions — `crm-core` não força unicidade de `Customer` por
// telefone, então esta tool resolve a ambiguidade na leitura, reusando o mais
// recentemente atualizado (nunca cria duplicata quando já existe pelo menos
// um). `name` é opcional no input.schema (WhatsApp só garante o telefone) —
// usa o próprio telefone como placeholder quando ausente.
export const findOrCreateCustomer = async (
  input: FindOrCreateCustomerInput,
  ctx: ToolContext,
): Promise<FindOrCreateCustomerResult> => {
  const existing = await Customer.findOne(tenantScoped({ Tenant: ctx.tenantId, phone: input.phone }))
    .sort({ updatedAt: -1 })
    .lean();
  if (existing) return { customerId: existing._id.toString(), created: false };

  const template = await FieldTemplate.findOne(
    tenantScoped({ Tenant: ctx.tenantId, targetType: 'customer' as const }),
  ).lean();
  if (!template) throw new Error('Tenant sem template de cliente configurado');

  const created = await Customer.create({
    Tenant: ctx.tenantId,
    name: input.name ?? input.phone,
    phone: input.phone,
    document: input.document,
    template: template._id,
    templateVersion: template.currentVersion,
    values: {},
  });

  return { customerId: created._id.toString(), created: true };
};
