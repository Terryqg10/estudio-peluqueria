import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { addDays } from '../src/lib/booking/dates';
import { mondayOf } from '../src/lib/admin/week';
import { cleanup, confirmFromEmail, newEmail, requestLink, signIn } from './helpers/account-flow';
import {
  adminClient,
  createAccountAppointment,
  createAppointmentWithToken,
  deleteAppointment,
  setRole,
  userIdByEmail,
} from './helpers/supabase-admin';

// T-008b: agenda semanal del Admin, solo lectura (CA-15). Cada test usa cuentas y citas propias y se
// localiza por `data-appointment-id`: los demás tests comparten estilista y semana.
const AGENDA = '/admin/agenda';

async function signInAsAdmin(page: Page, email: string) {
  await requestLink(page, email);
  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  await setRole(userId ?? '', 'admin');
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(/\/admin$/);
  return userId ?? '';
}

// Día local de Madrid de un instante ISO.
function madridDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso));
}

async function startsAtOf(id: string): Promise<string> {
  const { data, error } = await adminClient().from('appointments').select('during').eq('id', id).single();
  if (error) throw new Error(error.message);
  const match = /"?([^",]+)"?,/.exec(String(data.during).slice(1));
  return new Date((match?.[1] ?? '').replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).toISOString();
}

// La vista visible (cuadrícula ancha o día) según el ancho; en la de día hace falta `dia`.
function agendaUrl(startsAt: string): string {
  const day = madridDay(startsAt);
  return `${AGENDA}?semana=${mondayOf(day)}&dia=${day}`;
}

