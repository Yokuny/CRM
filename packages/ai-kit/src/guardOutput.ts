// AIG-21: limite de mensagem livre do WhatsApp (context.md — confirmado por
// busca externa).
export const MAX_OUTPUT_TEXT_LENGTH = 1600;

// AIG-22: ObjectId do Mongo (24 hex chars), nunca deve vazar ao cliente.
// `\b...\b` evita falso positivo em runs hex de outro tamanho (23/25 chars) —
// sem uma fronteira de palavra nos dois lados, um substring de 24 chars
// dentro de um run maior não casa.
const OBJECT_ID_REGEX = /\b[0-9a-f]{24}\b/gi;
const REDACTED_PLACEHOLDER = '[removido]';

// catalog-orders T15 (spec.md P1 "guard.output"/CAT-25/26/27, design.md
// "guard.output — extensão de escopo de preço", AD-009): valor monetário no
// formato dígito+moeda que a resposta final cita — mesmo escopo limitado do
// regex de ObjectId acima (design.md Risks & Concerns: não cobre valor por
// extenso, aceito como limitação conhecida; falso positivo é o lado seguro
// do erro).
const MONEY_REGEX = /R\$\s?\d+(?:[.,]\d{2})?/g;

// Nomes de campo que carregam preço nos tool results existentes (design.md):
// `Product.price` de search_products, `unitPrice`/`totalPrice` de
// create_order/get_order_status. Varredura recursiva evita acoplar este
// arquivo à forma exata de cada tool result (array de products vs. objeto
// único de OrderSummary).
const PRICE_FIELD_NAMES = new Set(['price', 'unitPrice', 'totalPrice']);

const collectAllowedPricesInCents = (value: unknown, into: Set<number>): void => {
  if (Array.isArray(value)) {
    for (const item of value) collectAllowedPricesInCents(item, into);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (PRICE_FIELD_NAMES.has(key) && typeof val === 'number') into.add(val);
      collectAllowedPricesInCents(val, into);
    }
  }
};

// "R$ 123,45" / "R$123.45" / "R$1234" → centavos, sem passar por
// ponto-flutuante (evita o clássico 123.45*100 !== 12345 em double
// precision): separa parte inteira de centavos via regex e monta o inteiro
// só com operações exatas.
const parseMoneyToCents = (matched: string): number | null => {
  const digits = matched.match(/(\d+)(?:[.,](\d{2}))?$/);
  if (!digits) return null;
  const [, wholePart, centsPart] = digits;
  return Number(wholePart) * 100 + Number(centsPart ?? '0');
};

// Redige todo valor monetário da resposta que não bate com nenhum preço
// presente nos tool_results deste turno; todo valor que bate passa sem
// alteração (spec.md AC1/AC2). Toda redação é logada (mesmo padrão de log já
// usado no harness — loop.ts `tool_error`, guardInput.ts `guard_rejected`) —
// AC3.
const redactUnbackedPrices = (text: string, toolResultsThisTurn: unknown[]): string => {
  const allowedCents = new Set<number>();
  collectAllowedPricesInCents(toolResultsThisTurn, allowedCents);

  return text.replace(MONEY_REGEX, (matched) => {
    const cents = parseMoneyToCents(matched);
    if (cents !== null && allowedCents.has(cents)) return matched;
    console.log(JSON.stringify({ event: 'price_redacted', value: matched }));
    return REDACTED_PLACEHOLDER;
  });
};

const SENTENCE_END = new Set(['.', '!', '?']);

// Trunca no fim de frase mais próximo ABAIXO do limite; se não houver
// pontuação de frase, corta no último espaço (nunca no meio de uma palavra);
// no pior caso (uma única "palavra" maior que o limite todo), corta na
// posição exata do limite como último recurso.
const truncateAtSafeBoundary = (text: string, limit: number): string => {
  if (text.length <= limit) return text;

  const window = text.slice(0, limit);

  for (let i = window.length - 1; i >= 0; i--) {
    if (SENTENCE_END.has(window[i])) {
      return text.slice(0, i + 1).trimEnd();
    }
  }

  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace > -1) return text.slice(0, lastSpace).trimEnd();

  return window;
};

// guardOutput: última etapa antes de persistir/despachar a resposta do
// modelo (design.md). Redige ObjectId e preço fabricado PRIMEIRO (a string
// final enviada ao cliente nunca pode conter um ID interno nem um preço sem
// lastro em tool result deste turno, mesmo que caiam perto do ponto de
// corte) e só depois trunca — o limite de 1600 vale para o texto que
// realmente sai, pós-redação.
// `toolResultsThisTurn`: os tool_results (já parseados de JSON, um valor JS
// por tool_result) produzidos NESTE turno (design.md: "Só tool results deste
// turno" — AD-009); quem chama (runTurn.ts) extrai isso de
// `loopResult.rawTurn`. Assinatura antiga (`guardOutput(reply)`) foi
// removida — este parâmetro é obrigatório, não um shim de compatibilidade.
export const guardOutput = (reply: string, toolResultsThisTurn: unknown[]): string => {
  const withoutIds = reply.replace(OBJECT_ID_REGEX, REDACTED_PLACEHOLDER);
  const withoutPrices = redactUnbackedPrices(withoutIds, toolResultsThisTurn);
  return truncateAtSafeBoundary(withoutPrices, MAX_OUTPUT_TEXT_LENGTH);
};
