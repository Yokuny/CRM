import { Product, tenantScoped } from '@crm/db';
import type { ToolContext } from './toolContext.js';

export type SearchProductsInput = { query?: string };
export type SearchProductsResult = {
  products: Array<{ id: string; name: string; price: number; stock: number; description?: string }>;
};

// Regex escapada: `query` é entrada livre do cliente via conversa (spec.md
// AC1) — mesmo padrão de product.repository.listProducts.escapeRegExp.
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// spec.md P1 "Cliente pesquisa produtos"/AC1/AC2: top-5 fixo, só `Product`s
// `active:true` do Tenant do ToolContext (nunca active:false), filtro
// case-insensitive só em `name` (design.md Tech Decisions: "nada no Discuss
// pediu busca por descrição"). Sem `query`, os 5 mais recentes. Nunca lança e
// nunca retorna {error} — busca sem match é lista vazia (AC2).
export const searchProducts = async (input: SearchProductsInput, ctx: ToolContext): Promise<SearchProductsResult> => {
  const nameFilter = input.query ? { name: new RegExp(escapeRegExp(input.query), 'i') } : {};
  const docs = await Product.find(tenantScoped({ Tenant: ctx.tenantId, active: true, ...nameFilter }))
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  return {
    products: docs.map((doc) => ({
      id: doc._id.toString(),
      name: doc.name,
      price: doc.price,
      stock: doc.stock,
      description: doc.description,
    })),
  };
};