test.describe('agenda semanal del Admin (CA-15)', () => {
  test('el Admin ve en su estilista las citas de invitada y de cuenta, con su estado', async ({ page }) => {
    const adminEmail = newEmail('admin');
    const accountEmail = newEmail('clienta');
    const created: string[] = [];
    try {
      const guest = await createAppointmentWithToken({ guestEmail: newEmail('invitada') });
      created.push(guest.id);

      // Cuenta de clienta con una cita asociada a su `user_id`.
      const other = await page.context().browser()?.newContext();
      expect(other).toBeTruthy();
      const otherPage = await other?.newPage();
      if (!otherPage) throw new Error('sin página');
      await signIn(otherPage, accountEmail);
      await other?.close();
      const accountId = await userIdByEmail(accountEmail);
      const account = await createAccountAppointment(accountId ?? '', 30);
      created.push(account);

      // Una cita cancelada también se ve, marcada con texto.
      const cancelled = await createAppointmentWithToken({ guestEmail: newEmail('cancelada') });
      created.push(cancelled.id);
      await adminClient().from('appointments').update({ status: 'cancelled' }).eq('id', cancelled.id);

      await signInAsAdmin(page, adminEmail);
      await page.goto(agendaUrl(guest.startsAt));
      await expect(page.getByRole('heading', { name: 'Agenda', level: 1 })).toBeVisible();

      const view = page.locator('[data-view]:visible');
      const guestBlock = view.locator(`[data-appointment-id="${guest.id}"]`);
      await expect(guestBlock).toContainText('Persona de prueba');
      await expect(guestBlock).toContainText('Tratamiento hidratante');
      await expect(guestBlock).toContainText('Confirmada');

      // La cita de cuenta puede caer otro día de la misma semana: se abre su día.
      const accountStart = await startsAtOf(account);
      await page.goto(agendaUrl(accountStart));
      const accountBlock = page.locator(`[data-view]:visible [data-appointment-id="${account}"]`);
      await expect(accountBlock).toContainText('Clienta con cuenta');

      await page.goto(agendaUrl(cancelled.startsAt));
      const cancelledBlock = page.locator(`[data-view]:visible [data-appointment-id="${cancelled.id}"]`);
      await expect(cancelledBlock).toContainText('Cancelada');

      // El detalle (teléfono) se abre con el teclado y el enlace es tel:.
      await page.goto(agendaUrl(guest.startsAt));
      const summary = page.locator(`[data-view]:visible [data-appointment-id="${guest.id}"] summary`);
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(
        page.locator(`[data-view]:visible [data-appointment-id="${guest.id}"] a[href^="tel:"]`),
      ).toHaveAttribute('href', 'tel:+34600000000');
    } finally {
      for (const id of created) await deleteAppointment(id);
      await cleanup([adminEmail, accountEmail]);
    }
  });

  test('navega entre semanas con enlaces, vuelve a hoy y tolera parámetros no válidos', async ({ page }) => {
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      await page.goto(AGENDA);
      const title = page.getByTestId('week-title');
      const first = await title.innerText();

      await page.getByRole('link', { name: 'Semana siguiente' }).click();
      await expect(page).toHaveURL(/semana=\d{4}-\d{2}-\d{2}/);
      const next = await title.innerText();
      expect(next).not.toBe(first);

      // Cada clic espera a que cambie la URL: sin eso se leería el título de la página anterior.
      const currentMonday = mondayOf(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()));
      await page.getByRole('link', { name: 'Semana anterior' }).click();
      await expect(page).toHaveURL(new RegExp(`semana=${currentMonday}$`));
      await page.getByRole('link', { name: 'Semana anterior' }).click();
      await expect(page).toHaveURL(new RegExp(`semana=${addDays(currentMonday, -7)}$`));
      await expect(title).not.toHaveText(first);

      await page.getByRole('link', { name: 'Hoy' }).click();
      await expect(title).toHaveText(first);

      // Parámetros no válidos o fuera de rango: semana actual, sin error.
      for (const query of ['semana=hoy', 'semana=2026-02-30', 'semana=2099-01-01', 'semana=1999-01-01&dia=x']) {
        const response = await page.goto(`${AGENDA}?${query}`);
        expect(response?.status()).toBe(200);
        await expect(title).toHaveText(first);
      }
    } finally {
      await cleanup([email]);
    }
  });

  test('una semana sin citas lo dice', async ({ page }) => {
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      const far = mondayOf(addDays(new Date().toISOString().slice(0, 10), 50 * 7));
      await page.goto(`${AGENDA}?semana=${far}`);
      await expect(page.getByText('Sin citas esta semana')).toBeVisible();
    } finally {
      await cleanup([email]);
    }
  });

  test('sin sesión lleva al acceso y una clienta recibe 404', async ({ page }) => {
    await page.goto(AGENDA);
    await expect(page).toHaveURL(/\/acceso$/);

    const email = newEmail('clienta');
    try {
      await signIn(page, email);
      const denied = await page.goto(AGENDA);
      expect(denied?.status()).toBe(404);
      await expect(page.getByRole('heading', { name: 'Agenda' })).toHaveCount(0);
    } finally {
      await cleanup([email]);
    }
  });

  test('va con noindex y sin caché, pasa axe y no desborda de 320 a 1280 px', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const email = newEmail('admin');
    let id: string | null = null;
    try {
      const guest = await createAppointmentWithToken({ guestEmail: newEmail('invitada') });
      id = guest.id;
      await signInAsAdmin(page, email);

      const response = await page.goto(agendaUrl(guest.startsAt));
      expect(response?.headers()['cache-control']).toContain('no-store');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

      for (const width of [320, 375, 480, 700, 768, 1023, 1024, 1100, 1279, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator(`[data-view]:visible [data-appointment-id="${id}"]`)).toBeVisible();

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
        for (const selector of ['header', 'main', 'footer']) {
          const box = await page.locator(selector).first().boundingBox();
          expect(box && box.x + box.width, `${selector} a ${width}px`).toBeLessThanOrEqual(width + 1);
        }
      }

      if (process.env.CAPTURE_EVIDENCE) {
        await page.setViewportSize({ width: 375, height: 900 });
        await page.screenshot({
          path: path.join('sdd', 'reviews', 'evidencias', 'T-008b', 'agenda-375.png'),
          fullPage: true,
        });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.screenshot({
          path: path.join('sdd', 'reviews', 'evidencias', 'T-008b', 'agenda-1280.png'),
          fullPage: true,
        });
      }
    } finally {
      if (id) await deleteAppointment(id);
      await cleanup([email]);
    }
  });
});
