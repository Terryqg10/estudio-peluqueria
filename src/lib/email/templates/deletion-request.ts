import type { EmailMessage } from '../types';
import { escapeHtml } from './booking-confirmation';

export type DeletionRequestData = {
  salonName: string;
  link: string; // enlace de un solo uso para confirmar el borrado
};

// Correo de confirmación del borrado de datos (T-020, ADR-0032). El enlace lleva un token: no va en el asunto.
export function renderDeletionRequest(
  data: DeletionRequestData,
): Pick<EmailMessage, 'subject' | 'text' | 'html'> {
  const subject = `Confirma el borrado de tus datos en ${data.salonName}`;

  const text = [
    'Hola:',
    '',
    `Hemos recibido una solicitud para borrar los datos personales asociados a este email en ${data.salonName}.`,
    '',
    'Para confirmarla, abre este enlace y pulsa el botón. Caduca en una hora y solo sirve una vez:',
    data.link,
    '',
    'Se borrarán tu nombre, email y teléfono de tus citas y las citas futuras se cancelarán. No se puede deshacer.',
    '',
    'Si no lo has pedido tú, ignora este correo: no se borrará nada.',
    '',
    data.salonName,
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="es"><body>',
    '<p>Hola:</p>',
    `<p>Hemos recibido una solicitud para borrar los datos personales asociados a este email en ${escapeHtml(data.salonName)}.</p>`,
    `<p><a href="${escapeHtml(data.link)}">Confirmar el borrado de mis datos</a></p>`,
    '<p>El enlace caduca en una hora y solo sirve una vez.</p>',
    '<p>Se borrarán tu nombre, email y teléfono de tus citas y las citas futuras se cancelarán. No se puede deshacer.</p>',
    '<p>Si no lo has pedido tú, ignora este correo: no se borrará nada.</p>',
    `<p>${escapeHtml(data.salonName)}</p>`,
    '</body></html>',
  ].join('\n');

  return { subject, text, html };
}
