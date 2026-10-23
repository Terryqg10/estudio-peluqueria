import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { newEmail } from './helpers/account-flow';
import { deleteEmailsTo, emailCountTo, waitForDeletionPath } from './helpers/mailpit';
import {
  adminClient,
  createAppointmentWithToken,
  deleteAppointment,
  deleteDeletionRequestsFor,
} from './helpers/supabase-admin';

// T-020: borrado de datos por email de confirmación (CA-40, CA-41, ADR-0032).
async function row(id: string) {
  const { data } = await adminClient()
    .from('appointments')
    .select('status, user_id, guest_name, guest_email, guest_phone, anonymized_at')
    .eq('id', id)
    .single();
  return data;
}

const SENT = /Si ese email tiene citas con nosotros/;

test.describe('borrar mis datos por email', () => {
  test('CA-40: pide el borrado, un GET no borra, el botón sí y el enlace es de un solo uso', async ({ page }) => {
    const email = newEmail('borrar-mail');
    // Cita pasada: el enlace de la cita ya no sirve, que es el caso que cubre esta vía.
    const { id } = await createAppointmentWithToken({ guestEmail: email, past: true });
    try {
      await page.goto('/borrar-datos');
      await expect(page.getByRole('heading', { level: 1, name: 'Borrar mis datos' })).toBeVisible();
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      await page.getByLabel('Email con el que reservaste').fill(email);
      await page.getByRole('button', { name: 'Enviarme el enlace de confirmación' }).click();
      await expect(page.getByRole('status')).toContainText(SENT);
      expect(page.url()).not.toContain('email');

      const path = await waitForDeletionPath(email);

      // Abrir el enlace (GET) no borra nada: lo hace el botón.
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Confirmar el borrado' })).toBeVisible();
      await page.reload();
      expect((await row(id))?.anonymized_at).toBeNull();

      await page.getByRole('button', { name: 'Confirmar el borrado de mis datos' }).click();
      await expect(page.getByRole('heading', { name: 'Datos borrados' })).toBeVisible();
      const after = await row(id);
      expect(after?.anonymized_at).not.toBeNull();
      expect([after?.guest_name, after?.guest_email, after?.guest_phone]).toEqual([null, null, null]);

      // Un solo uso.
      await page.goto(path);
      await page.getByRole('button', { name: 'Confirmar el borrado de mis datos' }).click();
      await expect(page.getByRole('heading', { name: 'Enlace no válido o caducado' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible();
    } finally {
      await deleteAppointment(id);
      await deleteEmailsTo(email);
      await deleteDeletionRequestsFor(email);
    }
  });

  test('CA-41: un email sin citas da el mismo mensaje y no se envía ningún correo', async ({ page }) => {
    const known = newEmail('borrar-mail');
    const unknown = newEmail('borrar-mail');
    const { id } = await createAppointmentWithToken({ guestEmail: known });
    try {
      await page.goto('/borrar-datos');
      await page.getByLabel('Email con el que reservaste').fill(known);
      await page.getByRole('button', { name: 'Enviarme el enlace de confirmación' }).click();
      const textKnown = await page.getByRole('status').innerText();

      await page.goto('/borrar-datos');
      await page.getByLabel('Email con el que reservaste').fill(unknown);
      await page.getByRole('button', { name: 'Enviarme el enlace de confirmación' }).click();
      await expect(page.getByRole('status')).toContainText(SENT);
      expect(await page.getByRole('status').innerText()).toBe(textKnown);

      expect(await emailCountTo(known)).toBe(1);
      expect(await emailCountTo(unknown)).toBe(0);
    } finally {
      await deleteAppointment(id);
      await deleteEmailsTo(known);
      await deleteDeletionRequestsFor(known);
    }
  });

  test('un email inválido muestra el error junto al campo y no envía nada', async ({ page }) => {
    await page.goto('/borrar-datos');
    await page.getByLabel('Email con el que reservaste').fill('no-es-un-email');
    await page.getByRole('button', { name: 'Enviarme el enlace de confirmación' }).click();
    await expect(page.getByText('Escribe un email válido')).toBeVisible();
    await expect(page.getByLabel('Email con el que reservaste')).toBeFocused();
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('un enlace inventado o con mala forma se rechaza con el mismo mensaje', async ({ page }) => {
    await page.goto(`/borrar-datos/confirmar?token=${'B'.repeat(43)}`);
    await page.getByRole('button', { name: 'Confirmar el borrado de mis datos' }).click();
    await expect(page.getByRole('heading', { name: 'Enlace no válido o caducado' })).toBeVisible();

    await page.goto('/borrar-datos/confirmar?token=corto');
    await expect(page.getByRole('heading', { name: 'Enlace no válido o caducado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmar el borrado de mis datos' })).toHaveCount(0);
  });

  test('el enlace de cita no válido ofrece borrar los datos', async ({ page }) => {
    await page.goto(`/cita/${'A'.repeat(43)}`);
    // En <main>: el pie también tiene un enlace «Borrar mis datos» (T-023).
    await page.locator('main').getByRole('link', { name: 'Borrar mis datos' }).click();
    await expect(page).toHaveURL(/\/borrar-datos$/);
  });
});
