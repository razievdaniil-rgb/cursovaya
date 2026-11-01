/**
 * Unit-тесты хеширования паролей. База не нужна.
 */

import { describe, expect, it } from 'vitest';

import { PasswordService } from '../../src/auth/password.service';

const passwords = new PasswordService();

describe('PasswordService', () => {
  it('создаёт хеш в формате Argon2id', async () => {
    const hash = await passwords.hash('CorrectHorseBattery1');

    expect(hash.startsWith('$argon2id$')).toBe(true);
    // Пароль в хеше не содержится.
    expect(hash).not.toContain('CorrectHorseBattery1');
  });

  it('использует параметры профиля OWASP minimum', async () => {
    const hash = await passwords.hash('CorrectHorseBattery1');

    // m=19456 KiB, t=2, p=1 — те же значения, что в prisma/seed.ts.
    expect(hash).toContain('m=19456');
    expect(hash).toContain('t=2');
    expect(hash).toContain('p=1');
  });

  it('даёт разные хеши для одного пароля (случайная соль)', async () => {
    const [first, second] = await Promise.all([
      passwords.hash('CorrectHorseBattery1'),
      passwords.hash('CorrectHorseBattery1'),
    ]);

    expect(first).not.toBe(second);
  });

  it('подтверждает верный пароль и отклоняет неверный', async () => {
    const hash = await passwords.hash('CorrectHorseBattery1');

    expect(await passwords.verify(hash, 'CorrectHorseBattery1')).toBe(true);
    expect(await passwords.verify(hash, 'correcthorsebattery1')).toBe(false);
    expect(await passwords.verify(hash, '')).toBe(false);
  });

  it('повреждённый хеш не приводит к исключению', async () => {
    // Иначе одна испорченная строка в БД давала бы 500 вместо 401.
    expect(await passwords.verify('не-хеш', 'CorrectHorseBattery1')).toBe(false);
    expect(await passwords.verify('', 'CorrectHorseBattery1')).toBe(false);
  });
});
