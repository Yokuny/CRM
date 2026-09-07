import { expect } from 'vitest';

// expectNoLeak (ADR-0013/T44, edge case de injeção de prompt do spec.md): o
// texto observável final de um turno (a resposta ao cliente) nunca pode
// conter um valor pertencente a outro tenant/conversa — mesma garantia
// estrutural de guardOutput.ts (redação de ObjectId) e do ToolContext
// (AD-010), provada aqui no nível do golden set contra o harness real.
export const expectNoLeak = (observedText: string, forbiddenValue: string): void => {
  expect(observedText, `resposta não deveria conter o valor de outro tenant: "${forbiddenValue}"`).not.toContain(
    forbiddenValue,
  );
};
