'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/account/require-admin';
import { createTimeBlocks, removeTimeBlock, type Conflict } from '@/lib/admin/time-blocks';
import { ROUTES } from '@/lib/routes';

// Acciones de bloqueos y vacaciones (T-009b, ADR-0028). Se pueden llamar directamente desde el navegador:
// empiezan por `requireAdmin()` y validan con Zod dentro de `createTimeBlocks`.

export type BlockFormValues = {
  kind: 'vacation' | 'block';
  stylist: string;
  from: string;
  to: string;
  startTime: string;
  endTime: string;
  note: string;
};

export type BlockFormState = {
  error: string | null;
  fieldErrors: Partial<Record<'from' | 'to' | 'startTime' | 'endTime' | 'note' | 'stylist', string>>;
  conflicts: Conflict[];
  values: BlockFormValues;
} | null;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createBlockAction(_previous: BlockFormState, formData: FormData): Promise<BlockFormState> {
  const admin = await requireAdmin();
  const kind = text(formData, 'kind') === 'block' ? 'block' : 'vacation';
  const values: BlockFormValues = {
    kind,
    stylist: text(formData, 'stylist'),
    from: text(formData, 'from'),
    to: text(formData, 'to'),
    startTime: text(formData, 'startTime'),
    endTime: text(formData, 'endTime'),
    note: text(formData, 'note'),
  };

  const result = await createTimeBlocks(admin.client, {
    kind,
    stylist: values.stylist,
    from: values.from,
    to: kind === 'vacation' ? values.to : undefined,
    startTime: kind === 'block' ? values.startTime : undefined,
    endTime: kind === 'block' ? values.endTime : undefined,
    note: values.note,
  });

  if (result.ok) redirect(`${ROUTES.adminBloqueos}?aviso=creado`);

  const messages = {
    FORBIDDEN: 'No tienes permiso para esta acción.',
    INVALID_INPUT: 'Revisa los datos marcados.',
    CONFLICT:
      'Hay citas en ese rango. Muévelas o cancélalas y vuelve a intentarlo: no se ha creado ningún bloqueo.',
    UNAVAILABLE: 'No hemos podido guardar el bloqueo. Inténtalo de nuevo en unos minutos.',
  } as const;
  return {
    error: messages[result.error],
    fieldErrors: result.fieldErrors ?? {},
    conflicts: result.conflicts ?? [],
    values,
  };
}

export async function removeBlockAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const ok = await removeTimeBlock(admin.client, text(formData, 'id'));
  redirect(`${ROUTES.adminBloqueos}?aviso=${ok ? 'quitado' : 'error'}`);
}
