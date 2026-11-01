import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PASSWORD_RESET_TTL_SECONDS } from './auth.constants';

/** Resend-compatible JSON API; no transport errors or provider bodies are logged. */
@Injectable()
export class RecoveryDeliveryService {
  constructor(private readonly config: ConfigService) {}

  unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException('Password recovery delivery is unavailable');
  }

  assertConfigured(): void {
    this.settings();
  }

  private settings(): { endpoint: string; key: string; from: string; resetUrl: string } {
    const endpoint = this.config.get<string>('RECOVERY_EMAIL_API_URL');
    const key = this.config.get<string>('RECOVERY_EMAIL_API_KEY');
    const from = this.config.get<string>('RECOVERY_EMAIL_FROM');
    const resetUrl = this.config.get<string>('RECOVERY_RESET_URL');
    try {
      if (!endpoint || !key || !from || !resetUrl) throw new Error();
      const api = new URL(endpoint);
      const reset = new URL(resetUrl);
      if (api.protocol !== 'https:' || api.username || api.password) throw new Error();
      if (!['https:', 'http:'].includes(reset.protocol) || reset.username || reset.password) throw new Error();
      if (this.config.get('NODE_ENV') === 'production' && reset.protocol !== 'https:') throw new Error();
      return { endpoint, key, from, resetUrl };
    } catch {
      throw this.unavailable();
    }
  }

  async send(email: string, token: string): Promise<void> {
    const { endpoint, key, from, resetUrl } = this.settings();
    const link = new URL(resetUrl);
    // Fragment avoids putting the secret into web-server access logs.
    link.hash = new URLSearchParams({ token }).toString();
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from, to: [email], subject: 'Password recovery',
          text: `Reset your password using this link (valid for ${PASSWORD_RESET_TTL_SECONDS / 60} minutes): ${link.toString()}`,
        }),
      });
      await response.body?.cancel();
      if (!response.ok) throw this.unavailable();
    } catch {
      throw this.unavailable();
    }
  }
}
