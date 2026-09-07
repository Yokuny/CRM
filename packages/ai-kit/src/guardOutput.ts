// AIG-21: limite de mensagem livre do WhatsApp (context.md — confirmado por
// busca externa).
export const MAX_OUTPUT_TEXT_LENGTH = 1600;

// AIG-22: ObjectId do Mongo (24 hex chars), nunca deve vazar ao cliente.
// `\b...\b` evita falso positivo em runs hex de outro tamanho (23/25 chars) —
// sem uma fronteira de palavra nos dois lados, um substring de 24 chars
// dentro de um run maior não casa.
const OBJECT_ID_REGEX = /\b[0-9a-f]{24}\b/gi;
const REDACTED_PLACEHOLDER = '[removido]';

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
// modelo (design.md). Redige ObjectId PRIMEIRO (a string final enviada ao
// cliente nunca pode conter um ID interno, mesmo que ele caia perto do ponto
// de corte) e só depois trunca — o limite de 1600 vale para o texto que
// realmente sai, pós-redação.
export const guardOutput = (reply: string): string => {
  const redacted = reply.replace(OBJECT_ID_REGEX, REDACTED_PLACEHOLDER);
  return truncateAtSafeBoundary(redacted, MAX_OUTPUT_TEXT_LENGTH);
};
