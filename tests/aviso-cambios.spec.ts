import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { daysBetween, todayInMadrid } from '../src/lib/booking/dates';
import { nextDay, pickDay } from './helpers/booking-days';
import { deleteEmailsTo, emailCountTo, waitForEmail } from './helpers/mailpit';
import { madridInstant } from './integration/helpers/time';
import { createAppointmentWithToken, deleteAppointment, moveAppointmentSoon } from './helpers/supabase-admin';

// T-006d: aviso por email tras cancelar o cambiar la cita desde el enlace (CA-42, CA-43, ADR-0033).
// Como en cambiar.spec: un día laborable propio por proyecto (más lejano que el resto) y una hora propia (16:00).
function dayFor(projectName: string): string {
  const first = nextDay(8, (d) => d <= 5); // un día más lejos que el resto de e2e de cambio
  if (projectName !== 'mobile') return first;
  return nextDay(daysBetween(todayInMadrid(), first) + 1, (d) => d <= 5);
}

const newEmail = () => `aviso-${randomUUID()}@test.invalid`;

test.describe('aviso por email al cancelar o cambiar la cita', () => {
  test('CA-42: cancelar envía un aviso con el resumen y el enlace para reservar otra', async ({ page }) => {
    const email = newEmail();
    const { id, token } = await createAppointmentWithToken({ guestEmail: email });
    try {
      await page.goto(`/cita/${token}`);
      await page.getByRole('button', { name: 'Cancelar cita' }).click();
      await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();
      await expect(page.locator('main').getByText('Cancelada', { exact: true })).toBeVisible();

      const mail = await waitForEmail(email);
      expect(mail.subject).toBe('Tu cita en Atelier Malva ha sido cancelada');
      expect(mail.text).toContain('Hemos cancelado tu cita.');
      expect(mail.text).toContain('Irene Solís');
      expect(mail.text).toMatch(/\/reservar/);
      // No lleva el enlace personal de la cita ni el token.
      expect(mail.text).not.toContain(token);
      expect(await emailCountTo(email)).toBe(1);
    } finally {
      await deleteAppointment(id);
      await deleteEmailsTo(email);
    }
  });

  test('CA-42: cambiar envía un aviso con el nuevo día y hora, y el enlace de la cita sigue valiendo', async ({
    page,
  }, testInfo) => {
    const email = newEmail();
    const date = dayFor(testInfo.project.name);
    const { id, token } = await createAppointmentWithToken({
      startsAt: madridInstant(date, 16, 0),
      guestEmail: email,
    });
    try {
      await page.goto(`/cita/${token}/cambiar`);
      await pickDay(page, date);
      await page.locator('button[data-starts-at]', { hasText: /^16:30$/ }).click();
      await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
      await expect(page).toHaveURL(new RegExp(`/cita/${token}\\?cambiada=1$`));

      const mail = await waitForEmail(email);
      expect(mail.subject).toMatch(/^Tu cita en Atelier Malva ha cambiado: .+ a las 16:30$/);
      expect(mail.text).toContain('Hora: 16:30');
      expect(mail.text).toContain('mismo enlace');
      expect(mail.text).not.toContain(token);
      expect(await emailCountTo(email)).toBe(1);

      // El enlace anterior sigue sirviendo (el aviso no emitió un token nuevo).
      await page.goto(`/cita/${token}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Tu cita' })).toBeVisible();
    } finally {
      await deleteAppointment(id);
      await deleteEmailsTo(email);
    }
  });

  test('una cancelación rechazada (menos de 24 h) no envía ningún correo', async ({ page }) => {
    const email = newEmail();
    const { id, token } = await createAppointmentWithToken({ guestEmail: email });
    try {
      await page.goto(`/cita/${token}`);
      await page.getByRole('button', { name: 'Cancelar cita' }).click();
      // La cita se acerca después de cargar la página: el servidor la rechaza.
      await moveAppointmentSoon(id);
      await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();
      await expect(page.getByText('Faltan menos de 24 horas', { exact: false })).toBeVisible();
      expect(await emailCountTo(email)).toBe(0);
    } finally {
      await deleteAppointment(id);
      await deleteEmailsTo(email);
    }
  });
});
