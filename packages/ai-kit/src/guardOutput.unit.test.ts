import { describe, expect, it } from 'vitest';
import { guardOutput, MAX_OUTPUT_TEXT_LENGTH } from './guardOutput.js';

describe('guardOutput (AIG-21/22)', () => {
  it('passes a short text unchanged', () => {
    expect(guardOutput('Olá, tudo bem?')).toBe('Olá, tudo bem?');
  });

  it('passes text at exactly the 1600-char limit unchanged', () => {
    const text = 'a'.repeat(MAX_OUTPUT_TEXT_LENGTH);

    expect(guardOutput(text)).toBe(text);
    expect(guardOutput(text).length).toBe(MAX_OUTPUT_TEXT_LENGTH);
  });

  it('truncates text over 1600 chars at the nearest sentence end below the limit', () => {
    const before = 'x'.repeat(1590);
    const text = `${before}. depois disso mais um monte de texto que não deveria aparecer no resultado final`;

    const result = guardOutput(text);

    expect(result).toBe(`${before}.`);
    expect(result.length).toBeLessThanOrEqual(MAX_OUTPUT_TEXT_LENGTH);
  });

  it('when there is no sentence-ending punctuation within the limit, cuts at a word boundary — never mid-word', () => {
    const text = Array.from({ length: 300 }, (_, i) => `palavra${i}`).join(' ');
    expect(text.length).toBeGreaterThan(MAX_OUTPUT_TEXT_LENGTH);
    expect(text).not.toMatch(/[.!?]/);

    const result = guardOutput(text);

    expect(result.length).toBeLessThanOrEqual(MAX_OUTPUT_TEXT_LENGTH);
    expect(text.startsWith(result)).toBe(true);
    // O caractere original logo após o corte é um espaço — prova que o corte
    // caiu numa fronteira de palavra, nunca no meio de uma.
    expect(text[result.length]).toBe(' ');
  });

  it('redacts a 24-hex-char ObjectId-shaped string', () => {
    const id = 'a'.repeat(24);

    expect(guardOutput(`ID: ${id} obrigado`)).toBe('ID: [removido] obrigado');
  });

  it('does NOT touch a 23-hex-char string (avoids a false positive one short of 24)', () => {
    const notAnId = 'a'.repeat(23);

    expect(guardOutput(`ID: ${notAnId} obrigado`)).toBe(`ID: ${notAnId} obrigado`);
  });

  it('does NOT touch a 25-hex-char string (avoids a false positive one over 24)', () => {
    const notAnId = 'a'.repeat(25);

    expect(guardOutput(`ID: ${notAnId} obrigado`)).toBe(`ID: ${notAnId} obrigado`);
  });
});
