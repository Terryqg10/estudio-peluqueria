import { test, expect, type Page } from '@playwright/test';
import { madridMidnightUtc } from '../src/lib/admin/week';
import { addDays, todayInMadrid } from '../src/lib/booking/dates';
import { cleanup, confirmFromEmail, newEmail, requestLink } from './helpers/account-flow';
import { deleteEmailsTo, emailCountTo, waitForEmail } from './helpers/mailpit';
import {
  adminClient,
  createAccountAppointment,
  createAppointmentWithToken,
  deleteAppointment,
  setRole,
  userIdByEmail,
} from './helpers/supabase-admin';

// T-018: aviso por email a la clienta cuando el Admin mueve o cancela su cita (CA-46, CA-47, ADR-0035).
// Seriales y con días propios (lejanos y distintos de los demás e2e del panel) para no pisarse al elegir hueco.
test.describe.configure({ mode: 'serial' });

const AGENDA = '/admin/agenda';

async function signInAsAdmin(page: Page, email: string) {
  await requestLink(page, email);
  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  await setRole(userId ?? '', 'admin');
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(/\/admin$/);
}

function workdayFor(project: string): string {
  const start = addDays(todayInMadrid(), project === 'mobile' ? 33 : 30);
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const isoWeekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    if (isoWeekday <= 5) return date;
  }
  throw new Error('sin día laborable');
}

// Cita de invitada con Irene ese día a las 10:00 + k·15 min (hora de Madrid).
async function appointmentOn(date: string, guestEmail: string, k: number) {
  const startsAt = new Date(madridMidnightUtc(date).getTime() + (10 * 60 + 15 * k) * 60_000).toISOString();
  return createAppointmentWithToken({ startsAt, guestEmail });
}

const OK_EMAIL = 'Hemos avisado a la clienta por email.';

test.describe('aviso al mover o cancelar desde el panel (CA-46, CA-47)', () => {
  test('CA-46: mover una cita avisa a la invitada como cambio del salón, con la fecha anterior', async ({ page }, testInfo) => {
    const admin = newEmail('admin');
    const guest = newEmail('invitada');
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, guest, 4); // 11:00
    try {
      await signInAsAdmin(page, admin);
      await page.goto(`${AGENDA}/cita/${appt.id}`);
      const pills = page.locator('button[data-starts-at]');
      await expect(pills.first()).toBeVisible();
      const starts = await pills.evaluateAll((els) => els.map((el) => el.getAttribute('data-starts-at') ?? ''));
      const startsAt = starts.find((s) => Date.parse(s) !== Date.parse(appt.startsAt));
      expect(startsAt, 'sin huecos para mover').toBeTruthy();
      await page.locator(`button[data-starts-at="${startsAt}"]`).click();
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page.getByRole('status')).toHaveText(`Cita movida. ${OK_EMAIL}`);

      const mail = await waitForEmail(guest);
      expect(mail.subject).toMatch(/^El salón ha cambiado tu cita en Atelier Malva: /);
      expect(mail.text).toContain('El salón ha cambiado tu cita.');
      expect(mail.text).toContain('Antes: ');
      expect(mail.text).toContain('/contacto');
      expect(mail.text).not.toContain('/cita/'); // sin token
      expect(await emailCountTo(guest)).toBe(1);
    } finally {
      await deleteAppointment(appt.id);
      await cleanup([admin]);
      await deleteEmailsTo(guest);
    }
  });

  test('CA-46: cancelar la cita de una clienta con cuenta (con copia de contacto) la avisa como cancelación del salón', async ({
    page,
  }, testInfo) => {
    const admin = newEmail('admin');
    const client = newEmail('clienta');
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, client, 12); // 13:00
    const { data: created } = await adminClient().auth.admin.createUser({ email: client, email_confirm: true });
    try {
      await adminClient().from('appointments').update({ user_id: created.user?.id }).eq('id', appt.id);
      await signInAsAdmin(page, admin);
      await page.goto(`${AGENDA}/cita/${appt.id}`);
      await page.getByRole('link', { name: 'Cancelar la cita' }).click();
      await expect(page.getByText('Le enviaremos un email con el aviso.')).toBeVisible();
      await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();
      await expect(page.getByRole('status')).toHaveText(`Cita cancelada. ${OK_EMAIL}`);

      const mail = await waitForEmail(client);
      expect(mail.subject).toBe('El salón ha cancelado tu cita en Atelier Malva');
      expect(mail.text).toContain('el salón ha tenido que cancelar');
      expect(mail.text).toContain('/reservar');
      expect(await emailCountTo(client)).toBe(1);
    } finally {
      await deleteAppointment(appt.id);
      await cleanup([admin, client]);
      await deleteEmailsTo(client);
    }
  });

  test('CA-47: una cita sin email de contacto se cancela igualmente y el panel dice que no se pudo avisar', async ({
    page,
  }, testInfo) => {
    const admin = newEmail('admin');
    const client = newEmail('clienta-antigua');
    const { data: created } = await adminClient().auth.admin.createUser({ email: client, email_confirm: true });
    const userId = created.user?.id ?? '';
    const apptId = await createAccountAppointment(userId, project(testInfo.project.name)); // solo user_id: sin copia de contacto
    try {
      await signInAsAdmin(page, admin);
      await page.goto(`${AGENDA}/cita/${apptId}`);
      await page.getByRole('link', { name: 'Cancelar la cita' }).click();
      await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();
      await expect(page.getByRole('status')).toHaveText('Cita cancelada. No hemos podido avisarla por email: contacta con ella.');

      const { data: row } = await adminClient().from('appointments').select('status').eq('id', apptId).single();
      expect(row?.status).toBe('cancelled');
      expect(await emailCountTo(client)).toBe(0);
    } finally {
      await deleteAppointment(apptId);
      await cleanup([admin, client]);
    }
  });

  test('CA-47: guardar solo la nota no envía ningún aviso', async ({ page }, testInfo) => {
    const admin = newEmail('admin');
    const guest = newEmail('invitada');
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, guest, 20); // 15:00
    try {
      await signInAsAdmin(page, admin);
      await page.goto(`${AGENDA}/cita/${appt.id}`);
      // En móvil el campo puede rellenarse antes de que React termine de hidratar y el botón seguir desactivado:
      // se reintenta hasta que la nota habilita «Guardar cambios».
      const save = page.getByRole('button', { name: 'Guardar cambios' });
      await expect(async () => {
        await page.getByLabel('Notas para la estilista').fill('');
        await page.getByLabel('Notas para la estilista').fill('Solo una nota');
        await expect(save).toBeEnabled({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await save.click();
      await expect(page.getByRole('status')).toHaveText('Cambios guardados.');
      expect(await emailCountTo(guest)).toBe(0);
    } finally {
      await deleteAppointment(appt.id);
      await cleanup([admin]);
      await deleteEmailsTo(guest);
    }
  });
});

// Días de adelanto distintos por proyecto para la cita de cuenta sin copia de contacto (lejos de los días de los demás e2e del panel: 40-44 editar cita, 48-52 bloqueos).
function project(name: string): number {
  return name === 'mobile' ? 37 : 36;
}
