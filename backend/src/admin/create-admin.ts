import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { PasswordService } from '../auth/password.service';

/** Operator-only CLI. Never exposes passwords and never elevates existing users. */
async function main() {
  const input = z.object({
    ADMIN_EMAIL: z.string().email(),
    ADMIN_PASSWORD: z.string().min(12).max(128),
  }).safeParse(process.env);
  if (!input.success) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12–128 characters)');
  const prisma = new PrismaClient();
  try {
    const passwordHash = await new PasswordService().hash(input.data.ADMIN_PASSWORD);
    await prisma.$transaction(async (tx) => {
      const status = await tx.accountStatus.upsert({
        where: { code: 'active' }, update: {}, create: { code: 'active', name: 'Активен' },
      });
      const roles = await Promise.all([
        ['user', 'Пользователь'], ['admin', 'Администратор'], ['government', 'Государственный орган'],
      ].map(([code, name]) => tx.role.upsert({ where: { code }, update: {}, create: { code: code!, name: name! } })));
      // create fails on an existing email: this command must not reset/elevate accounts.
      await tx.user.create({ data: {
        email: input.data.ADMIN_EMAIL, passwordHash, displayName: 'Администратор',
        accountStatusId: status.id, emailVerifiedAt: new Date(),
        roles: { create: roles.map((role) => ({ roleId: role.id })) },
      } });
    });
    console.log('Администратор создан. Используйте заданные оператором данные для входа.');
  } finally { await prisma.$disconnect(); }
}

void main().catch(() => {
  console.error('Не удалось создать администратора: проверьте окружение, доступность БД и уникальность email.');
  process.exitCode = 1;
});
