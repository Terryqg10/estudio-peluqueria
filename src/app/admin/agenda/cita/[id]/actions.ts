'use server';

import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/account/require-admin';
import {
  AppointmentIdSchema,
  cancelAppointmentAsAdmin,
  moveAppointment,
  type ManageResult,
} from '@/lib/admin/manage-appointment';
import { LocalDateSchema, mondayOf, weekHref } from '@/lib/admin/week';
import { todayInMadrid } from '@/lib/booking/dates';
import { ROUTES } from '@/lib/routes';

// Acciones del panel (T-008b/c, ADR-0026). Se pueden llamar directamente desde el navegador: cada una
// empieza por `requireAdmin()` (una clienta recibe 404, un anónimo va a /acceso) y valida con Zod.

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function agendaUrl(date: string, notice: 'movida' | 'cancelada'): string {
  return `${weekHref(ROUTES.adminAgenda, mondayOf(date), date)}&aviso=${notice}`;
}

function detailUrl(id: string, error: string, date: string | null): string {
  const params = new URLSearchParams({ error });
  if (date) params.set('dia', date);
  return `${ROUTES.adminAgenda}/cita/${id}?${params.toString()}`;
}

function finish(result: ManageResult, id: string, notice: 'movida' | 'cancelada', date: string | null): never {
  if (result.ok) redirect(agendaUrl(result.date, notice));
  redirect(detailUrl(id, result.error, date));
}

export async function moveAppointmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = text(formData, 'id');
  const day = LocalDateSchema.safeParse(text(formData, 'dia'));
  const result = await moveAppointment(admin.client, { appointmentId: id, slot: text(formData, 'slot') });
  finish(result, AppointmentIdSchema.safeParse(id).success ? id : '', 'movida', day.success ? day.data : null);
}

export async function cancelAppointmentAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = text(formData, 'id');
  const day = LocalDateSchema.safeParse(text(formData, 'dia'));
  const date = day.success ? day.data : todayInMadrid();
  const result = await cancelAppointmentAsAdmin(admin.client, id, date);
  finish(result, AppointmentIdSchema.safeParse(id).success ? id : '', 'cancelada', date);
}
