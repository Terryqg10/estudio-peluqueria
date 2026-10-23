import { z } from 'zod';
import { isAdminSession } from '@/lib/account/require-admin';
import { createAuthClient } from '@/lib/supabase/auth-server';
import { createServiceClient } from '@/lib/supabase/service-client';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; error: 'UNAUTHENTICATED' | 'NOT_ALLOWED' | 'INVALID_INPUT' | 'UNAVAILABLE' };

// Confirmación explícita de una acción irreversible: sin `true` no se hace nada.
const ConfirmSchema = z.literal(true);

// Borrado de la cuenta de la clienta y anonimización de sus citas (T-012, RF-09, CA-26, ADR-0030).
// La identidad sale de la sesión (cookie), nunca de la entrada. Orden: anonimizar en la BD y
// DESPUÉS eliminar el usuario de Auth (si se hiciera al revés, `user_id` pasaría a null y la
// restricción de dueño lo impediría). Si Auth falla, repetir es inocuo. La cuenta de Admin no se
// borra desde aquí.
export async function deleteAccountData(input: unknown): Promise<DeleteAccountResult> {
  if (!ConfirmSchema.safeParse(input).success) return { ok: false, error: 'INVALID_INPUT' };

  try {
    const auth = await createAuthClient();
    const service = createServiceClient();
    if (!auth || !service) return { ok: false, error: 'UNAVAILABLE' };

    const { data } = await auth.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return { ok: false, error: 'UNAUTHENTICATED' };
    if (await isAdminSession(auth)) return { ok: false, error: 'NOT_ALLOWED' };

    const cleared = await service.rpc('delete_account_data', { p_user_id: userId });
    if (cleared.error) return { ok: false, error: 'UNAVAILABLE' };

    const removed = await service.auth.admin.deleteUser(userId);
    if (removed.error) return { ok: false, error: 'UNAVAILABLE' };

    // La sesión ya no es válida; se limpia la cookie. Un fallo aquí no deshace el borrado.
    await auth.auth.signOut().catch(() => undefined);
    return { ok: true };
  } catch {
    return { ok: false, error: 'UNAVAILABLE' };
  }
}
