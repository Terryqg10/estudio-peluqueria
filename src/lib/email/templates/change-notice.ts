import { formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import type { EmailMessage } from '../types';
import { escapeHtml } from './booking-confirmation';

export type ChangeKind = 'cancelled' | 'rescheduled';

export type ChangeNoticeData = {
  kind: ChangeKind;
  salonName: string;
  guestName: string;
  serviceName: string;
  stylistName: string;
  startsAt: string; // ISO UTC: la cita cancelada o la nueva fecha de la cita cambiada
  reserveLink: string; // /reservar, para pedir otra cita tras cancelar
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Aviso tras cancelar o cambiar la cita desde su enlace (T-006d, ADR-0033). No lleva el enlace
// personal de la cita (no se emite un token nuevo: invalidaría el del email anterior). Todo lo que
// escribe una persona (nombre) o viene de la BD se escapa al ir en HTML.
export function renderChangeNotice(
  data: ChangeNoticeData,
): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const day = capitalize(formatLongDate(madridDateOf(data.startsAt)));
  const time = formatSlotTime(data.startsAt);
  const cancelled = data.kind === 'cancelled';

  const subject = cancelled
    ? `Tu cita en ${data.salonName} ha sido cancelada`
    : `Tu cita en ${data.salonName} ha cambiado: ${day} a las ${time}`;

  const headline = cancelled ? 'Hemos cancelado tu cita.' : 'Hemos cambiado tu cita. Estos son sus nuevos datos.';
  const closing = cancelled
    ? `Si quieres reservar otra, puedes hacerlo aquí: ${data.reserveLink}`
    : 'Puedes seguir gestionando tu cita con el mismo enlace del correo de confirmación.';

  const text = [
    `Hola, ${data.guestName}:`,
    '',
    headline,
    '',
    `Servicio: ${data.serviceName}`,
    `Estilista: ${data.stylistName}`,
    `Día: ${day}`,
    `Hora: ${time}`,
    '',
    closing,
    '',
    'Si no has sido tú, contacta con el salón.',
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
    `<li>Día: ${escapeHtml(day)}</li>`,
    `<li>Hora: ${escapeHtml(time)}</li>`,
    '</ul>',
    cancelled
      ? `<p><a href="${escapeHtml(data.reserveLink)}">Reservar otra cita</a></p>`
      : `<p>${escapeHtml(closing)}</p>`,
    '<p>Si no has sido tú, contacta con el salón.</p>',
    `<p>${escapeHtml(data.salonName)}</p>`,
    '</body></html>',
  ].join('\n');

  return { subject, text, html };
}
