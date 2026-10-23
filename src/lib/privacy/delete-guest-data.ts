import { TokenSchema } from '@/lib/booking/token';
import { createPublicClient } from '@/lib/supabase/public-client';

export type DeleteGuestDataResult =
  | { ok: true }
  | { ok: false; error: 'INVALID_LINK' | 'UNAVAILABLE' };

// Borrado de datos de la invitada con el token de su cita (T-012, RF-09, CA-26, ADR-0030). La BD
// (`delete_guest_data`) valida el token y anonimiza todas las citas de ese email; aquí solo se valida
// la forma y se traducen los errores. Un token con mala forma y uno desconocido dan la MISMA
// respuesta. Nunca lanza: cualquier fallo inesperado es `UNAVAILABLE`, sin detalles.
export async function deleteGuestData(input: unknown): Promise<DeleteGuestDataResult> {
  const token = TokenSchema.safeParse(input);
  if (!token.success) return { ok: false, error: 'INVALID_LINK' };

  try {
    const client = createPublicClient();
    if (!client) return { ok: false, error: 'UNAVAILABLE' };

    const { data, error } = await client.rpc('delete_guest_data', { p_token: token.data });
    if (error) {
      return { ok: false, error: error.message === 'INVALID_TOKEN' ? 'INVALID_LINK' : 'UNAVAILABLE' };
    }
    return typeof data === 'number' ? { ok: true } : { ok: false, error: 'UNAVAILABLE' };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
