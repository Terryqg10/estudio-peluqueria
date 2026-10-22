'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/account/require-admin';
import { saveService, type SaveServiceError } from '@/lib/admin/services';
import { ROUTES } from '@/lib/routes';

// Acción del formulario de servicios (T-009a). Se puede llamar directamente desde el navegador: empieza por
// `requireAdmin()` y valida con Zod dentro de `saveService`.

export type ServiceFormState = {
  error: string | null;
  fieldErrors: Partial<Record<'name' | 'category' | 'price' | 'duration', string>>;
  values: { name: string; category: string; price: string; duration: string; active: boolean; stylistIds: string[] };
} | null;

const MESSAGES: Record<SaveServiceError, string> = {
  FORBIDDEN: 'No tienes permiso para esta acción.',
  NOT_FOUND: 'El servicio ya no existe.',
  INVALID_INPUT: 'Revisa los datos marcados.',
  DUPLICATE_NAME: 'Ya hay un servicio con ese nombre. Elige otro.',
  UNAVAILABLE: 'No hemos podido guardar el servicio. Inténtalo de nuevo en unos minutos.',
};

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function saveServiceAction(_previous: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  const admin = await requireAdmin();
  const id = text(formData, 'id') || null;
  const values = {
    name: text(formData, 'name'),
    category: text(formData, 'category'),
    price: text(formData, 'price'),
    duration: text(formData, 'duration'),
    active: formData.get('active') === 'on',
    stylistIds: formData.getAll('stylists').filter((v): v is string => typeof v === 'string'),
  };

  const result = await saveService(admin.client, id, values);
  if (!result.ok) {
    return { error: MESSAGES[result.error], fieldErrors: result.fieldErrors ?? {}, values };
  }
  redirect(`${ROUTES.adminServicios}?aviso=guardado`);
}
