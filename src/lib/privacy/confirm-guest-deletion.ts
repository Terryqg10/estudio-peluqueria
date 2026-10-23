import { TokenSchema } from '@/lib/booking/token';
import { createPublicClient } from '@/lib/supabase/public-client';

export type ConfirmDeletionResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_LINK' | 'UNAVAILABLE' };

// Confirma el borrado con el token del email (T-020, RF-09, CA-40). La BD valida el token (un solo uso,
// 1 h) y anonimiza; aquí solo se valida la forma y se traducen los errores. Un token con mala forma,
// desconocido, caducado o ya usado dan la MISMA respuesta. Nunca lanza.
export async function confirmGuestDeletion(input: unknown): Promise<ConfirmDeletionResult> {
  const token = TokenSchema.safeParse(input);
  if (!token.success) return { ok: false, error: 'INVALID_LINK' };

  try {
    const client = createPublicClient();
    if (!client) return { ok: false, error: 'UNAVAILABLE' };

    const { data, error } = await client.rpc('confirm_guest_deletion', { p_token: token.data });
    if (error) {
      return { ok: false, error: error.message === 'INVALID_TOKEN' ? 'INVALID_LINK' : 'UNAVAILABLE' };
    }
    return typeof data === 'number' ? { ok: true } : { ok: false, error: 'UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
