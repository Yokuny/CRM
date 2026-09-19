const MONEY_SCALE = 100;

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** Exibe centavos inteiros como moeda BRL (apenas apresentação). */
export function formatMoney(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return moneyFormatter.format(0);
  return moneyFormatter.format(cents / MONEY_SCALE);
}

/**
 * Exibe um valor inteiro na menor unidade (centavos, com `precision` casas)
 * como moeda do `code` informado — o formato dos campos `currency` do
 * field-engine, que variam de moeda/precisão por campo.
 */
export function formatCurrency(minorUnits: number, code: string, precision: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(minorUnits / 10 ** precision);
}

/** Extrai apenas dígitos de uma string de entrada. */
function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Converte entrada do usuário (mascarada ou dígitos) em centavos inteiros.
 * Dígitos são interpretados como centavos (ex.: "9990" → 9990, "99,90" via máscara → 9990).
 */
export function parseMoneyInput(raw: string | number): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) throw new Error('Valor não pode ser negativo');
    return Math.trunc(raw);
  }

  const digits = digitsOnly(raw);
  if (!digits) return 0;
  const cents = parseInt(digits, 10);
  if (!Number.isFinite(cents) || cents < 0) throw new Error('Erro no valor informado ou valor não pode ser negativo');
  return cents;
}

/**
 * Máscara BRL durante digitação: trata entrada como centavos (últimos 2 dígitos = decimais).
 */
export function maskMoneyInput(raw: string): string {
  const digits = digitsOnly(raw);
  if (!digits) return '';
  const cents = parseInt(digits, 10);
  if (!Number.isFinite(cents)) return '';
  return formatMoney(cents);
}

/** Converte centavos para exibição em input (string mascarada). */
export function centsToInputDisplay(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return '';
  return formatMoney(Math.trunc(cents));
}
