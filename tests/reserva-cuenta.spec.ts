import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { cleanup, newEmail, signIn } from './helpers/account-flow';
import { startBooking, submitForm } from './helpers/booking-flow';
import { adminClient, appointmentsByEmail, deleteAppointmentsByEmail, userIdByEmail } from './helpers/supabase-admin';
import { deleteEmailsTo, waitForEmail } from './helpers/mailpit';

// T-021: reservar con cuenta (RF-04, CA-44, CA-45, ADR-0034). Una hora propia por proyecto.
// Cada test que reserva usa su propia hora: corren en paralelo con la misma estilista.
const TIME = { chromium: '17:30', mobile: '17:45' };
const TIME_GUEST = { chromium: '16:30', mobile: '16:45' };

test.describe('reservar con cuenta', () => {
  test('CA-44: con sesión el formulario trae el email de la cuenta fijo, se reserva con ella y la cita sale en «Mis citas»', async ({
    page,
  }, testInfo) => {
    const email = newEmail('reserva-cuenta');
    const time = testInfo.project.name === 'mobile' ? TIME.mobile : TIME.chromium;
    try {
      await signIn(page, email);
      const userId = (await userIdByEmail(email)) ?? '';
      expect(userId).not.toBe('');

      await startBooking(page, time);
      // El email es el de la cuenta y no se edita; el nombre y el teléfono vienen vacíos (perfil nuevo).
      const emailField = page.getByLabel('Email', { exact: true });
      await expect(emailField).toHaveValue(email);
      await expect(emailField).toHaveAttribute('readonly', '');
      await expect(page.getByText('Reservas con tu cuenta')).toBeVisible();
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('');
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      await page.getByLabel('Nombre', { exact: true }).fill('Lucía Prado');
      await page.getByLabel('Teléfono', { exact: true }).fill('+34 611 222 333');
      await page.getByRole('checkbox').check();
      await submitForm(page);
      await expect(page).toHaveURL(/\/reservar\/confirmada$/);

      // La cita lleva el user_id y la copia de contacto; el perfil guarda nombre y teléfono.
      const rows = await appointmentsByEmail(email);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        user_id: userId,
        guest_name: 'Lucía Prado',
        guest_email: email,
        guest_phone: '+34 611 222 333',
        status: 'confirmed',
      });
      const profile = await adminClient().from('profiles').select('full_name, phone').eq('id', userId).single();
      expect(profile.data).toEqual({ full_name: 'Lucía Prado', phone: '+34 611 222 333' });

      // La confirmación llega por email y la cita está en «Mis citas».
      const mail = await waitForEmail(email);
      expect(mail.subject).toMatch(new RegExp(`a las ${time}$`));
      await page.goto('/mis-citas');
      await expect(page.getByRole('listitem').filter({ hasText: 'Tratamiento hidratante' })).toHaveCount(1);
      await expect(page.getByRole('listitem').filter({ hasText: time })).toHaveCount(1);
    } finally {
      await deleteAppointmentsByEmail(email);
      await cleanup([email]);
      await deleteEmailsTo(email);
    }
  });

  test('una segunda reserva con la misma cuenta viene precargada con nombre y teléfono del perfil', async ({
    page,
  }, testInfo) => {
    const email = newEmail('reserva-cuenta');
    const time = testInfo.project.name === 'mobile' ? TIME.mobile : TIME.chromium;
    try {
      await signIn(page, email);
      const userId = (await userIdByEmail(email)) ?? '';
      await adminClient().from('profiles').update({ full_name: 'Marta Ruiz', phone: '+34 622 333 444' }).eq('id', userId);

      await startBooking(page, time);
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Marta Ruiz');
      await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue('+34 622 333 444');
      await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);
    } finally {
      await cleanup([email]);
    }
  });

  test('CA-45: una invitada sigue reservando igual, con su email editable y sin user_id', async ({ page }, testInfo) => {
    const email = `e2e-${randomUUID()}@test.invalid`;
    const time = testInfo.project.name === 'mobile' ? TIME_GUEST.mobile : TIME_GUEST.chromium;
    try {
      await startBooking(page, time);
      const emailField = page.getByLabel('Email', { exact: true });
      await expect(emailField).toHaveValue('');
      await expect(emailField).not.toHaveAttribute('readonly', '');
      await expect(page.getByText('Reservas con tu cuenta')).toHaveCount(0);

      await page.getByLabel('Nombre', { exact: true }).fill('Ana García');
      await emailField.fill(email);
      await page.getByLabel('Teléfono', { exact: true }).fill('+34 600 000 000');
      await page.getByRole('checkbox').check();
      await submitForm(page);
      await expect(page).toHaveURL(/\/reservar\/confirmada$/);

      const rows = await appointmentsByEmail(email);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.user_id).toBeNull();
    } finally {
      await deleteAppointmentsByEmail(email);
      await deleteEmailsTo(email);
    }
  });

  test('CA-45: un Admin con sesión reserva como invitado (formulario normal, sin cuenta)', async ({ page }, testInfo) => {
    const email = newEmail('reserva-admin');
    const time = testInfo.project.name === 'mobile' ? TIME.mobile : TIME.chromium;
    try {
      await signIn(page, email);
      const userId = (await userIdByEmail(email)) ?? '';
      await adminClient().from('profiles').upsert({ id: userId, role: 'admin' }, { onConflict: 'id' });

      await startBooking(page, time);
      await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
      await expect(page.getByText('Reservas con tu cuenta')).toHaveCount(0);
    } finally {
      await cleanup([email]);
    }
  });
});
