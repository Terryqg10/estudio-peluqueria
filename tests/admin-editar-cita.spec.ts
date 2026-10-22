import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { madridMidnightUtc, mondayOf } from '../src/lib/admin/week';
import { addDays, todayInMadrid } from '../src/lib/booking/dates';
import { cleanup, confirmFromEmail, newEmail, requestLink, signIn } from './helpers/account-flow';
import {
  activeAppointmentsAt,
  adminClient,
  bookSlot,
  createAppointmentWithToken,
  deleteAppointment,
  idByName,
  setRole,
  userIdByEmail,
} from './helpers/supabase-admin';

// T-008c: el Admin mueve y cancela una cita desde su pantalla (CA-16, ADR-0026). El cambio se ve en la
// agenda y en la disponibilidad (el hueco antiguo queda libre). Los tests son seriales y cada proyecto
// (escritorio / móvil) usa su propio día laborable para no pisarse al elegir hueco.
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

// Día laborable (10:00–20:00) lejano y distinto para cada proyecto: los demás e2e reservan en los próximos
// 14 días y comparten estilistas, así que aquí no se pisan.
function workdayFor(project: string): string {
  const start = addDays(todayInMadrid(), project === 'mobile' ? 44 : 40);
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const isoWeekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    if (isoWeekday <= 5) return date;
  }
  throw new Error('sin día laborable');
}

// Cita de invitada con Irene ese día a las 10:00 + k·15 min (hora de Madrid).
async function appointmentOn(date: string, k = 0) {
  const startsAt = new Date(madridMidnightUtc(date).getTime() + (10 * 60 + 15 * k) * 60_000).toISOString();
  return createAppointmentWithToken({ startsAt, guestEmail: newEmail('invitada') });
}

const agendaUrl = (date: string) => `${AGENDA}?semana=${mondayOf(date)}&dia=${date}`;

