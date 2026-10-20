import { createAuthClient } from '@/lib/supabase/auth-server';
import { isAdminSession } from './require-admin';
import { TokenHashSchema, type ConfirmResult } from './schema';

// Canjea el `token_hash` del enlace y abre la sesión (cookie de servidor). Un enlace caducado, ya
// usado, manipulado o con forma incorrecta da el MISMO resultado: no revela cuál (ADR-0021).
export async function confirmLoginLink(rawTokenHash: unknown): Promise<ConfirmResult> {
  const tokenHash = TokenHashSchema.safeParse(rawTokenHash);
  if (!tokenHash.success) return { ok: false, error: 'INVALID_LINK' };

  const client = await createAuthClient();
  if (!client) return { ok: false, error: 'UNAVAILABLE' };

  const { error } = await client.auth.verifyOtp({ type: 'email', token_hash: tokenHash.data });
  if (error) {
    // 5xx = fallo del servicio; 4xx = enlace malo.
    return { ok: false, error: error.status !== undefined && error.status >= 500 ? 'UNAVAILABLE' : 'INVALID_LINK' };
  }
  // El destino lo decide el rol de la BD, nunca algo que mande el navegador (ADR-0022).
  return { ok: true, destination: (await isAdminSession(client)) ? 'admin' : 'cuenta' };
}
