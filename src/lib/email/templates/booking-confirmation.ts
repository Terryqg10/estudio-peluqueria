import { formatLongDate, formatSlotTime, madridDateOf } from '@/lib/booking/dates';
import type { EmailMessage } from '../types';

export type BookingConfirmationData = {
  salonName: string;
  guestName: string;
  serviceName: string;
  stylistName: string;
  startsAt: string; // ISO UTC
  link: string; // enlace personal a la cita
};

// Todo lo que escribe una persona (nombre) o viene de la BD se escapa al ir en HTML.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function renderBookingConfirmation(
  data: BookingConfirmationData,
): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const day = capitalize(formatLongDate(madridDateOf(data.startsAt)));
  const time = formatSlotTime(data.startsAt);

  // El enlace lleva un token personal: no va en el asunto.
  const subject = `Tu cita en ${data.salonName}: ${day} a las ${time}`;

  const text = [
    `Hola, ${data.guestName}:`,
    '',
    'Tu cita está confirmada.',
    '',
    `Servicio: ${data.serviceName}`,
    `Estilista: ${data.stylistName}`,
    `Día: ${day}`,
    `Hora: ${time}`,
    '',
    'Puedes ver tu cita en este enlace personal:',
    data.link,
    '',
    'No lo compartas: quien lo tenga puede ver tu cita.',
    '',
    data.salonName,
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="es"><body>',
    `<p>Hola, ${escapeHtml(data.guestName)}:</p>`,
    '<p>Tu cita está confirmada.</p>',
    '<ul>',
    `<li>Servicio: ${escapeHtml(data.serviceName)}</li>`,
    `<li>Estilista: ${escapeHtml(data.stylistName)}</li>`,
    `<li>Día: ${escapeHtml(day)}</li>`,
    `<li>Hora: ${escapeHtml(time)}</li>`,
    '</ul>',
    `<p><a href="${escapeHtml(data.link)}">Ver mi cita</a></p>`,
    '<p>No compartas este enlace: quien lo tenga puede ver tu cita.</p>',
    `<p>${escapeHtml(data.salonName)}</p>`,
    '</body></html>',
  ].join('\n');

  return { subject, text, html };
}
