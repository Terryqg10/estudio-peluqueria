import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { cleanup, newEmail, signIn } from './helpers/account-flow';
import {
  adminClient,
  createAccountAppointment,
  createAppointmentWithToken,
  deleteAppointment,
  userIdByEmail,
} from './helpers/supabase-admin';

// T-012: borrado de datos a petición desde la interfaz (CA-26, RF-09, ADR-0030).
async function row(id: string) {
  const { data } = await adminClient()
    .from('appointments')
    .select('status, user_id, guest_name, guest_email, guest_phone, anonymized_at')
    .eq('id', id)
    .single();
  return data;
}

test.describe('borrar mis datos', () => {
  test('CA-26 invitada: confirma, se anonimiza la cita y el enlace deja de valer', async ({ page }) => {
    const email = newEmail('borrar');
    const { id, token } = await createAppointmentWithToken({ guestEmail: email });
    try {
      await page.goto(`/cita/${token}`);
      await page.getByRole('button', { name: 'Borrar mis datos' }).click();
      await expect(page.getByRole('heading', { name: '¿Borrar tus datos?' })).toBeVisible();

      // «No, conservar» no borra y devuelve el foco al botón.
      await page.getByRole('button', { name: 'No, conservar mis datos' }).click();
      await expect(page.getByRole('button', { name: 'Borrar mis datos' })).toBeFocused();
      expect((await row(id))?.anonymized_at).toBeNull();

      await page.getByRole('button', { name: 'Borrar mis datos' }).click();
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
      await page.getByRole('button', { name: 'Sí, borrar mis datos' }).click();

      await expect(page.getByRole('heading', { name: 'Datos borrados' })).toBeVisible();
      const after = await row(id);
      expect(after?.anonymized_at).not.toBeNull();
      expect([after?.guest_name, after?.guest_email, after?.guest_phone, after?.user_id]).toEqual([
        null, null, null, null,
      ]);
      expect(after?.status).toBe('cancelled');

      // El enlace ya no es válido.
      await page.goto(`/cita/${token}`);
      await expect(page.getByRole('heading', { name: 'Enlace no válido o caducado' })).toBeVisible();
    } finally {
      await deleteAppointment(id);
    }
  });

  test('CA-26 clienta: borra su cuenta, la cita queda anonimizada y la sesión se cierra', async ({ page }) => {
    const email = newEmail('borrar');
    let apptId = '';
    try {
      await signIn(page, email);
      const userId = (await userIdByEmail(email)) ?? '';
      expect(userId).not.toBe('');
      apptId = await createAccountAppointment(userId, 35);
      await page.reload();

      await page.getByRole('button', { name: 'Borrar mi cuenta y mis datos' }).click();
      await expect(page.getByRole('heading', { name: '¿Borrar tu cuenta y tus datos?' })).toBeVisible();
      await page.getByRole('button', { name: 'Sí, borrar mi cuenta' }).click();

      await expect(page).toHaveURL(/\/acceso\?borrado=1$/);
      await expect(page.getByText('Hemos borrado tu cuenta y tus datos personales.')).toBeVisible();

      expect(await userIdByEmail(email)).toBeNull();
      const after = await row(apptId);
      expect(after?.anonymized_at).not.toBeNull();
      expect(after?.user_id).toBeNull();
      expect(after?.status).toBe('cancelled');

      await page.goto('/mis-citas');
      await expect(page).toHaveURL(/\/acceso$/);
    } finally {
      if (apptId) await deleteAppointment(apptId);
      await cleanup([email]);
    }
  });
});
