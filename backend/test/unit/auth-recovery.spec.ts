import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecoveryDeliveryService } from '../../src/auth/recovery-delivery.service';
import { AuthService } from '../../src/auth/auth.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import type { PasswordService } from '../../src/auth/password.service';
import type { TokensService } from '../../src/auth/tokens.service';

const settings = {
  NODE_ENV: 'production',
  RECOVERY_EMAIL_API_URL: 'https://mail.example.test/emails',
  RECOVERY_EMAIL_API_KEY: 'secret-api-key',
  RECOVERY_EMAIL_FROM: 'recovery@example.test',
  RECOVERY_RESET_URL: 'https://app.example.test/recovery',
};
function delivery(overrides: Record<string, string | undefined> = {}) {
  return new RecoveryDeliveryService(new ConfigService({ ...settings, ...overrides }));
}
afterEach(() => vi.unstubAllGlobals());

describe('recovery delivery', () => {
  it('sends a usable fragment link with bounded HTTPS fetch and no redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await delivery().send('user@example.test', 'secret-reset-token');
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe(settings.RECOVERY_EMAIL_API_URL);
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers.authorization).toBe('Bearer secret-api-key');
    const body = JSON.parse(options.body);
    expect(body.to).toEqual(['user@example.test']);
    expect(body.text).toContain('https://app.example.test/recovery#token=secret-reset-token');
  });

  it.each([
    { RECOVERY_EMAIL_API_KEY: undefined },
    { RECOVERY_EMAIL_API_URL: 'http://mail.example.test' },
    { RECOVERY_RESET_URL: 'http://app.example.test' },
    { RECOVERY_RESET_URL: 'invalid' },
  ])('fails honestly for missing or unsafe configuration: %j', overrides => {
    expect(() => delivery(overrides).assertConfigured()).toThrow('Password recovery delivery is unavailable');
  });

  it.each([400, 429, 500])('sanitizes provider errors (%s)', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret-reset-token', { status })));
    await expect(delivery().send('user@example.test', 'secret-reset-token'))
      .rejects.toThrow('Password recovery delivery is unavailable');
  });

  it('sanitizes network errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret-api-key secret-reset-token')));
    await expect(delivery().send('user@example.test', 'secret-reset-token'))
      .rejects.toThrow('Password recovery delivery is unavailable');
  });

  it('checks availability before looking up even an unknown email', async () => {
    const prisma = { user: { findUnique: vi.fn() } };
    const service = new AuthService(prisma as unknown as PrismaService,
      {} as PasswordService, {} as TokensService, delivery({ RECOVERY_EMAIL_API_KEY: undefined }));
    await expect(service.requestRecovery('unknown@example.test')).rejects.toThrow('unavailable');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('deletes the pending reset on failed delivery and exposes no transport secrets', async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'user-id' }) },
      passwordResetToken: {
        create: vi.fn().mockResolvedValue({ id: 'reset-id' }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    const transport = delivery();
    vi.spyOn(transport, 'send').mockRejectedValue(new Error('secret transport details'));
    const service = new AuthService(prisma as unknown as PrismaService,
      {} as PasswordService, {} as TokensService, transport);
    await expect(service.requestRecovery('user@example.test')).rejects.toThrow('unavailable');
    expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({ where: { id: 'reset-id' } });
    const stored = prisma.passwordResetToken.create.mock.calls[0]![0].data;
    expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
