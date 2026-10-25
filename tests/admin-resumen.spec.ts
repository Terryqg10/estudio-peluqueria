import { test, expect, type Page } from '@playwright/test';
import { confirmFromEmail, newEmail, requestLink } from './helpers/account-flow';
import { setRole, userIdByEmail } from './helpers/supabase-admin';

// T-034 (hallazgo 5 del pase visual): en servicios, bloqueos y horarios, a 1280 px el resumen ocupa la segunda columna
// en lugar de dejar un tercio derecho vacío; en móvil va debajo del contenido, sin desbordes.
const PAGES = ['/admin/servicios', '/admin/bloqueos', '/admin/horarios'];

async function signInAsAdmin(page: Page) {
  const email = newEmail('admin');
  await requestLink(page, email);
  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  await setRole(userId ?? '', 'admin');
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(/\/admin$/);
}

test.describe('resumen lateral del panel (T-034)', () => {
  test('a 1280 px el resumen va a la derecha del contenido; a 375 px, debajo, sin desbordar', async ({ page }) => {
    await signInAsAdmin(page);
    for (const url of PAGES) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(url);
      const main = page.locator('main section').first();
      const aside = page.getByRole('complementary');
      await expect(aside).toBeVisible();
      await expect(aside.getByRole('heading', { level: 2 })).toBeVisible();
      const [m, a] = await Promise.all([main.boundingBox(), aside.boundingBox()]);
      expect(m && a).toBeTruthy();
      // Segunda columna: empieza a la derecha del contenido y alineada arriba con él.
      expect(a?.x ?? 0).toBeGreaterThanOrEqual((m?.x ?? 0) + (m?.width ?? 0));
      expect(Math.abs((a?.y ?? 0) - (m?.y ?? 0))).toBeLessThan(4);

      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(url);
      const [m2, a2] = await Promise.all([main.boundingBox(), aside.boundingBox()]);
      expect(a2?.y ?? 0).toBeGreaterThan((m2?.y ?? 0) + (m2?.height ?? 0) - 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
  });
});
