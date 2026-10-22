import { randomUUID } from 'node:crypto';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { madridDateTimeToUtc } from '../src/lib/admin/time-blocks';
import { addDays, todayInMadrid } from '../src/lib/booking/dates';
import { cleanup, confirmFromEmail, newEmail, requestLink, signIn } from './helpers/account-flow';
import { adminClient, idByName, setRole, userIdByEmail } from './helpers/supabase-admin';

// T-009c: horarios semanales del Admin (CA-38, CA-39; ADR-0029). El efecto en la disponibilidad pública lo prueba
// `horarios` (integración); aquí se prueba la pantalla con una estilista de prueba, para no tocar a las del salón.
// El horario del salón solo se visualiza: guardarlo en la BD de desarrollo chocaría con las citas que crean otros e2e.
test.describe.configure({ mode: 'serial' });

const PAGE = '/admin/horarios';

async function signInAsAdmin(page: Page, email: string) {
  await requestLink(page, email);
  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  await setRole(userId ?? '', 'admin');
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(/\/admin$/);
}

async function createTestStylist(): Promise<{ id: string; name: string }> {
  const name = `Prueba horarios ${randomUUID().slice(0, 8)}`;
  const { data, error } = await adminClient().from('stylists').insert({ name }).select('id').single();
  if (error) throw new Error(`createTestStylist: ${error.message}`);
  return { id: data.id, name };
}

async function deleteTestStylist(id: string) {
  await adminClient().from('appointments').delete().eq('stylist_id', id);
  await adminClient().from('stylists').delete().eq('id', id);
}

async function scheduleOf(stylistId: string): Promise<{ weekday: number; starts: string; ends: string }[]> {
  const { data } = await adminClient()
    .from('stylist_schedule')
    .select('weekday, starts, ends')
    .eq('stylist_id', stylistId)
    .order('weekday')
    .order('starts');
  return (data ?? []).map((r) => ({ weekday: r.weekday, starts: r.starts.slice(0, 5), ends: r.ends.slice(0, 5) }));
}

// Primer lunes con al menos 21 días de margen (distinto de los días de otros e2e en lo que importa: la estilista es propia).
function mondayAhead(minDays: number): string {
  let date = addDays(todayInMadrid(), minDays);
  while (new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) date = addDays(date, 1);
  return date;
}

const day = (page: Page, weekday: number) => page.locator(`li[data-weekday="${weekday}"]`);