test.describe('editar una cita desde el panel (CA-16)', () => {
  test('mover: se ve en la agenda y el hueco antiguo queda libre', async ({ page }, testInfo) => {
    const email = newEmail('admin');
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, 4); // 11:00
    try {
      await signInAsAdmin(page, email);
      await page.goto(agendaUrl(date));

      const block = page.locator(`[data-view]:visible [data-appointment-id="${appt.id}"]`);
      await block.locator('summary').click();
      await block.getByRole('link', { name: 'Editar cita' }).click();
      await expect(page.getByRole('heading', { name: 'Mover cita', level: 1 })).toBeVisible();

      // Sin cambios, «Guardar cambios» está desactivado.
      await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();

      // Elige una hora (píldora) distinta de la actual, con la misma estilista, y escribe una nota.
      const pills = page.locator('button[data-starts-at]');
      await expect(pills.first()).toBeVisible();
      const starts = await pills.evaluateAll((els) => els.map((el) => el.getAttribute('data-starts-at') ?? ''));
      const startsAt = starts.find((s) => Date.parse(s) !== Date.parse(appt.startsAt));
      expect(startsAt, 'sin huecos para mover').toBeTruthy();
      await page.locator(`button[data-starts-at="${startsAt}"]`).click();
      await page.getByLabel('Notas para la estilista').fill('Alergia al amoníaco');

      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page.getByRole('status')).toHaveText('Cita movida.');

      // BD: la misma cita en el nuevo hueco, con su nota (solo visible para el Admin).
      const { data } = await adminClient().from('appointments').select('stylist_id, during').eq('id', appt.id).single();
      expect(data?.stylist_id).toBe(appt.stylistId);
      expect(String(data?.during)).toContain((startsAt ?? '?').slice(0, 16).replace('T', ' '));
      const { data: note } = await adminClient()
        .from('appointment_notes')
        .select('note')
        .eq('appointment_id', appt.id)
        .single();
      expect(note?.note).toBe('Alergia al amoníaco');
      expect(await activeAppointmentsAt(appt.stylistId, appt.startsAt, 30)).toEqual([]);

      // Agenda: la cita aparece en el día nuevo.
      await page.goto(agendaUrl(date));
      await expect(page.locator(`[data-view]:visible [data-appointment-id="${appt.id}"]`)).toBeAttached();
    } finally {
      await deleteAppointment(appt.id);
      await cleanup([email]);
    }
  });

  test('solo una nota: se guarda sin mover la cita; el carrusel cambia de día y cargan sus horas', async ({ page }, testInfo) => {
    const email = newEmail('admin');
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, 8); // 12:00
    try {
      await signInAsAdmin(page, email);
      await page.goto(`${AGENDA}/cita/${appt.id}`);

      // Otro día del carrusel: la ficha pide los huecos de ese día y la hora elegida se limpia.
      await expect(page.locator('button[data-starts-at]').first()).toBeVisible();
      await page.locator('button[data-date]').nth(1).click();
      await expect(page.getByText('Buscando huecos…')).toHaveCount(0);
      await page.locator('button[data-date]').nth(0).click();

      await page.getByLabel('Notas para la estilista').fill('Prefiere agua tibia');
      await expect(page.getByText('Solo se guardará la nota.')).toBeVisible();
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page.getByRole('status')).toHaveText('Cambios guardados.');

      const { data } = await adminClient().from('appointments').select('stylist_id, during').eq('id', appt.id).single();
      expect(data?.stylist_id).toBe(appt.stylistId);
      expect(String(data?.during)).toContain(new Date(appt.startsAt).toISOString().slice(0, 16).replace('T', ' '));
      const { data: note } = await adminClient()
        .from('appointment_notes')
        .select('note')
        .eq('appointment_id', appt.id)
        .single();
      expect(note?.note).toBe('Prefiere agua tibia');

      // Al volver a la ficha la nota está precargada.
      await page.goto(`${AGENDA}/cita/${appt.id}`);
      await expect(page.getByLabel('Notas para la estilista')).toHaveValue('Prefiere agua tibia');
    } finally {
      await deleteAppointment(appt.id);
      await cleanup([email]);
    }
  });

  test('cancelar pide confirmación, libera el hueco y la agenda la marca cancelada', async ({ page }, testInfo) => {
    const email = newEmail('admin');
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, 12); // 13:00
    try {
      await signInAsAdmin(page, email);
      await page.goto(`${AGENDA}/cita/${appt.id}`);

      // Primero se pide confirmar; «No, mantenerla» no cancela.
      await page.getByRole('link', { name: 'Cancelar la cita' }).click();
      await expect(page.getByText('¿Cancelar la cita de')).toBeVisible();
      await page.getByRole('link', { name: 'No, mantenerla' }).click();
      const { data: kept } = await adminClient().from('appointments').select('status').eq('id', appt.id).single();
      expect(kept?.status).toBe('confirmed');

      await page.getByRole('link', { name: 'Cancelar la cita' }).click();
      await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();
      await expect(page.getByRole('status')).toHaveText('Cita cancelada.');

      const { data } = await adminClient().from('appointments').select('status').eq('id', appt.id).single();
      expect(data?.status).toBe('cancelled');
      expect(await activeAppointmentsAt(appt.stylistId, appt.startsAt, 30)).toEqual([]);

      await expect(
        page.locator(`[data-view]:visible [data-appointment-id="${appt.id}"]`),
      ).toContainText('Cancelada');

      // Una cita cancelada ya no se puede modificar.
      await page.goto(`${AGENDA}/cita/${appt.id}`);
      await expect(page.getByText('Esta cita ya no se puede modificar.')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
    } finally {
      await deleteAppointment(appt.id);
      await cleanup([email]);
    }
  });

  test('si otra persona ocupa el hueco elegido, se avisa y la cita no cambia', async ({ page }, testInfo) => {
    const email = newEmail('admin');
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, 20); // 15:00
    let otherId: string | null = null;
    try {
      await signInAsAdmin(page, email);
      await page.goto(`${AGENDA}/cita/${appt.id}`);

      // Primera hora distinta de la actual (el formulario arranca con la estilista de la cita).
      const pills = page.locator('button[data-starts-at]');
      await expect(pills.first()).toBeVisible();
      const starts = await pills.evaluateAll((els) => els.map((el) => el.getAttribute('data-starts-at') ?? ''));
      const startsAt = starts.find((s) => Date.parse(s) !== Date.parse(appt.startsAt)) ?? '';
      await page.locator(`button[data-starts-at="${startsAt}"]`).click();

      otherId = await bookSlot(appt.stylistId, await idByName('services', 'Tratamiento hidratante'), startsAt, 30);
      await page.getByRole('button', { name: 'Guardar cambios' }).click();

      await expect(page.getByText('Ese hueco acaba de ocuparse')).toBeVisible();
      const { data } = await adminClient().from('appointments').select('stylist_id, during').eq('id', appt.id).single();
      expect(data?.stylist_id).toBe(appt.stylistId);
      expect(String(data?.during)).toContain(
        new Date(appt.startsAt).toISOString().slice(0, 16).replace('T', ' '),
      );
    } finally {
      if (otherId) await deleteAppointment(otherId);
      await deleteAppointment(appt.id);
      await cleanup([email]);
    }
  });

  test('una clienta recibe 404 y un id no válido o inexistente también', async ({ page }, testInfo) => {
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, 24);
    const clienta = newEmail('clienta');
    const admin = newEmail('admin');
    try {
      await signIn(page, clienta);
      const denied = await page.goto(`${AGENDA}/cita/${appt.id}`);
      expect(denied?.status()).toBe(404);
      await expect(page.getByText(/Editar cita|Mover la cita/)).toHaveCount(0);

      await page.context().clearCookies();
      await signInAsAdmin(page, admin);
      expect((await page.goto(`${AGENDA}/cita/no-es-un-id`))?.status()).toBe(404);
      expect((await page.goto(`${AGENDA}/cita/00000000-0000-0000-0000-000000000000`))?.status()).toBe(404);
    } finally {
      await deleteAppointment(appt.id);
      await cleanup([clienta, admin]);
    }
  });

  test('la pantalla de la cita pasa axe y no desborda de 320 a 1280 px', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const email = newEmail('admin');
    const date = workdayFor(testInfo.project.name);
    const appt = await appointmentOn(date, 28);
    try {
      await signInAsAdmin(page, email);
      await page.goto(`${AGENDA}/cita/${appt.id}?dia=${addDays(date, 0)}`);
      await expect(page.locator('button[data-starts-at]').first()).toBeVisible();

      for (const width of [320, 375, 480, 700, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(
          results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
          `axe a ${width}px`,
        ).toEqual([]);
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return doc.scrollWidth - doc.clientWidth;
        });
        expect(overflow, `desborda ${overflow}px a ${width}px`).toBeLessThanOrEqual(1);
      }

      if (process.env.CAPTURE_EVIDENCE) {
        await page.setViewportSize({ width: 375, height: 812 });
        await page.screenshot({
          path: path.join('sdd', 'reviews', 'evidencias', 'T-008d', 'cita-375.png'),
          fullPage: false,
        });
      }
    } finally {
      await deleteAppointment(appt.id);
      await cleanup([email]);
    }
  });
});
