import { Injectable } from '@nestjs/common';
import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Argon2id с параметрами профиля OWASP minimum (ADR 0005).
 * Те же значения зашиты в `prisma/seed.ts`, чтобы хеши совпадали.
 */
const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  async verify(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain, ARGON2_OPTIONS);
    } catch {
      // Повреждённый или устаревший формат хеша — не причина отдавать 500.
      return false;
    }
  }
}
