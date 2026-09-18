import { describe, expect, it } from 'vitest';
import { API_MESSAGE_KEYS, badRespObj, isApiMessageKey, respObj, returnData, returnMessage } from './index.js';

describe('respObj', () => {
  it('builds a success response carrying data and message', () => {
    const result = respObj({ data: { id: '1' }, message: 'created_successfully' });
    expect(result).toEqual({ success: true, data: { id: '1' }, message: 'created_successfully' });
  });

  it('defaults message to an empty string when omitted', () => {
    const result = respObj({ data: { id: '1' } });
    expect(result.message).toBe('');
  });
});

describe('badRespObj', () => {
  it('builds a failure response carrying only success and message', () => {
    const result = badRespObj({ message: 'not_found' });
    expect(result).toEqual({ success: false, message: 'not_found' });
  });

  it('never leaks extra fields such as a raw error stack', () => {
    const paramsWithLeak = { message: 'internal_error', stack: 'Error: boom\n at x' } as unknown as {
      message: 'internal_error';
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
  it('wraps a message key under a message key', () => {
    expect(returnMessage('not_found')).toEqual({ message: 'not_found' });
  });
});

describe('API_MESSAGE_KEYS', () => {
  it('only holds flat snake_case translation keys, without duplicates', () => {
    const bad = API_MESSAGE_KEYS.filter((key) => !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(key));
    expect(bad).toEqual([]);
    expect(new Set(API_MESSAGE_KEYS).size).toBe(API_MESSAGE_KEYS.length);
  });

  it('isApiMessageKey recognizes catalog keys and rejects raw text', () => {
    expect(isApiMessageKey('not_found')).toBe(true);
    expect(isApiMessageKey('Customer não encontrado')).toBe(false);
    expect(isApiMessageKey(undefined)).toBe(false);
  });
});
