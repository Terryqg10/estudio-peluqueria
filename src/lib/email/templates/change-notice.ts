import { formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import type { EmailMessage } from '../types';
import { escapeHtml } from './booking-confirmation';

export type ChangeKind = 'cancelled' | 'rescheduled';
// Quién hizo el cambio: la propia invitada desde su enlace (T-006d) o el salón desde el panel (T-018).
export type ChangeOrigin = 'client' | 'salon';

export type ChangeNoticeData = {
  kind: ChangeKind;
  origin?: ChangeOrigin; // por defecto 'client'
  salonName: string;
  guestName: string;
  serviceName: string;
  stylistName: string;
  startsAt: string; // ISO UTC: la cita cancelada o la nueva fecha de la cita cambiada
  previousStartsAt?: string; // ISO UTC: la fecha anterior (solo cambios del salón)
  reserveLink: string; // /reservar, para pedir otra cita tras cancelar
  contactLink?: string; // /contacto, para los cambios del salón
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const when = (iso: string) => `${capitalize(formatLongDate(madridDateOf(iso)))} a las ${formatSlotTime(iso)}`;

// Aviso tras cancelar o cambiar la cita: desde el enlace (T-006d, ADR-0033) o desde el panel del salón
// (T-018, ADR-0035). No lleva el enlace personal de la cita (no se emite un token nuevo: invalidaría el
// del email anterior). Todo lo que escribe una persona (nombre) o viene de la BD se escapa al ir en HTML.
export function renderChangeNotice(
  data: ChangeNoticeData,
): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const day = capitalize(formatLongDate(madridDateOf(data.startsAt)));
  const time = formatSlotTime(data.startsAt);
  const cancelled = data.kind === 'cancelled';
  const salon = data.origin === 'salon';

  const subject = cancelled
    ? salon
      ? `El salón ha cancelado tu cita en ${data.salonName}`
      : `Tu cita en ${data.salonName} ha sido cancelada`
    : salon
      ? `El salón ha cambiado tu cita en ${data.salonName}: ${day} a las ${time}`
      : `Tu cita en ${data.salonName} ha cambiado: ${day} a las ${time}`;

  const headline = cancelled
    ? salon
      ? 'Sentimos avisarte de que el salón ha tenido que cancelar tu cita.'
      : 'Hemos cancelado tu cita.'
    : salon
      ? 'El salón ha cambiado tu cita. Estos son sus nuevos datos.'
      : 'Hemos cambiado tu cita. Estos son sus nuevos datos.';

  const previous = !cancelled && salon && data.previousStartsAt ? `Antes: ${when(data.previousStartsAt)}` : null;

  const closing = cancelled
    ? `Si quieres reservar otra, puedes hacerlo aquí: ${data.reserveLink}`
    : 'Puedes seguir gestionando tu cita con el mismo enlace del correo de confirmación.';
  const contact =
    salon && data.contactLink
      ? `Si esto no te viene bien o tienes dudas, contacta con el salón: ${data.contactLink}`
      : 'Si no has sido tú, contacta con el salón.';

  const text = [
    `Hola, ${data.guestName}:`,
    '',
    headline,
    '',
    `Servicio: ${data.serviceName}`,
    `Estilista: ${data.stylistName}`,
    ...(previous ? [previous] : []),
    `Día: ${day}`,
    `Hora: ${time}`,
    '',
    closing,
    '',
    contact,
    '',
    data.salonName,
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="es"><body>',
    `<p>Hola, ${escapeHtml(data.guestName)}:</p>`,
    `<p>${escapeHtml(headline)}</p>`,
    '<ul>',
    `<li>Servicio: ${escapeHtml(data.serviceName)}</li>`,
    `<li>Estilista: ${escapeHtml(data.stylistName)}</li>`,
    ...(previous ? [`<li>${escapeHtml(previous)}</li>`] : []),
    `<li>Día: ${escapeHtml(day)}</li>`,
    `<li>Hora: ${escapeHtml(time)}</li>`,
    '</ul>',
    cancelled
      ? `<p><a href="${escapeHtml(data.reserveLink)}">Reservar otra cita</a></p>`
      : `<p>${escapeHtml(closing)}</p>`,
    salon && data.contactLink
      ? `<p>Si esto no te viene bien o tienes dudas, <a href="${escapeHtml(data.contactLink)}">contacta con el salón</a>.</p>`
      : '<p>Si no has sido tú, contacta con el salón.</p>',
    `<p>${escapeHtml(data.salonName)}</p>`,
    '</body></html>',
  ].join('\n');

  return { subject, text, html };
}
