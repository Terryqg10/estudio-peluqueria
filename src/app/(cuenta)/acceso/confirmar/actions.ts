'use server';

import { redirect } from 'next/navigation';
import { confirmLoginLink } from '@/lib/account/confirm-login';
import { ROUTES } from '@/lib/routes';

// Canjea el enlace SOLO al pulsar el botón (POST): así un antivirus o un previsualizador de enlaces
// que abra la URL con GET no gasta el enlace de un solo uso (ADR-0021).
export async function confirmLoginAction(formData: FormData): Promise<void> {
  const result = await confirmLoginLink(formData.get('token_hash'));
  if (result.ok) redirect(result.destination === 'admin' ? ROUTES.admin : ROUTES.misCitas);
  redirect(`${ROUTES.accesoConfirmar}?error=${result.error === 'UNAVAILABLE' ? 'servicio' : 'enlace'}`);
}
