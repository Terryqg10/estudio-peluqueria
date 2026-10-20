'use server';

import { headers } from 'next/headers';
import { requestLoginLink } from '@/lib/account/request-login-link';
import type { LoginFormState } from '@/lib/account/schema';
import { getClientIpHash } from '@/lib/booking/client-ip.server';

// Pide el enlace mágico (ADR-0021). Es la acción del <form>: funciona también antes de que cargue
// el JavaScript (el email viaja en el cuerpo del POST, nunca en la URL). La entrada llega del
// navegador: se valida con Zod dentro.
export async function requestLoginLinkAction(
  _previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const raw = formData.get('email');
  const email = typeof raw === 'string' ? raw : '';

  // Hash de la IP para el cupo por IP. Si en producción falta la sal, se falla cerrado.
  const ip = getClientIpHash(await headers());
  if (!ip.ok) return { status: 'unavailable', email };

  const result = await requestLoginLink({ email }, { ipHash: ip.ipHash });
  if (result.ok) return { status: 'sent', email };
  if (result.error === 'INVALID_INPUT') return { status: 'invalid', email, message: result.message };
  return { status: 'unavailable', email };
}
