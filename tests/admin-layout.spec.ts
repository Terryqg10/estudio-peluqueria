import { test, expect, type Page } from '@playwright/test';
import { addDays } from '../src/lib/booking/dates';
import { mondayOf } from '../src/lib/admin/week';
import { cleanup, confirmFromEmail, newEmail, requestLink } from './helpers/account-flow';
import { setRole, userIdByEmail } from './helpers/supabase-admin';

// T-024: contenedor alineado con la cabecera, navegación propia del panel y estado vacío único.
const PAGES = [
  { path: '/admin', h1: 'Panel de administración', current: 'Resumen' },
  { path: '/admin/agenda', h1: 'Agenda', current: 'Agenda' },
  { path: '/admin/servicios', h1: 'Servicios', current: 'Servicios' },
  { path: '/admin/bloqueos', h1: 'Bloqueos y vacaciones', current: 'Bloqueos y vacaciones' },
  { path: '/admin/horarios', h1: 'Horarios', current: 'Horarios' },
];

async function signInAsAdmin(page: Page, email: string) {
  await requestLink(page, email);
  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  await setRole(userId ?? '', 'admin');
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('panel Admin: layout y navegación (T-024)', () => {
  test('admin-layout: el título alinea con el logo, la navegación marca la sección y todos los destinos existen', async ({
    page,
  }) => {
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      await page.setViewportSize({ width: 1280, height: 900 });

      for (const item of PAGES) {
        const response = await page.goto(item.path);
        expect(response?.status(), item.path).toBe(200);

        const logo = await page.locator('header a').first().boundingBox();
        const title = await page.getByRole('heading', { level: 1, name: item.h1 }).boundingBox();
        expect(logo && title && Math.abs(logo.x - title.x), `${item.path}: x del título vs. logo`).toBeLessThanOrEqual(
          1,
        );

        const nav = page.getByRole('navigation', { name: 'Panel de administración' });
        await expect(nav.getByRole('link', { name: item.current, exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        );
        await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
        await expect(nav.getByRole('button', { name: 'Salir' })).toBeVisible();
      }

      const hrefs = await page
        .getByRole('navigation', { name: 'Panel de administración' })
        .getByRole('link')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
      expect(hrefs).toEqual(PAGES.map((p) => p.path));
    } finally {
      await cleanup([email]);
    }
  });

  test('admin-layout: la navegación se pliega sin desbordar y con áreas de 44 px de 320 a 768 px', async ({ page }) => {
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      for (const width of [320, 375, 480, 700, 768]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/admin');
        const nav = page.getByRole('navigation', { name: 'Panel de administración' });
        const boxes = await nav.locator('a, button').evaluateAll((els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { right: r.right, left: r.left, height: r.height };
          }),
        );
        expect(boxes.length).toBe(6);
        for (const box of boxes) {
          expect(box.right, `${width}: derecha`).toBeLessThanOrEqual(width);
          expect(box.left, `${width}: izquierda`).toBeGreaterThanOrEqual(0);
          expect(box.height, `${width}: altura`).toBeGreaterThanOrEqual(44);
        }
      }
    } finally {
      await cleanup([email]);
    }
  });

  test('admin-vacio: una semana sin citas dice «Sin citas esta semana» una sola vez, visible', async ({ page }) => {
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      const far = mondayOf(addDays(new Date().toISOString().slice(0, 10), 50 * 7));
      for (const width of [375, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/admin/agenda?semana=${far}`);
        await expect(page.getByText('Sin citas esta semana')).toHaveCount(1);
        const visibleEmpties = await page.getByText('Sin citas', { exact: true }).evaluateAll(
          (els) => els.filter((el) => el.getBoundingClientRect().width > 1 && el.checkVisibility()).length,
        );
        expect(visibleEmpties, `${width}: «Sin citas» visibles`).toBe(0);
      }
    } finally {
      await cleanup([email]);
    }
  });
});
