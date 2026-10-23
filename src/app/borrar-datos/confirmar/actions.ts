'use server';

import { redirect } from 'next/navigation';
import { confirmGuestDeletion } from '@/lib/privacy/confirm-guest-deletion';
import { ROUTES } from '@/lib/routes';

// Confirma el borrado SOLO al pulsar el botón (POST): así un antivirus o un previsualizador de enlaces
// que abra la URL con GET no gasta el enlace de un solo uso (ADR-0032, como ADR-0021).
export async function confirmGuestDeletionAction(formData: FormData): Promise<void> {
  const result = await confirmGuestDeletion(formData.get('token'));
  redirect(
    `${ROUTES.borrarDatosConfirmar}?${
      result.ok ? 'hecho=1' : `error=${result.error === 'UNAVAILABLE' ? 'servicio' : 'enlace'}`
    }`,
  );
}
