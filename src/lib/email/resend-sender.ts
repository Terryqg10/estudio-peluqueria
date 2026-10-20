import { SEND_TIMEOUT_MS, type EmailMessage, type EmailSender, type FetchFn, type SendResult } from './types';

type Options = { apiKey: string; from: string; fetchFn?: FetchFn };

const RESEND_URL = 'https://api.resend.com/emails';

// Adaptador de producción. Sin SDK: una petición HTTP (ADR-0017).
// VERIFICAR el contrato vigente de la API de Resend, el plan gratuito y la verificación del dominio
// remitente antes de activarlo. No se ha probado contra el servicio real (no hay clave).
export function createResendSender({ apiKey, from, fetchFn = fetch }: Options): EmailSender {
  return {
    async send(message: EmailMessage): Promise<SendResult> {
      if (!apiKey) return { ok: false, reason: 'MISCONFIGURED' };
      try {
        const response = await fetchFn(RESEND_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
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
