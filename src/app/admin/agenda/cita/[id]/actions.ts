'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/account/require-admin';
import {
  AppointmentIdSchema,
  NoteSchema,
  cancelAppointmentAsAdmin,
  loadMoveSlots,
  moveAppointment,
  saveNote,
  type ManageResult,
} from '@/lib/admin/manage-appointment';
import { LocalDateSchema, mondayOf, weekHref } from '@/lib/admin/week';
import { todayInMadrid } from '@/lib/booking/dates';
import { ROUTES } from '@/lib/routes';

// Acciones del panel (T-008b/c/d, ADR-0026 y ADR-0027). Se pueden llamar directamente desde el navegador:
// cada una empieza por `requireAdmin()` (una clienta recibe 404, un anónimo va a /acceso) y valida con Zod.

type Notice = 'movida' | 'guardada' | 'cancelada';

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

// `notified` (T-018): si se avisó por email a la clienta; solo en movida y cancelada. Sin datos personales en la URL.
function agendaUrl(date: string, notice: Notice, notified?: boolean): string {
  const base = `${weekHref(ROUTES.adminAgenda, mondayOf(date), date)}&aviso=${notice}`;
  return notified === undefined ? base : `${base}&avisada=${notified ? '1' : '0'}`;
}

function detailUrl(id: string, error: string): string {
  return `${ROUTES.adminAgenda}/cita/${id}?${new URLSearchParams({ error }).toString()}`;
}

function finish(result: ManageResult, id: string, notice: Notice): never {
  if (result.ok) redirect(agendaUrl(result.date, notice, result.notified));
  redirect(detailUrl(id, result.error));
}

export type DaySlotsResult =
  | { ok: true; slots: { stylistId: string; startsAt: string }[] }
  | { ok: false };

// Huecos para mover la cita en un día (lo llama el formulario al elegir otro día del carrusel).
export async function loadDaySlotsAction(appointmentId: unknown, date: unknown): Promise<DaySlotsResult> {
  const admin = await requireAdmin();
  const id = AppointmentIdSchema.safeParse(appointmentId);
  if (!id.success || !LocalDateSchema.safeParse(date).success) return { ok: false };

  const slots = await loadMoveSlots(admin.client, id.data, date);
  if (slots === 'error') return { ok: false };
  return { ok: true, slots: slots.map((s) => ({ stylistId: s.stylistId, startsAt: s.startsAt })) };
}

// Guarda los cambios: mueve la cita si se eligió un hueco y guarda la nota. Si mover falla, no se guarda nada.
export async function saveAppointmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = text(formData, 'id');
  const safeId = AppointmentIdSchema.safeParse(id).success ? id : '';
  const day = LocalDateSchema.safeParse(text(formData, 'dia'));
  const currentDate = day.success ? day.data : todayInMadrid();

  const note = NoteSchema.safeParse(text(formData, 'nota'));
  if (!note.success) redirect(detailUrl(safeId, 'INVALID_INPUT'));

  const slot = text(formData, 'slot');
  let date = currentDate;
  let notice: Notice = 'guardada';
  let notified: boolean | undefined;
  if (slot !== '') {
    const moved = await moveAppointment(admin.client, { appointmentId: id, slot });
    if (!moved.ok) redirect(detailUrl(safeId, moved.error));
    date = moved.date;
    notice = 'movida';
    notified = moved.notified;
  }

  const saved = await saveNote(admin.client, id, note.data);
  if (!saved.ok) redirect(detailUrl(safeId, saved.error));
  redirect(agendaUrl(date, notice, notified));
}

export async function cancelAppointmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = text(formData, 'id');
  const day = LocalDateSchema.safeParse(text(formData, 'dia'));
  const date = day.success ? day.data : todayInMadrid();
  const result = await cancelAppointmentAsAdmin(admin.client, id, date);
  finish(result, AppointmentIdSchema.safeParse(id).success ? id : '', 'cancelada');
}
