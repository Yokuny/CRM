import { describe, expect, it } from 'vitest';
import { anonymizeTranscript } from './anonymize.js';

// OPS-20: PII inteiramente sintética/inventada nos fixtures abaixo — nunca
// dado real ("Beltrano"/"Sicrano" são os placeholders genéricos do
// português, equivalentes a "John Doe"; números de telefone/CPF/CNPJ são
// inventados no formato, não associados a nenhuma pessoa real.
describe('anonymizeTranscript (OPS-20, replay pipeline)', () => {
  it('replaces Brazilian phone patterns (raw digits and parenthesized DDD) with [TELEFONE]', () => {
    const input = 'Pode me ligar no 11987654321 ou no (11) 98765-4321, tanto faz.';

    expect(anonymizeTranscript(input)).toBe('Pode me ligar no [TELEFONE] ou no [TELEFONE], tanto faz.');
  });

  it('replaces a full-name pattern (two or more capitalized words) with [NOME]', () => {
    const input = 'Aqui é o Beltrano Sicrano, preciso de ajuda com meu pedido.';

    expect(anonymizeTranscript(input)).toBe('Aqui é o [NOME], preciso de ajuda com meu pedido.');
  });

  it('replaces CPF and CNPJ patterns with [DOCUMENTO]', () => {
    const input = 'Meu CPF é 123.456.789-00 e o CNPJ da empresa é 12.345.678/0001-99.';

    expect(anonymizeTranscript(input)).toBe('Meu CPF é [DOCUMENTO] e o CNPJ da empresa é [DOCUMENTO].');
  });

  it('leaves text with none of these patterns unchanged', () => {
    const input = 'Olá, tudo bem? Preciso de ajuda com meu pedido de hoje.';

    expect(anonymizeTranscript(input)).toBe(input);
  });
});
