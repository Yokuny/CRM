// OPS-20: substitui padrões de PII (telefone BR, nome completo, CPF/CNPJ) por
// placeholders — chamado ANTES de qualquer gravação em evals/replay/ (report
// ou baseline, T12). Baseado em padrão (regex), não NLP: o objetivo é reduzir
// a chance de PII real vazar para um arquivo versionado no git quando o
// pipeline apontar para exports reais no futuro, não uma detecção perfeita.

// CPF (000.000.000-00) / CNPJ (00.000.000/0000-00) — aplicado ANTES do
// telefone: os dois padrões usam pontuação (`.`/`/`) que o padrão de
// telefone abaixo nunca casa, então a ordem só documenta a intenção, não
// evita uma colisão real.
const DOCUMENT_PATTERN = /\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;

// Telefone BR: DDD opcional entre parênteses + 8-9 dígitos, com ou sem
// espaço/traço separador — cobre tanto "11987654321" quanto
// "(11) 98765-4321".
const PHONE_PATTERN = /\(?\d{2}\)?[\s-]?\d{4,5}-?\d{4}/g;

// Nome completo: heurística de padrão (2+ palavras capitalizadas em
// sequência, sem conectivo minúsculo entre elas) — não é NLP, mesmo espírito
// dos dois padrões acima.
const FULL_NAME_PATTERN = /\b[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)+\b/g;

export const anonymizeTranscript = (text: string): string =>
  text
    .replace(DOCUMENT_PATTERN, '[DOCUMENTO]')
    .replace(PHONE_PATTERN, '[TELEFONE]')
    .replace(FULL_NAME_PATTERN, '[NOME]');
