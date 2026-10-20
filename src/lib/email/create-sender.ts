import type { EmailEnv } from './env.server';
import { createMailpitSender } from './mailpit-sender';
import { createResendSender } from './resend-sender';
import type { EmailSender, FetchFn } from './types';

// Elige el adaptador solo por el entorno (CA-30): cambiar de proveedor no toca el código.
export function createEmailSender(env: EmailEnv, fetchFn?: FetchFn): EmailSender | null {
  if (env.provider === 'mailpit') {
    return createMailpitSender({ baseUrl: env.mailpitUrl, from: env.from, fetchFn });
  }
  if (env.provider === 'resend' && env.resendApiKey) {
    return createResendSender({ apiKey: env.resendApiKey, from: env.from, fetchFn });
  }
  return null;
}
