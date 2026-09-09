import { afterEach, describe, expect, it, vi } from 'vitest';
import { guardOutput, MAX_OUTPUT_TEXT_LENGTH } from './guardOutput.js';

describe('guardOutput (AIG-21/22)', () => {
  it('passes a short text unchanged', () => {
    expect(guardOutput('Olá, tudo bem?', [])).toBe('Olá, tudo bem?');
  });

  it('passes text at exactly the 1600-char limit unchanged', () => {
    const text = 'a'.repeat(MAX_OUTPUT_TEXT_LENGTH);

    expect(guardOutput(text, [])).toBe(text);
    expect(guardOutput(text, []).length).toBe(MAX_OUTPUT_TEXT_LENGTH);
  });

  it('truncates text over 1600 chars at the nearest sentence end below the limit', () => {
    const before = 'x'.repeat(1590);
    const text = `${before}. depois disso mais um monte de texto que não deveria aparecer no resultado final`;

    const result = guardOutput(text, []);

    expect(result).toBe(`${before}.`);
    expect(result.length).toBeLessThanOrEqual(MAX_OUTPUT_TEXT_LENGTH);
  });

  it('when there is no sentence-ending punctuation within the limit, cuts at a word boundary — never mid-word', () => {
    const text = Array.from({ length: 300 }, (_, i) => `palavra${i}`).join(' ');
    expect(text.length).toBeGreaterThan(MAX_OUTPUT_TEXT_LENGTH);
    expect(text).not.toMatch(/[.!?]/);

    const result = guardOutput(text, []);

    expect(result.length).toBeLessThanOrEqual(MAX_OUTPUT_TEXT_LENGTH);
    expect(text.startsWith(result)).toBe(true);
    // O caractere original logo após o corte é um espaço — prova que o corte
    // caiu numa fronteira de palavra, nunca no meio de uma.
    expect(text[result.length]).toBe(' ');
  });

  it('redacts a 24-hex-char ObjectId-shaped string', () => {
    const id = 'a'.repeat(24);

    expect(guardOutput(`ID: ${id} obrigado`, [])).toBe('ID: [removido] obrigado');
  });

  it('does NOT touch a 23-hex-char string (avoids a false positive one short of 24)', () => {
    const notAnId = 'a'.repeat(23);

    expect(guardOutput(`ID: ${notAnId} obrigado`, [])).toBe(`ID: ${notAnId} obrigado`);
  });

  it('does NOT touch a 25-hex-char string (avoids a false positive one over 24)', () => {
    const notAnId = 'a'.repeat(25);

    expect(guardOutput(`ID: ${notAnId} obrigado`, [])).toBe(`ID: ${notAnId} obrigado`);
  });
});

describe('guardOutput — regra de preço (catalog-orders T15, spec.md P1 "guard.output"/CAT-25/26/27)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a money value through unchanged when it matches a search_products-shaped price present this turn (AC2)', () => {
    const toolResultsThisTurn = [{ products: [{ id: '1', name: 'Camiseta', price: 12345, stock: 10 }] }];

    expect(guardOutput('Custa R$123,45.', toolResultsThisTurn)).toBe('Custa R$123,45.');
  });

  it('lets a money value through unchanged when it matches a create_order/get_order_status-shaped unitPrice/totalPrice present this turn (AC2)', () => {
    const toolResultsThisTurn = [
      {
        orderId: 'o1',
        status: 'pending_approval',
        items: [{ productId: 'p1', name: 'Camiseta', unitPrice: 1000, quantity: 2 }],
        totalPrice: 2000,
        customerConfirmed: false,
        operatorApproved: false,
      },
    ];

    expect(guardOutput('Total do pedido: R$20,00 (2x R$10,00).', toolResultsThisTurn)).toBe(
      'Total do pedido: R$20,00 (2x R$10,00).',
    );
  });

  it('redacts a money value with no backing tool result this turn (AC1)', () => {
    const toolResultsThisTurn = [{ products: [{ id: '1', name: 'Camiseta', price: 12345, stock: 10 }] }];

    expect(guardOutput('Vou te cobrar só R$999,00, combinado?', toolResultsThisTurn)).toBe(
      'Vou te cobrar só [removido], combinado?',
    );
  });

  it('redacts a fabricated price even with NO tool results this turn at all (AC1)', () => {
    expect(guardOutput('Sai por R$50,00.', [])).toBe('Sai por [removido].');
  });

  it('in the same reply, keeps a backed price and redacts an unbacked one side by side (AC1+AC2 together)', () => {
    const toolResultsThisTurn = [{ products: [{ id: '1', name: 'Camiseta', price: 5000, stock: 10 }] }];

    expect(guardOutput('A camiseta é R$50,00, e a taxa de entrega é R$15,00.', toolResultsThisTurn)).toBe(
      'A camiseta é R$50,00, e a taxa de entrega é [removido].',
    );
  });

  it('matches a whole-number money value ("R$50") against a backed price with cents ("5000" centavos = R$50,00)', () => {
    const toolResultsThisTurn = [{ products: [{ id: '1', name: 'Produto', price: 5000, stock: 1 }] }];

    expect(guardOutput('Fica R$50 certinho.', toolResultsThisTurn)).toBe('Fica R$50 certinho.');
  });

  it('logs every price redaction occurrence for observability (AC3, same console.log(JSON) pattern as the rest of the harness)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    guardOutput('Sai por R$50,00.', []);

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify({ event: 'price_redacted', value: 'R$50,00' }));
  });

  it('does NOT log anything when every money value in the reply is backed by a tool result this turn (no false-positive observability noise)', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const toolResultsThisTurn = [{ products: [{ id: '1', name: 'Produto', price: 5000, stock: 1 }] }];

    guardOutput('Fica R$50,00.', toolResultsThisTurn);

    expect(logSpy).not.toHaveBeenCalled();
  });
});
