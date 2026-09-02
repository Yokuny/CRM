import { describe, expect, it } from 'vitest';
import { badRespObj, respObj, returnData, returnMessage } from './index.js';

describe('respObj', () => {
  it('builds a success response carrying data and message', () => {
    const result = respObj({ data: { id: '1' }, message: 'ok' });
    expect(result).toEqual({ success: true, data: { id: '1' }, message: 'ok' });
  });

  it('defaults message to an empty string when omitted', () => {
    const result = respObj({ data: { id: '1' } });
    expect(result.message).toBe('');
  });
});

describe('badRespObj', () => {
  it('builds a failure response carrying only success and message', () => {
    const result = badRespObj({ message: 'falhou' });
    expect(result).toEqual({ success: false, message: 'falhou' });
  });

  it('never leaks extra fields such as a raw error stack', () => {
    const paramsWithLeak = { message: 'falhou', stack: 'Error: boom\n at x' } as unknown as {
      message: string;
    };
    const result = badRespObj(paramsWithLeak);
    expect(result).not.toHaveProperty('stack');
    expect(result).not.toHaveProperty('data');
    expect(Object.keys(result).sort()).toEqual(['message', 'success']);
  });
});

describe('returnData', () => {
  it('wraps a value under a data key', () => {
    expect(returnData({ id: '1' })).toEqual({ data: { id: '1' } });
  });
});

describe('returnMessage', () => {
  it('wraps a string under a message key', () => {
    expect(returnMessage('oi')).toEqual({ message: 'oi' });
  });
});
