import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { fillForm, startBooking, submitForm } from './helpers/booking-flow';
import { deleteEmailsTo } from './helpers/mailpit';
import {
  adminClient,
  appointmentsByEmail,
  createAppointmentWithToken,
  deleteAppointmentsByEmail,
} from './helpers/supabase-admin';

// T-005c: límite de citas activas por email en la reserva (CA-29, RF-10, ADR-0020). El límite por
// IP está apagado fuera de producción (todos los e2e comparten IP) y se prueba en integración.
// Horas propias para no pisar a las demás reservas de los e2e (T-037): `reservar-tiempo-real` reserva a las 19:00 en chromium.
const TIME = { chromium: '19:30', mobile: '10:30' };

const LIMIT_MESSAGE = 'Ya tienes el máximo de citas activas con este email';

test.describe('límite de citas activas por email', () => {
  test('CA-29: con 3 citas activas se rechaza con un mensaje claro; tras cancelar una, puede reservar', async ({
    page,
  }, testInfo) => {
    const email = `e2e-limite-${randomUUID()}@test.invalid`;
    const time = testInfo.project.name === 'mobile' ? TIME.mobile : TIME.chromium;
    try {
      // Tres citas activas ya existentes para ese email.
      const created = [];
      for (let i = 0; i < 3; i++) created.push(await createAppointmentWithToken({ guestEmail: email }));

      await startBooking(page, time);
      await fillForm(page, email);
      await submitForm(page);

      // Rechazada con un mensaje claro; no se creó ninguna cita nueva ni se navegó.
      const alert = page.getByRole('alert').filter({ hasText: LIMIT_MESSAGE });
      await expect(alert).toBeVisible();
      await expect(page).not.toHaveURL(/\/reservar\/confirmada$/);
      expect(await appointmentsByEmail(email)).toHaveLength(3);

      // El mensaje no tiene problemas de accesibilidad ni desborda en pantallas estrechas.
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(serious, 'violaciones graves o críticas de axe').toEqual([]);
      for (const width of [320, 375, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `mensaje de límite a ${width}px`).toBeLessThanOrEqual(1);
      }

      // Se cancela una cita: el cupo se libera y la misma persona puede reservar.
      const cancelled = await adminClient().from('appointments').update({ status: 'cancelled' }).eq('id', created[0]?.id ?? '');
      expect(cancelled.error).toBeNull();
      await submitForm(page);
      await expect(page).toHaveURL(/\/reservar\/confirmada$/);
      expect((await appointmentsByEmail(email)).filter((a) => a.status !== 'cancelled')).toHaveLength(3);
    } finally {
      await deleteAppointmentsByEmail(email);
      await deleteEmailsTo(email);
    }
  });
});
