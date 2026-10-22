import { randomUUID } from 'node:crypto';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { madridMidnightUtc } from '../src/lib/admin/week';
import { addDays, todayInMadrid } from '../src/lib/booking/dates';
import { cleanup, confirmFromEmail, newEmail, requestLink, signIn } from './helpers/account-flow';
import {
  adminClient,
  createAppointmentWithToken,
  deleteAppointment,
  idByName,
  setRole,
  userIdByEmail,
} from './helpers/supabase-admin';

// T-009b: bloqueos de franja y vacaciones del Admin (CA-19, CA-20; ADR-0028). El efecto en la disponibilidad
// pública lo prueban `bloqueo-franja` y `vacaciones` (integración); aquí se prueba la pantalla. Los tests son
// seriales y cada proyecto usa su propio día laborable lejano para no pisar a los demás e2e.
test.describe.configure({ mode: 'serial' });

const PAGE = '/admin/bloqueos';

async function signInAsAdmin(page: Page, email: string) {
  await requestLink(page, email);
  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  await setRole(userId ?? '', 'admin');
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(/\/admin$/);
}

// Día laborable lejano y distinto para cada proyecto (los otros e2e usan +7…+13 y +40…+44).
function workdayFor(project: string): string {
  const start = addDays(todayInMadrid(), project === 'mobile' ? 52 : 48);
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    const isoWeekday = ((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
    if (isoWeekday <= 5) return date;
  }
  throw new Error('sin día laborable');
}

// Pasa de mes con la flecha hasta ver el día y lo pulsa.
async function pickDate(page: Page, date: string) {
  const day = page.locator(`button[data-date="${date}"]`);
  const next = page.getByRole('button', { name: 'Mes siguiente' });
  for (let i = 0; i < 14 && (await day.count()) === 0; i++) await next.click();
  await day.click();
}

const noteFor = () => `e2e ${randomUUID().slice(0, 8)}`;
const deleteBlocksByNote = (note: string) => adminClient().from('time_blocks').delete().eq('note', note);

test.describe('bloqueos y vacaciones del Admin (CA-19, CA-20)', () => {
  test('bloqueo de franja: se crea, se ve en la lista y se quita', async ({ page }, testInfo) => {
    const email = newEmail('admin');
    const date = workdayFor(testInfo.project.name);
    const note = noteFor();
    try {
      await signInAsAdmin(page, email);
      await page.goto(PAGE);

      await page.getByRole('radio', { name: 'Franja horaria' }).check({ force: true });
      await page.getByRole('radio', { name: 'Irene Solís' }).check({ force: true });
      await pickDate(page, date);
      await page.getByLabel('Desde').selectOption('14:00');
      await page.getByLabel('Hasta').selectOption('16:00');
      await page.getByLabel('Nota (opcional)').fill(note);
      await page.getByRole('button', { name: 'Añadir' }).click();

      await expect(page.getByRole('status')).toHaveText('Bloqueo creado.');
      const row = page.locator('li[data-block-id]', { hasText: note });
      await expect(row).toContainText('Bloqueo · Irene Solís');
      await expect(row).toContainText('14:00–16:00');

      const stylistId = await idByName('stylists', 'Irene Solís');
      const { data } = await adminClient().from('time_blocks').select('kind, stylist_id, during').eq('note', note);
      expect(data).toHaveLength(1);
      expect(data?.[0]).toMatchObject({ kind: 'block', stylist_id: stylistId });

      await row.getByRole('button', { name: /Quitar/ }).click();
      await expect(page.getByRole('status')).toHaveText('Bloqueo quitado.');
      await expect(page.locator('li[data-block-id]', { hasText: note })).toHaveCount(0);
      expect((await adminClient().from('time_blocks').select('id').eq('note', note)).data).toEqual([]);
    } finally {
      await deleteBlocksByNote(note);
      await cleanup([email]);
    }
  });

  test('vacaciones de un rango para «Todas»: una por estilista y días completos', async ({ page }, testInfo) => {
    const email = newEmail('admin');
    const date = workdayFor(testInfo.project.name);
    const last = addDays(date, 1);
    const note = noteFor();
    try {
      await signInAsAdmin(page, email);
      await page.goto(PAGE);

      await page.getByRole('radio', { name: 'Todas' }).check({ force: true });
      await pickDate(page, date);
      await pickDate(page, last);
      await page.getByLabel('Nota (opcional)').fill(note);
      await page.getByRole('button', { name: 'Añadir' }).click();
      await expect(page.getByRole('status')).toHaveText('Bloqueo creado.');

      const rows = page.locator('li[data-block-id]', { hasText: note });
      await expect(rows.first()).toContainText('Vacaciones');
      await expect(rows.first()).toContainText('Del ');

      const { data } = await adminClient().from('time_blocks').select('kind, during').eq('note', note);
      expect(data?.length).toBeGreaterThanOrEqual(3); // una por estilista activa
      const expectedStart = madridMidnightUtc(date).toISOString().slice(0, 16).replace('T', ' ');
      for (const row of data ?? []) {
        expect(row.kind).toBe('vacation');
        expect(String(row.during)).toContain(expectedStart);
      }
    } finally {
      await deleteBlocksByNote(note);
      await cleanup([email]);
    }
  });

  test('con citas en el rango no se crea nada, se listan con su enlace y, resueltas, se aplica', async ({ page }, testInfo) => {
    const email = newEmail('admin');
    const date = workdayFor(testInfo.project.name);
    const note = noteFor();
    const startsAt = new Date(madridMidnightUtc(date).getTime() + 11 * 3_600_000).toISOString(); // 11:00 Madrid aprox.
    const appt = await createAppointmentWithToken({ startsAt, guestEmail: newEmail('invitada') });
    try {
      await signInAsAdmin(page, email);
      await page.goto(PAGE);

      await page.getByRole('radio', { name: 'Irene Solís' }).check({ force: true });
      await pickDate(page, date);
      await page.getByLabel('Nota (opcional)').fill(note);
      await page.getByRole('button', { name: 'Añadir' }).click();

      const alert = page.getByRole('alert').filter({ hasText: 'Hay citas en ese rango' });
      await expect(alert).toBeVisible();
      const conflict = alert.locator(`[data-conflict-id="${appt.id}"]`);
      await expect(conflict).toContainText('Persona de prueba');
      await expect(conflict.getByRole('link', { name: 'Mover o cancelar esta cita' })).toHaveAttribute(
        'href',
        `/admin/agenda/cita/${appt.id}`,
      );
      expect((await adminClient().from('time_blocks').select('id').eq('note', note)).data).toEqual([]);

      // El Admin cancela la cita y repite: ahora se aplica y lo escrito se conservó.
      await adminClient().from('appointments').update({ status: 'cancelled' }).eq('id', appt.id);
      await page.getByRole('button', { name: 'Añadir' }).click();
      await expect(page.getByRole('status')).toHaveText('Bloqueo creado.');
      expect((await adminClient().from('time_blocks').select('id').eq('note', note)).data).toHaveLength(1);
    } finally {
      await deleteBlocksByNote(note);
      await deleteAppointment(appt.id);
      await cleanup([email]);
    }
  });

  test('los errores se explican: sin día elegido y franja con hora de fin anterior', async ({ page }) => {
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      await page.goto(PAGE);

      await page.getByRole('button', { name: 'Añadir' }).click();
      await expect(page.getByText('Revisa los datos marcados.')).toBeVisible();

      await page.getByRole('radio', { name: 'Franja horaria' }).check({ force: true });
      await page.locator('button[data-date]:not([disabled])').first().click();
      await page.getByLabel('Desde').selectOption('16:00');
      await page.getByLabel('Hasta').selectOption('14:00');
      await page.getByRole('button', { name: 'Añadir' }).click();
      await expect(page.getByText('La hora de fin debe ser posterior a la de inicio')).toBeVisible();
    } finally {
      await cleanup([email]);
    }
  });

  test('sin sesión lleva al acceso y una clienta recibe 404', async ({ page }) => {
    await page.goto(PAGE);
    await expect(page).toHaveURL(/\/acceso$/);

    const clienta = newEmail('clienta');
    try {
      await signIn(page, clienta);
      expect((await page.goto(PAGE))?.status()).toBe(404);
    } finally {
      await cleanup([clienta]);
    }
  });

  test('va con noindex y sin caché, pasa axe y no desborda de 320 a 1280 px', async ({ page }) => {
    test.setTimeout(90_000); // axe en muchos anchos: con todos los e2e en paralelo supera los 30 s por defecto
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      const response = await page.goto(PAGE);
      expect(response?.headers()['cache-control']).toContain('no-store');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

      for (const kind of ['Vacaciones', 'Franja horaria']) {
        await page.getByRole('radio', { name: kind }).check({ force: true });
        for (const width of [320, 375, 480, 700, 768, 1024, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze();
          expect(
            results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
            `axe (${kind}) a ${width}px`,
          ).toEqual([]);
          const overflow = await page.evaluate(() => {
            const doc = document.documentElement;
            return doc.scrollWidth - doc.clientWidth;
          });
          expect(overflow, `desborda ${overflow}px a ${width}px`).toBeLessThanOrEqual(1);
        }
      }

      if (process.env.CAPTURE_EVIDENCE) {
        await page.setViewportSize({ width: 375, height: 900 });
        await page.getByRole('radio', { name: 'Franja horaria' }).check({ force: true });
        await page.screenshot({
          path: path.join('sdd', 'reviews', 'evidencias', 'T-009b', 'bloqueos-375.png'),
          fullPage: true,
        });
      }
    } finally {
      await cleanup([email]);
    }
  });
});
