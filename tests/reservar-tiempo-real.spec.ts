import { test, expect, type Page } from '@playwright/test';
import { workday } from './helpers/booking-days';
import { submitForm } from './helpers/booking-flow';
import { randomUUID } from 'node:crypto';
import {
  appointmentsByEmail,
  bookSlot,
  deleteAppointment,
  deleteAppointmentsByEmail,
  idByName,
} from './helpers/supabase-admin';

// CA-07 (T-005a): se ejecuta solo en el proyecto de escritorio (ver playwright.config.ts).
// CA-07: otra sesión ocupa un hueco y esta deja de ofrecerlo sin recargar (N = 15 s).
test.describe('reservar: tiempo real (CA-07)', () => {
  // Ocupan huecos reales de la misma estilista: en serie, para no pisarse entre sí.
  test.describe.configure({ mode: 'serial' });

  async function openBalayageDay(page: Page) {
    const serviceId = await idByName('services', 'Balayage');
    await page.goto(`/reservar?servicio=${serviceId}`);
    await page.locator(`[data-date="${workday()}"]`).click();
    await expect(page.locator('button[data-starts-at]').first()).toBeVisible();
    return { serviceId, stylistId: await idByName('stylists', 'Lucía Marín') };
  }

  test('con Realtime: el hueco ocupado desaparece sin recargar y se avisa si estaba elegido', async ({ page }) => {
    test.setTimeout(60_000);
    const { serviceId, stylistId } = await openBalayageDay(page);

    // Esperar a que el canal esté activo (la UI vuelve a consultar al suscribirse).
    await expect(page.locator('[data-channel="live"]')).toBeVisible({ timeout: 15_000 });

    const slot = page.locator('button[data-starts-at]').nth(2);
    const startsAt = (await slot.getAttribute('data-starts-at')) ?? '';
    await slot.click();
    await expect(page.getByRole('region', { name: 'Tu cita' })).toBeVisible();
    // Marca en el DOM: una recarga lo borraría (prueba que el cambio llega sin recargar).
    await page.evaluate(() => {
      document.documentElement.dataset.sinRecargar = 'true';
    });

    const appointmentId = await bookSlot(stylistId, serviceId, startsAt, 180);
    try {
      await expect(page.locator(`button[data-starts-at="${startsAt}"]`)).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByText('Esa hora acaba de ocuparse. Elige otra.')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Tu cita' })).toHaveCount(0);
      const kept = await page.evaluate(() => document.documentElement.dataset.sinRecargar === 'true');
      expect(kept, 'la página no se ha recargado').toBe(true);
    } finally {
      await deleteAppointment(appointmentId);
    }
  });

  test('sin Realtime: el sondeo de respaldo (15 s) también actualiza los huecos', async ({ page }) => {
    test.setTimeout(60_000);
    // Se bloquea el canal: la UI debe seguir funcionando solo con el sondeo.
    await page.routeWebSocket(/realtime/, (ws) => {
      void ws.close();
    });
    const { serviceId, stylistId } = await openBalayageDay(page);
    await expect(page.locator('[data-channel="live"]')).toHaveCount(0);

    const startsAt = (await page.locator('button[data-starts-at]').nth(8).getAttribute('data-starts-at')) ?? '';
    const appointmentId = await bookSlot(stylistId, serviceId, startsAt, 180);
    try {
      await expect(page.locator(`button[data-starts-at="${startsAt}"]`)).toHaveCount(0, { timeout: 25_000 });
    } finally {
      await deleteAppointment(appointmentId);
    }
  });
});

// CA-08 (e2e): otra persona ocupa el hueco mientras se rellena el formulario.
// Sin Realtime la pantalla no se entera, así que se prueba el camino del servidor: SLOT_TAKEN con alternativas.
test.describe('reservar: hueco ocupado al confirmar (CA-08)', () => {
  test('se avisa, se ofrecen alternativas, se conservan los datos y se puede reservar otra hora', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.routeWebSocket(/realtime/, (ws) => {
      void ws.close();
    });
    const email = `e2e-${randomUUID()}@test.invalid`;
    const serviceId = await idByName('services', 'Tratamiento hidratante');
    const stylistId = await idByName('stylists', 'Irene Solís');
    let otherId = '';
    try {
      await page.goto(`/reservar?servicio=${serviceId}`);
      await page.locator(`button[data-date="${workday()}"]`).click();
      const slot = page.locator('button[data-starts-at]', { hasText: /^19:00$/ });
      await expect(slot).toBeVisible();
      const startsAt = (await slot.getAttribute('data-starts-at')) ?? '';
      await slot.click();
      await page.getByLabel('Nombre', { exact: true }).fill('Ana García');
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Teléfono', { exact: true }).fill('600 000 000');
      await page.getByRole('checkbox').check();

      // Otra persona se queda con el hueco justo antes de confirmar.
      otherId = await bookSlot(stylistId, serviceId, startsAt, 30);
      await submitForm(page);

      await expect(page.getByText('Esa hora acaba de ocuparse. Elige otra.')).toBeVisible();
      await expect(page.getByText('Horas libres cercanas:')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Tus datos' })).toHaveCount(0);
      expect(await appointmentsByEmail(email)).toEqual([]); // no se creó nada, ni duplicado

      // Se elige una alternativa: el formulario vuelve con los datos ya escritos.
      await page.getByText('Horas libres cercanas:').locator('xpath=following-sibling::ul//button').first().click();
      await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible();
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana García');
      await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email);

      await submitForm(page);
      await expect(page).toHaveURL(/\/reservar\/confirmada$/);
      expect(await appointmentsByEmail(email)).toHaveLength(1);
    } finally {
      await deleteAppointmentsByEmail(email);
      if (otherId) await deleteAppointment(otherId);
    }
  });
});
