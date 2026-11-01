import { z } from 'zod';

import { SELF_ASSIGNABLE_ROLES } from './auth.constants';

/**
 * Правила совпадают с frontend-формами (`AuthPages.tsx`), чтобы пользователь
 * не получал на сервере ошибку, которую клиент считает допустимым вводом.
 */
const email = z
  .string()
  .trim()
  .min(1, 'Укажите адрес электронной почты')
  .max(254, 'Адрес слишком длинный')
  .email('Некорректный адрес электронной почты')
  .toLowerCase();

const password = z
  .string()
  .min(10, 'Пароль должен быть не короче 10 символов')
  .max(256, 'Пароль слишком длинный');

export const registerSchema = z.object({
  email,
  password,
  displayName: z
    .string()
    .trim()
    .min(2, 'Укажите имя или название организации')
    .max(255, 'Слишком длинное значение'),
  // Роли government и admin здесь недоступны — см. SELF_ASSIGNABLE_ROLES.
  role: z.enum(SELF_ASSIGNABLE_ROLES as unknown as [string, ...string[]]).default('user'),
  /** Обязательно, когда role = organization. */
  organizationName: z.string().trim().min(3).max(512).optional(),
  organizationInn: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{12})$/, 'ИНН должен содержать 10 или 12 цифр')
    .optional(),
}).refine(
  (value) => value.role !== 'organization' || Boolean(value.organizationName),
  {
    path: ['organizationName'],
    message: 'Для роли «организация» укажите название организации',
  },
);

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Введите пароль'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const recoveryRequestSchema = z.object({ email });

export type RecoveryRequestInput = z.infer<typeof recoveryRequestSchema>;

export const recoveryConfirmSchema = z.object({
  token: z.string().min(16, 'Некорректный токен восстановления'),
  password,
});

export type RecoveryConfirmInput = z.infer<typeof recoveryConfirmSchema>;