test.describe('horarios semanales del Admin (CA-38, CA-39)', () => {
  test('editar el horario de una estilista: añadir, quitar tramos y guardar', async ({ page }) => {
    const email = newEmail('admin');
    const stylist = await createTestStylist();
    try {
      await signInAsAdmin(page, email);
      await page.goto(PAGE);
      await page.getByRole('link', { name: stylist.name }).click();
      await expect(page.getByRole('heading', { name: `Horario de ${stylist.name}` })).toBeVisible();
      await expect(day(page, 1)).toContainText('Día libre');

      // Lunes: 10:00–14:00 y 16:00–20:00. Sábado: 10:00–14:00.
      await day(page, 1).getByRole('button', { name: /Añadir tramo/ }).click();
      await day(page, 1).locator('select').nth(1).selectOption('14:00');
      await day(page, 1).getByRole('button', { name: /Añadir tramo/ }).click();
      await day(page, 1).locator('select').nth(2).selectOption('16:00');
      await day(page, 1).locator('select').nth(3).selectOption('20:00');
      await day(page, 6).getByRole('button', { name: /Añadir tramo/ }).click();
      await day(page, 6).locator('select').nth(1).selectOption('14:00');

      await page.getByRole('button', { name: /Guardar horario/ }).click();
      await expect(page.getByRole('status')).toHaveText('Horario guardado.');
      await expect.poll(() => scheduleOf(stylist.id)).toEqual([
        { weekday: 1, starts: '10:00', ends: '14:00' },
        { weekday: 1, starts: '16:00', ends: '20:00' },
        { weekday: 6, starts: '10:00', ends: '14:00' },
      ]);

      // Vuelve a cargar lo guardado; se quita el tramo de la tarde y el sábado queda libre.
      await expect(day(page, 1).locator('select')).toHaveCount(4);
      await day(page, 1).getByRole('button', { name: /Quitar tramo 16:00–20:00/ }).click();
      await day(page, 6).getByRole('button', { name: /Quitar tramo/ }).click();
      await expect(day(page, 6)).toContainText('Día libre');
      await page.getByRole('button', { name: /Guardar horario/ }).click();
      await expect(page.getByRole('status')).toHaveText('Horario guardado.');
      await expect.poll(() => scheduleOf(stylist.id)).toEqual([{ weekday: 1, starts: '10:00', ends: '14:00' }]);
    } finally {
      await deleteTestStylist(stylist.id);
      await cleanup([email]);
    }
  });

  test('con citas que quedarían fuera no se guarda nada, se listan con su enlace y, resueltas, se aplica', async ({ page }) => {
    const email = newEmail('admin');
    const stylist = await createTestStylist();
    const monday = mondayAhead(21);
    try {
      // Horario inicial por la BD: lunes 10:00–20:00 (el salón abre así los lunes).
      await adminClient().from('stylist_schedule').insert({ stylist_id: stylist.id, weekday: 1, starts: '10:00', ends: '20:00' });
      const start = madridDateTimeToUtc(monday, '11:00');
      const { data: appt, error } = await adminClient()
        .from('appointments')
        .insert({
          stylist_id: stylist.id,
          service_id: await idByName('services', 'Tratamiento hidratante'),
          during: `[${start.toISOString()},${new Date(start.getTime() + 30 * 60_000).toISOString()})`,
          status: 'confirmed',
          guest_name: 'Persona de prueba',
          guest_email: newEmail('invitada'),
          guest_phone: '+34600000000',
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);

      await signInAsAdmin(page, email);
      await page.goto(`${PAGE}?quien=${stylist.id}`);

      // Empezar a las 14:00 dejaría fuera la cita de las 11:00.
      await day(page, 1).locator('select').nth(0).selectOption('14:00');
      await page.getByRole('button', { name: /Guardar horario/ }).click();

      const alert = page.getByRole('alert').filter({ hasText: 'Hay citas que quedarían fuera' });
      await expect(alert).toBeVisible();
      const conflict = alert.locator(`[data-conflict-id="${appt.id}"]`);
      await expect(conflict).toContainText('Persona de prueba');
      await expect(conflict.getByRole('link', { name: 'Mover o cancelar esta cita' })).toHaveAttribute(
        'href',
        `/admin/agenda/cita/${appt.id}`,
      );
      await expect.poll(() => scheduleOf(stylist.id)).toEqual([{ weekday: 1, starts: '10:00', ends: '20:00' }]);

      // Un horario que la contiene se aplica (lo escrito se conservó en el formulario).
      await day(page, 1).locator('select').nth(0).selectOption('11:00');
      await page.getByRole('button', { name: /Guardar horario/ }).click();
      await expect(page.getByRole('status')).toHaveText('Horario guardado.');
      await expect.poll(() => scheduleOf(stylist.id)).toEqual([{ weekday: 1, starts: '11:00', ends: '20:00' }]);
    } finally {
      await deleteTestStylist(stylist.id);
      await cleanup([email]);
    }
  });

  test('el horario del salón se ve con sus tramos y los días libres', async ({ page }) => {
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      await page.goto(PAGE);
      await expect(page.getByRole('heading', { name: 'Horario del salón' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Salón' })).toHaveAttribute('aria-current', 'page');

      // Lunes abierto (semilla: 10:00–20:00) y domingo libre.
      await expect(day(page, 1).locator('select').nth(0)).toHaveValue('10:00');
      await expect(day(page, 1).locator('select').nth(1)).toHaveValue('20:00');
      await expect(day(page, 7)).toContainText('Día libre');

      // Un ámbito que no existe vuelve al salón.
      await page.goto(`${PAGE}?quien=00000000-0000-4000-8000-000000000000`);
      await expect(page.getByRole('heading', { name: 'Horario del salón' })).toBeVisible();
      await page.goto(`${PAGE}?quien=cualquier-cosa`);
      await expect(page.getByRole('heading', { name: 'Horario del salón' })).toBeVisible();
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
        await page.setViewportSize({ width: 375, height: 900 });
        await page.screenshot({
          path: path.join('sdd', 'reviews', 'evidencias', 'T-009c', 'horarios-375.png'),
          fullPage: true,
        });
      }
    } finally {
      await cleanup([email]);
    }
  });
});
