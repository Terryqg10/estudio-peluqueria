import { test, expect } from '@playwright/test';
import {
  activeAppointmentsAt,
  adminClient,
  createAppointmentWithToken,
  deleteAppointment,
  moveAppointmentSoon,
} from './helpers/supabase-admin';

// T-006b: cancelar la cita desde su enlace (CA-13, CA-14 parte cancelar).
async function statusOf(id: string) {
  const { data } = await adminClient().from('appointments').select('status').eq('id', id).single();
  return data?.status;
}

test.describe('cancelar la cita desde el enlace', () => {
  test('CA-13: confirmar la cancelación la deja «Cancelada» y libera el hueco', async ({ page }) => {
    const { id, token, stylistId, startsAt } = await createAppointmentWithToken();
    try {
      await page.goto(`/cita/${token}`);
      await expect(page.getByText('Confirmada')).toBeVisible();

      // Primero pide confirmación: «No, mantener» no cancela y devuelve el foco al botón.
      await page.getByRole('button', { name: 'Cancelar cita' }).click();
      await expect(page.getByRole('heading', { name: '¿Cancelar tu cita?' })).toBeVisible();
      await page.getByRole('button', { name: 'No, mantener la cita' }).click();
      await expect(page.getByRole('button', { name: 'Cancelar cita' })).toBeFocused();
      expect(await statusOf(id)).toBe('confirmed');

      await page.getByRole('button', { name: 'Cancelar cita' }).click();
      await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();

      await expect(page.locator('main').getByText('Cancelada', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancelar cita' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Reservar otra cita' })).toBeVisible();

      expect(await statusOf(id)).toBe('cancelled');
      expect(await activeAppointmentsAt(stylistId, startsAt, 30)).toHaveLength(0);

      // Recargar el enlace no ofrece volver a cancelar.
      await page.reload();
      await expect(page.getByRole('button', { name: 'Cancelar cita' })).toHaveCount(0);
    } finally {
      await deleteAppointment(id);
    }
  });

  test('CA-14: con menos de 24 h no hay botón y se indica contactar con el salón', async ({ page }) => {
    const { id, token } = await createAppointmentWithToken({ soon: true });
    try {
      await page.goto(`/cita/${token}`);
      await expect(page.getByRole('heading', { level: 1, name: 'Tu cita' })).toBeVisible();
      await expect(page.getByText('Faltan menos de 24 horas', { exact: false })).toBeVisible();
      await expect(page.getByText('Contacta con el salón', { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancelar cita' })).toHaveCount(0);
      expect(await statusOf(id)).toBe('confirmed');
    } finally {
      await deleteAppointment(id);
    }
  });

  test('CA-14: si la cita pasa a menos de 24 h con la página abierta, el servidor la rechaza', async ({
    page,
  }) => {
    const { id, token } = await createAppointmentWithToken();
    try {
      await page.goto(`/cita/${token}`);
      await page.getByRole('button', { name: 'Cancelar cita' }).click();

      // La cita se acerca después de cargar la página: la interfaz aún muestra el botón.
      await moveAppointmentSoon(id);

      await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();
      await expect(page.getByText('Faltan menos de 24 horas', { exact: false })).toBeVisible();
      expect(await statusOf(id)).toBe('confirmed');
    } finally {
      await deleteAppointment(id);
    }
  });

  test('la cita, la confirmación y el aviso de menos de 24 h no desbordan entre 320 y 1280 px', async ({
    page,
  }) => {
    const normal = await createAppointmentWithToken();
    const soon = await createAppointmentWithToken({ soon: true });
    try {
      for (const width of [320, 375, 480, 600, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/cita/${normal.token}`);
        await page.getByRole('button', { name: 'Cancelar cita' }).click();
        await expect(page.getByRole('heading', { name: '¿Cancelar tu cita?' })).toBeVisible();
        await page.goto(`/cita/${soon.token}`);
        await expect(page.getByText('Faltan menos de 24 horas', { exact: false })).toBeVisible();
        for (const open of [true, false]) {
          if (open) {
            await page.goto(`/cita/${normal.token}`);
            await page.getByRole('button', { name: 'Cancelar cita' }).click();
          }
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, `confirmación abierta=${open} a ${width}px`).toBeLessThanOrEqual(1);
        }
      }
    } finally {
      await deleteAppointment(normal.id);
      await deleteAppointment(soon.id);
    }
  });

  test('un enlace no válido no muestra el botón de cancelar', async ({ page }) => {
    await page.goto(`/cita/${'A'.repeat(43)}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Enlace no válido o caducado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar cita' })).toHaveCount(0);
  });
});
