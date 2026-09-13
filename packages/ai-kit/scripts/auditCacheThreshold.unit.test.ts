import { describe, expect, it } from 'vitest';
import { evaluateThreshold } from './auditCacheThreshold.js';

// OPS-14/15: limiar de cache é 4096, testado por número sintético — nunca
// chama a API real aqui (a função é pura, sem rede).
describe('evaluateThreshold (AD-008 cache threshold audit)', () => {
  it('reports overLimit: false and the exact count just below the boundary', () => {
    expect(evaluateThreshold(4095)).toEqual({ overLimit: false, tokenCount: 4095, limit: 4096 });
  });

  it('reports overLimit: true exactly at the 4096 boundary (spec uses >=, not >)', () => {
    expect(evaluateThreshold(4096)).toEqual({ overLimit: true, tokenCount: 4096, limit: 4096 });
  });

  it('reports overLimit: true well above the boundary', () => {
    expect(evaluateThreshold(10000)).toEqual({ overLimit: true, tokenCount: 10000, limit: 4096 });
  });
});
