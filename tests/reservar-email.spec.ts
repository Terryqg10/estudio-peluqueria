import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { fillForm, startBooking, submitForm } from './helpers/booking-flow';
import { deleteEmailsTo, waitForEmail } from './helpers/mailpit';
import {
  appointmentsByEmail,
  createAppointmentWithToken,
  deleteAppointment,
  deleteAppointmentsByEmail,
  emailSentAt,
  issueToken,
} from './helpers/supabase-admin';

// T-006a: email de confirmación y enlace de la cita (CA-11, CA-30). El correo se lee de Mailpit
// (Supabase local). Horas propias de este archivo para no pisar a las demás reservas de los e2e.
// T-023: el teléfono de la invitada es distinto del del salón (+34 600 000 000), que ahora se ve en el pie y en la ayuda:
// así «no se muestran datos personales» sigue comprobando algo.
const GUEST_PHONE = '+34 611 987 654';
const TIME = { chromium: '14:30', mobile: '15:30' };

const INVALID_HEADING = 'Enlace no válido o caducado';

async function openCita(page: Page, path: string) {
  return page.goto(path);
}

// Texto visible de <main>: sirve para comprobar que las respuestas no válidas son idénticas.
const mainText = (page: Page) => page.locator('main').innerText();

test.describe('email de confirmación y enlace de la cita', () => {
  test('CA-11 y CA-30: tras reservar llega un email con un enlace personal que abre solo esa cita', async ({
    page,
  }, testInfo) => {
    const email = `e2e-${randomUUID()}@test.invalid`;
    const time = testInfo.project.name === 'mobile' ? TIME.mobile : TIME.chromium;
    try {
      await startBooking(page, time);
      await fillForm(page, email, { name: 'Ana García', phone: GUEST_PHONE });
      await submitForm(page);

      // La confirmación informa del envío y no expone el token ni datos personales.
      await expect(page).toHaveURL(/\/reservar\/confirmada$/);
      await expect(page.getByText('Te hemos enviado un email con el enlace personal de tu cita.')).toBeVisible();
      await expect(page.getByText('No hemos podido enviarte el email')).toHaveCount(0);

      // La cita queda marcada como enviada.
      const rows = await appointmentsByEmail(email);
      expect(rows).toHaveLength(1);
      expect(await emailSentAt(rows[0]?.id ?? '')).not.toBeNull();

      // El correo llegó a la bandeja local (CA-30).
      const mail = await waitForEmail(email);
      expect(mail.subject).toMatch(new RegExp(`^Tu cita en Atelier Malva: .+ a las ${time}$`));
      expect(mail.text).toContain('Tratamiento hidratante');
      expect(mail.text).toContain('Irene Solís');
      expect(mail.text).toContain(time);
      expect(mail.html).toContain('Ver mi cita');
      expect(mail.linkPath).toMatch(/^\/cita\/[A-Za-z0-9_-]{43}$/);

      // El token no está en el asunto ni en la página de confirmación ni en su HTML.
      const token = (mail.linkPath ?? '').replace('/cita/', '');
      expect(mail.subject).not.toContain(token);
      expect(await page.content()).not.toContain(token);
      expect(page.url()).not.toContain(token);

      // El enlace abre la cita, solo lectura y sin datos personales.
      const response = await openCita(page, mail.linkPath ?? '/cita/x');
      expect(response?.headers()['cache-control'] ?? '').toContain('no-store');
      await expect(page.getByRole('heading', { level: 1, name: 'Tu cita' })).toBeVisible();
      const main = page.locator('main');
      await expect(main.getByText('Tratamiento hidratante')).toBeVisible();
      await expect(main.getByText('Irene Solís')).toBeVisible();
      await expect(main.getByText(time, { exact: true })).toBeVisible();
      await expect(main.getByText('Confirmada')).toBeVisible();
      const text = (await mainText(page)).toLowerCase();
      expect(text).not.toContain(email);
      expect(text).not.toContain('ana garcía');
      expect(text).not.toContain('611 987 654');

      // El token de la URL no se indexa ni se filtra por la cabecera Referer.
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    } finally {
      await deleteAppointmentsByEmail(email);
      await deleteEmailsTo(email);
    }
  });

  test('CA-11: un enlace manipulado, incompleto, desconocido o mal formado muestra siempre lo mismo', async ({
    page,
  }) => {
    const { id, token } = await createAppointmentWithToken();
    try {
      // Válido: sirve de contraste.
      await openCita(page, `/cita/${token}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Tu cita' })).toBeVisible();
      const validText = await mainText(page);

      const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'); // manipulado, misma forma
      const cases: Record<string, string> = {
        'manipulado (un carácter cambiado)': flipped,
        'incompleto (42 de 43 caracteres)': token.slice(0, 42),
        'desconocido con la forma correcta': 'A'.repeat(43),
        'demasiado largo': token + 'x',
        'mal formado (caracteres no válidos)': 'esto-no-es-un-token!!',
        'demasiado corto': 'abc',
      };

      const texts: string[] = [];
      for (const [name, bad] of Object.entries(cases)) {
        await openCita(page, `/cita/${encodeURIComponent(bad)}`);
        await expect(page.getByRole('heading', { level: 1, name: INVALID_HEADING }), name).toBeVisible();
        texts.push(await mainText(page));
      }
      // Misma respuesta para todos: no se puede distinguir entre «no existe», «manipulado» o «mal formado».
      expect(new Set(texts).size).toBe(1);
      expect(texts[0]).not.toBe(validText);
      expect(texts[0]).not.toContain('Tratamiento hidratante');
    } finally {
      await deleteAppointment(id);
    }
  });

  test('CA-11: un enlace caducado (cita ya pasada) muestra «enlace no válido»', async ({ page }) => {
    const { id, token } = await createAppointmentWithToken({ past: true });
    try {
      await openCita(page, `/cita/${token}`);
      await expect(page.getByRole('heading', { level: 1, name: INVALID_HEADING })).toBeVisible();
      await expect(page.getByText('Tratamiento hidratante')).toHaveCount(0);
    } finally {
      await deleteAppointment(id);
    }
  });

  test('CA-11: al emitir un token nuevo, el enlace anterior queda invalidado', async ({ page }) => {
    const { id, token: first } = await createAppointmentWithToken();
    try {
      const second = await issueToken(id);
      expect(second).not.toBe(first);

      await openCita(page, `/cita/${first}`);
      await expect(page.getByRole('heading', { level: 1, name: INVALID_HEADING })).toBeVisible();

      await openCita(page, `/cita/${second}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Tu cita' })).toBeVisible();
    } finally {
      await deleteAppointment(id);
    }
  });

  test('las páginas de la cita no desbordan entre 320 y 1280 px (válida y no válida)', async ({ page }) => {
    const { id, token } = await createAppointmentWithToken();
    try {
      for (const path of [`/cita/${token}`, `/cita/${'A'.repeat(43)}`]) {
        for (const width of [320, 375, 768, 1280]) {
          await page.setViewportSize({ width, height: 800 });
          await openCita(page, path);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `${path.slice(0, 12)}… a ${width}px`).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await deleteAppointment(id);
    }
  });
});
