import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { fillForm, startBooking, submitForm } from './helpers/booking-flow';
import {
  activeAppointmentsAt,
  appointmentsByEmail,
  deleteAppointmentsByEmail,
  idByName,
} from './helpers/supabase-admin';

// T-005b: reserva de invitada de extremo a extremo (CA-10, CA-25, CA-28).
// Usa «Tratamiento hidratante» (30 min, solo Irene). Cada test usa una hora distinta y cada
// proyecto (escritorio y móvil) las suyas, para no pisarse al ejecutarse en paralelo.
// T-023: el teléfono de la invitada es distinto del del salón (+34 600 000 000), que ahora se ve en el pie y en la ayuda:
// así «no se muestran datos personales» sigue comprobando algo.
const GUEST_PHONE = '+34 611 987 654';
const TIMES = { chromium: ['10:00', '11:00', '12:00', '13:00'], mobile: ['14:00', '15:00', '16:00', '17:00'] };

function timesFor(projectName: string): string[] {
  return projectName === 'mobile' ? TIMES.mobile : TIMES.chromium;
}

test.describe('reservar: reserva de invitada', () => {
  test('CA-10: con datos válidos y consentimiento se crea la cita y se muestra la confirmación', async ({
    page,
    context,
  }, testInfo) => {
    const email = `e2e-${randomUUID()}@test.invalid`;
    const [time] = timesFor(testInfo.project.name);
    try {
      await startBooking(page, time ?? '10:00');
      await fillForm(page, email, { phone: GUEST_PHONE });
      await submitForm(page);

      await expect(page).toHaveURL(/\/reservar\/confirmada$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Reserva confirmada' })).toBeVisible();
      await expect(page.getByText('Tratamiento hidratante')).toBeVisible();
      await expect(page.getByText('Irene Solís')).toBeVisible();
      await expect(page.getByText(time ?? '10:00', { exact: true })).toBeVisible();

      // Privacidad: ni la URL ni la página muestran datos personales.
      expect(page.url()).not.toContain('?');
      const body = (await page.locator('body').innerText()).toLowerCase();
      expect(body).not.toContain(email);
      expect(body).not.toContain('ana garcía');
      expect(body).not.toContain('611 987 654');

      // La cookie de confirmación es httpOnly y no llega a los scripts.
      const cookie = (await context.cookies()).find((c) => c.name === 'reserva_confirmada');
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.path).toBe('/reservar');
      expect(await page.evaluate(() => document.cookie)).not.toContain('reserva_confirmada');

      // CA-10 y CA-25: la cita existe, confirmada, de invitada, con consentimiento.
      const rows = await appointmentsByEmail(email);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('confirmed');
      expect(rows[0]?.user_id).toBeNull();
      expect(rows[0]?.guest_name).toBe('Ana García');
      expect(rows[0]?.consent_version).toBe('borrador-1');
      expect(rows[0]?.consent_at).not.toBeNull();
    } finally {
      await deleteAppointmentsByEmail(email);
    }
  });

  test('CA-10 y CA-25: sin datos ni consentimiento se muestran errores por campo y no se crea la cita', async ({
    page,
  }, testInfo) => {
    const time = timesFor(testInfo.project.name)[1] ?? '11:00';
    const startsAt = await startBooking(page, time);
    const stylistId = await idByName('stylists', 'Irene Solís');

    await submitForm(page);
    await expect(page.getByText('Escribe tu nombre')).toBeVisible();
    await expect(page.getByText(/Escribe un email válido/)).toBeVisible();
    await expect(page.getByText(/Escribe un teléfono válido/)).toBeVisible();
    await expect(page.getByText('Debes aceptar para poder reservar')).toBeVisible();

    // Accesibilidad de los errores: campos marcados, descritos y con el foco en el primero.
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveAttribute('aria-describedby', /name-error/);
    await expect(page.getByLabel('Nombre', { exact: true })).toBeFocused();

    await expect(page).toHaveURL(/\/reservar\?servicio=/);
    expect(await activeAppointmentsAt(stylistId, startsAt, 30)).toEqual([]);
  });

  test('CA-25: con todo válido salvo el consentimiento no se crea la cita', async ({ page }, testInfo) => {
    const email = `e2e-${randomUUID()}@test.invalid`;
    const time = timesFor(testInfo.project.name)[2] ?? '12:00';
    try {
      await startBooking(page, time);
      await fillForm(page, email);
      await page.getByRole('checkbox').uncheck();
      await submitForm(page);

      await expect(page.getByText('Debes aceptar para poder reservar')).toBeVisible();
      await expect(page.getByLabel('Nombre', { exact: true })).not.toHaveAttribute('aria-invalid', 'true');
      expect(await appointmentsByEmail(email)).toEqual([]);
    } finally {
      await deleteAppointmentsByEmail(email);
    }
  });

  test('un email o un teléfono inválidos solo marcan su campo', async ({ page }, testInfo) => {
    const time = timesFor(testInfo.project.name)[3] ?? '13:00';
    await startBooking(page, time);
    await fillForm(page, 'no-es-un-email', { phone: '12' });
    await submitForm(page);

    await expect(page.getByText(/Escribe un email válido/)).toBeVisible();
    await expect(page.getByText(/Escribe un teléfono válido/)).toBeVisible();
    await expect(page.getByText('Escribe tu nombre')).toHaveCount(0);
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  });

  test('CA-28: con el honeypot relleno no se crea la cita y el mensaje no delata el motivo', async ({
    page,
  }, testInfo) => {
    const email = `e2e-${randomUUID()}@test.invalid`;
    const alt = testInfo.project.name === 'mobile' ? '18:00' : '18:30'; // no crea cita, pero se separa de las demás
    try {
      await startBooking(page, alt);
      await fillForm(page, email);
      await page.locator('input[name="website"]').fill('https://spam.example', { force: true });
      await submitForm(page);

      // (Next añade su propio role="alert" para anunciar rutas: se filtra por el texto.)
      const alert = page.getByRole('alert').filter({ hasText: 'No hemos podido completar la reserva' });
      await expect(alert).toBeVisible();
      const text = ((await alert.innerText()) ?? '').toLowerCase();
      for (const pista of ['honeypot', 'spam', 'bot', 'robot', 'website', 'campo']) {
        expect(text).not.toContain(pista);
      }
      await expect(page).not.toHaveURL(/confirmada/);
      expect(await appointmentsByEmail(email)).toEqual([]);
    } finally {
      await deleteAppointmentsByEmail(email);
    }
  });

  test('el honeypot es invisible y no se puede alcanzar con el teclado ni con lectores de pantalla', async ({
    page,
  }, testInfo) => {
    await startBooking(page, testInfo.project.name === 'mobile' ? '18:30' : '19:00');
    const honeypot = page.locator('input[name="website"]');
    await expect(honeypot).toHaveAttribute('tabindex', '-1');
    await expect(honeypot).toHaveAttribute('autocomplete', 'off');
    await expect(page.locator('div[aria-hidden="true"]', { has: honeypot })).toHaveCount(1);
    // Una persona navegando con Tab nunca lo enfoca.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.getAttribute('name'))).not.toBe('website');
    }
  });

  test('/reservar/confirmada sin una reserva reciente muestra «No encontramos tu reserva»', async ({ page }) => {
    await page.goto('/reservar/confirmada');
    await expect(page.getByRole('heading', { level: 1, name: 'No encontramos tu reserva' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reservar una cita' })).toHaveAttribute('href', '/reservar');
    await expect(page.getByRole('link', { name: 'Contacto' }).first()).toBeVisible();
  });
});
