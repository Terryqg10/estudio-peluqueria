import { test, expect } from '@playwright/test';

// CA-31, CA-32, CA-34: logo, navegación móvil y enlaces con destino real.

test.describe('navegación', () => {
  test('el logo enlaza a / desde cualquier página (CA-31)', async ({ page }) => {
    await page.goto('/contacto');
    await page.locator('header a[href="/"]').first().click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('todos los enlaces internos de la cabecera y el pie responden 200 (CA-32)', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('header a[href^="/"], footer a[href^="/"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    const unique = [...new Set(hrefs)].filter((h) => h !== '' && h !== '#');
    expect(unique.length).toBeGreaterThan(0);
    for (const href of unique) {
      const res = await request.get(href);
      expect(res.status(), `GET ${href}`).toBe(200);
    }
  });

  test('la cabecera es sticky tras hacer scroll (CA-34)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto('/contacto');
    await page.evaluate(() => window.scrollTo(0, 2000));
    const box = await page.locator('header').boundingBox();
    expect(box?.y).toBeGreaterThanOrEqual(-1);
    expect(box?.y).toBeLessThanOrEqual(1);
  });

  test.describe('menú móvil', () => {
    test.use({ viewport: { width: 390, height: 800 } });

    test('se abre, se cierra con Esc y devuelve el foco (CA-32)', async ({ page }) => {
      await page.goto('/');
      const trigger = page.getByRole('link', { name: 'Abrir menú' });
      await expect(page.locator('#menu-movil')).toBeHidden();
      await trigger.click();
      await expect(page.locator('#menu-movil')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Cerrar menú' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('#menu-movil')).toBeHidden();
      await expect(trigger).toBeFocused();
    });

    test('se cierra al pulsar fuera de los enlaces (CA-32)', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('link', { name: 'Abrir menú' }).click();
      await expect(page.locator('#menu-movil')).toBeVisible();
      await page.mouse.click(195, 780);
      await expect(page.locator('#menu-movil')).toBeHidden();
    });

    test('navegar desde el menú cierra el panel y llega a la página', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('link', { name: 'Abrir menú' }).click();
      await page.locator('#menu-movil').getByRole('link', { name: 'Contacto' }).click();
      await expect(page).toHaveURL(/\/contacto$/);
      await expect(page.locator('#menu-movil')).toBeHidden();
    });

    test('los controles táctiles miden al menos 44x44 px (CA-34)', async ({ page }) => {
      await page.goto('/');
      const box = await page.getByRole('link', { name: 'Abrir menú' }).boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);
    });
  });

  test('en escritorio se ve la navegación y no el botón de menú', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('header nav').getByRole('link', { name: 'Contacto' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir menú' })).toBeHidden();
  });
});
