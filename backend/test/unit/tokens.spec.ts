/**
 * Unit-тесты хеширования refresh token. База не нужна.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { hashToken } from '../../src/auth/tokens.service';

describe('hashToken', () => {
  it('возвращает SHA-256 в hex', () => {
    const token = 'refresh-token-value';
    const expected = createHash('sha256').update(token).digest('hex');

    expect(hashToken(token)).toBe(expected);
    expect(hashToken(token)).toHaveLength(64);
  });

  it('детерминирован', () => {
    expect(hashToken('one')).toBe(hashToken('one'));
  });

  it('различает похожие значения', () => {
    expect(hashToken('token')).not.toBe(hashToken('token '));
    expect(hashToken('token')).not.toBe(hashToken('Token'));
  });

  it('не содержит исходного токена', () => {
    // В БД попадает только хеш, поэтому утечка таблицы не даёт рабочих токенов.
    const token = 'super-secret-refresh-token';
    expect(hashToken(token)).not.toContain(token);
  });
});
