import { parseAddress } from './address';
import { SEND_TIMEOUT_MS, type EmailMessage, type EmailSender, type FetchFn, type SendResult } from './types';

type Options = { baseUrl: string; from: string; fetchFn?: FetchFn };

// Adaptador de desarrollo: la API HTTP de envío de Mailpit (incluido en Supabase local).
export function createMailpitSender({ baseUrl, from, fetchFn = fetch }: Options): EmailSender {
  return {
    async send(message: EmailMessage): Promise<SendResult> {
      const sender = parseAddress(from);
      if (!sender) return { ok: false, reason: 'MISCONFIGURED' };
      try {
        const response = await fetchFn(`${baseUrl}/api/v1/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          body: JSON.stringify({
            From: { Email: sender.email, ...(sender.name ? { Name: sender.name } : {}) },
            To: [{ Email: message.to }],
            Subject: message.subject,
            Text: message.text,
            HTML: message.html,
          }),
        });
        return response.ok ? { ok: true } : { ok: false, reason: 'PROVIDER_ERROR' };
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        return { ok: false, reason: timedOut ? 'TIMEOUT' : 'PROVIDER_ERROR' };
      }
    },
  };
}
