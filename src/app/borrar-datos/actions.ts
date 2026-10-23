'use server';

import { headers } from 'next/headers';
import { getClientIpHash } from '@/lib/booking/client-ip.server';
import { requestGuestDeletion } from '@/lib/privacy/request-guest-deletion';
import type { DeletionFormState } from '@/lib/privacy/schema';

// Pide el borrado con el email (T-020, ADR-0032). Es la acción del <form>: funciona también antes de
// que cargue el JavaScript (el email viaja en el cuerpo del POST, nunca en la URL). La entrada llega
// del navegador: se valida con Zod dentro.
export async function requestGuestDeletionAction(
  _previous: DeletionFormState,
  formData: FormData,
): Promise<DeletionFormState> {
  const raw = formData.get('email');
  const email = typeof raw === 'string' ? raw : '';

  // Hash de la IP para el cupo por IP. Si en producción falta la sal, se falla cerrado.
  const ip = getClientIpHash(await headers());
  if (!ip.ok) return { status: 'unavailable', email };

  const result = await requestGuestDeletion({ email }, { ipHash: ip.ipHash });
  if (result.ok) return { status: 'sent', email };
  if (result.error === 'INVALID_INPUT') return { status: 'invalid', email, message: result.message };
  return { status: 'unavailable', email };
}
