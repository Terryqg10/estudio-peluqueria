// Email transaccional (ADR-0017). El adaptador NUNCA lanza: devuelve el resultado.
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type SendFailureReason = 'PROVIDER_ERROR' | 'TIMEOUT' | 'MISCONFIGURED';

export type SendResult = { ok: true } | { ok: false; reason: SendFailureReason };

export interface EmailSender {
  send(message: EmailMessage): Promise<SendResult>;
}

// `fetch` inyectable para poder probar los adaptadores sin red.
export type FetchFn = typeof fetch;

// Un envío lento no debe bloquear la reserva (ADR-0017).
export const SEND_TIMEOUT_MS = 5_000;
