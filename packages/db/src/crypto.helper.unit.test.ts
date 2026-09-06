import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, maskSecret, sha256 } from './crypto.helper.js';

const KEY = Buffer.alloc(32, 7).toString('base64'); // 32 bytes, válida

describe('crypto.helper', () => {
  describe('encrypt/decrypt', () => {
    it('round-trips a plaintext through encrypt then decrypt', () => {
      const secret = encrypt('meu-token-secreto', KEY);

      expect(decrypt(secret, KEY)).toBe('meu-token-secreto');
    });

    it('throws when the authTag is tampered (integrity check)', () => {
      const secret = encrypt('meu-token-secreto', KEY);
      const tampered = { ...secret, authTag: Buffer.alloc(16, 1).toString('base64') };

      expect(() => decrypt(tampered, KEY)).toThrow();
    });

    it('throws an error naming CHANNEL_ENC_KEY when the key is not 32 bytes', () => {
      const secret = encrypt('meu-token-secreto', KEY);
      const shortKey = Buffer.alloc(16, 1).toString('base64');

      expect(() => decrypt(secret, shortKey)).toThrow('CHANNEL_ENC_KEY deve ter 32 bytes (base64)');
    });

    it('throws an error naming CHANNEL_ENC_KEY when the key is empty', () => {
      const secret = encrypt('meu-token-secreto', KEY);

      expect(() => decrypt(secret, '')).toThrow('CHANNEL_ENC_KEY não configurada');
    });
  });

  describe('maskSecret', () => {
    it('exposes only the last 4 characters of a longer secret', () => {
      expect(maskSecret('EAAG1234567890abcdef')).toBe('****cdef');
    });

    it('returns **** for a secret of 4 characters or fewer', () => {
      expect(maskSecret('abcd')).toBe('****');
      expect(maskSecret('')).toBe('****');
    });
  });

  describe('sha256', () => {
    it('returns the known SHA-256 hex digest for a fixed input', () => {
      // Vetor conhecido do algoritmo SHA-256 — verificável independente da implementação.
      expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });
});
