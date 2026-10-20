import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import { cleanup, confirmFromEmail, newEmail, requestLink, signIn } from './helpers/account-flow';
import { deleteProfile, setRole, userIdByEmail } from './helpers/supabase-admin';

// T-008a: acceso al panel Admin (CA-17, ADR-0022). La parte de BD de CA-17 es la prueba de integración
// `acceso-admin` (T-002); aquí se comprueba la aplicación: guardián de servidor, redirección por rol y
// que una clienta no ve ni sabe que existe el panel. Cada test usa emails únicos.
const PANEL = 'Panel de administración';

// Crea la cuenta con el enlace, le da el rol (como haría `pnpm admin:promote`) y entra: va a /admin.
async function signInAsAdmin(page: Parameters<typeof signIn>[0], email: string) {
  await requestLink(page, email);
  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  await setRole(userId ?? '', 'admin');
  await confirmFromEmail(page, email);
  await expect(page).toHaveURL(/\/admin$/);
  return userId ?? '';
}

test.describe('acceso al panel Admin (CA-17)', () => {
  test('sin sesión, /admin lleva al acceso y una ruta inexistente bajo /admin da 404', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/acceso$/);
    await expect(page.getByText(PANEL)).toHaveCount(0);

    // Una ruta que no existe no llega al panel: 404 igual que en cualquier otro sitio de la web.
    const missing = await page.goto('/admin/inventada');
    expect(missing?.status()).toBe(404);
    await expect(page.getByText(PANEL)).toHaveCount(0);
  });

  test('una clienta con sesión recibe 404, igual que una ruta que no existe', async ({ page }) => {
    const email = newEmail('clienta');
    try {
      await signIn(page, email); // clienta: aterriza en /mis-citas

      const denied = await page.goto('/admin');
      expect(denied?.status()).toBe(404);
      const deniedText = await page.locator('main').innerText();
      expect(deniedText).not.toContain(PANEL);

      const missing = await page.goto('/ruta-que-no-existe-xyz');
      expect(missing?.status()).toBe(404);
      // Mismo contenido: no revela que el panel existe.
      expect(await page.locator('main').innerText()).toBe(deniedText);

      const nested = await page.goto('/admin/inventada');
      expect(nested?.status()).toBe(404);

      // La sesión de la clienta sigue siendo válida en su zona.
      await page.goto('/mis-citas');
      await expect(page.getByRole('heading', { name: 'Mis citas' })).toBeVisible();
    } finally {
      await cleanup([email]);
    }
  });

  test('el Admin entra con el enlace, ve el panel y /acceso con sesión lo devuelve al panel', async ({ page }) => {
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);
      await expect(page.getByRole('heading', { name: PANEL })).toBeVisible();
      await expect(page.getByText(`Has entrado como ${email}`)).toBeVisible();

      await page.reload();
      await expect(page.getByRole('heading', { name: PANEL })).toBeVisible();

      await page.goto('/acceso');
      await expect(page).toHaveURL(/\/admin$/);

      await page.getByRole('button', { name: 'Salir' }).click();
      await expect(page).toHaveURL(/\/acceso$/);
      await page.goto('/admin');
      await expect(page).toHaveURL(/\/acceso$/);
    } finally {
      await cleanup([email]);
    }
  });

  test('revocar el rol con la sesión abierta surte efecto en la siguiente petición', async ({ page }) => {
    const email = newEmail('admin');
    try {
      const userId = await signInAsAdmin(page, email);
      await setRole(userId, 'client');

      const denied = await page.goto('/admin');
      expect(denied?.status()).toBe(404);
      await expect(page.getByText(PANEL)).toHaveCount(0);
    } finally {
      await cleanup([email]);
    }
  });

  test('una cuenta sin fila en profiles se trata como no Admin (404, sin error)', async ({ page }) => {
    const email = newEmail('sin-perfil');
    try {
      await signIn(page, email);
      const userId = await userIdByEmail(email);
      await deleteProfile(userId ?? '');

      const denied = await page.goto('/admin');
      expect(denied?.status()).toBe(404);
    } finally {
      await cleanup([email]);
    }
  });

  test('el panel no se enlaza desde la navegación pública', async ({ page }) => {
    for (const route of ['/', '/contacto', '/reservar', '/acceso']) {
      await page.goto(route);
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    }
  });

  test('el panel va con noindex y sin caché, pasa axe y no desborda de 320 a 1280 px', async ({ page }) => {
    // Con transiciones activas axe puede medir un color intermedio: se mide el final.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const email = newEmail('admin');
    try {
      await signInAsAdmin(page, email);

      const response = await page.goto('/admin');
      expect(response?.headers()['cache-control']).toContain('no-store');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);

      for (const width of [320, 375, 480, 700, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return doc.scrollWidth - doc.clientWidth;
        });
        expect(overflow, `desborda ${overflow}px a ${width}px`).toBeLessThanOrEqual(1);
        const box = await page.locator('main').boundingBox();
        expect(box && box.x + box.width).toBeLessThanOrEqual(width + 1);
      }

      // Captura a 375 px para la review (solo si se pide: CAPTURE_EVIDENCE=1).
      if (process.env.CAPTURE_EVIDENCE) {
        await page.setViewportSize({ width: 375, height: 800 });
        await page.screenshot({
          path: path.join('sdd', 'reviews', 'evidencias', 'T-008a', 'admin-375.png'),
          fullPage: true,
        });
      }
    } finally {
      await cleanup([email]);
    }
  });
});
