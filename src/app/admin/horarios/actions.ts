'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/account/require-admin';
import { ScopeSchema, saveSchedule } from '@/lib/admin/schedules';
import type { Conflict } from '@/lib/admin/time-blocks';
import { ROUTES } from '@/lib/routes';

// Acción del formulario de horarios (T-009c, ADR-0029). Se puede llamar directamente desde el navegador:
// empieza por `requireAdmin()` y valida con Zod dentro de `saveSchedule`.

export type ScheduleFormState = { error: string | null; conflicts: Conflict[] } | null;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function saveScheduleAction(_previous: ScheduleFormState, formData: FormData): Promise<ScheduleFormState> {
  const admin = await requireAdmin();
  const scope = text(formData, 'scope');
  const result = await saveSchedule(admin.client, scope, parseJson(text(formData, 'ranges')));

  if (result.ok) {
    const quien = ScopeSchema.safeParse(scope).success ? scope : 'salon';
    redirect(`${ROUTES.adminHorarios}?quien=${quien}&aviso=guardado`);
  }

  const messages = {
    FORBIDDEN: 'No tienes permiso para esta acción.',
    INVALID_INPUT: result.message ?? 'Revisa los tramos: las horas de fin deben ser posteriores a las de inicio.',
    CONFLICT:
      'Hay citas que quedarían fuera de ese horario. Muévelas o cancélalas y vuelve a intentarlo: no se ha cambiado nada.',
    UNAVAILABLE: 'No hemos podido guardar el horario. Inténtalo de nuevo en unos minutos.',
  } as const;
  return { error: messages[result.error], conflicts: result.conflicts ?? [] };
}
