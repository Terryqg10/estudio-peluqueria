import { test, expect } from '@playwright/test';

// RF-01: hero, servicios y contacto en la home.

test.describe('home', () => {
  for (const [name, width, height] of [
    ['390 px', 390, 844],
    ['1440 px', 1440, 900],
  ] as const) {
    test(`CA-03: un único h1 y un CTA visibles sin scroll a ${name}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');

      await expect(page.locator('h1')).toHaveCount(1);
      const h1 = await page.locator('h1').boundingBox();
      const cta = await page.getByRole('link', { name: 'Ver servicios' }).boundingBox();
      expect(h1, 'h1').not.toBeNull();
      expect(cta, 'CTA').not.toBeNull();
      expect((h1?.y ?? 0) + (h1?.height ?? 0), 'el h1 cabe en el primer pliegue').toBeLessThanOrEqual(height);
      expect((cta?.y ?? 0) + (cta?.height ?? 0), 'el CTA cabe en el primer pliegue').toBeLessThanOrEqual(height);
    });
  }

  test('el CTA del hero enlaza a la sección de servicios', async ({ page }) => {
    await page.goto('/');
    const cta = page.getByRole('link', { name: 'Ver servicios' });
    await expect(cta).toHaveAttribute('href', '#servicios');
    await expect(page.locator('#servicios')).toBeVisible();
  });

  test('CA-04: dirección, teléfono y horario son visibles en la home', async ({ page }) => {
    await page.goto('/');
    const contacto = page.locator('#contacto');
    await expect(contacto.getByText('Dirección')).toBeVisible();
    await expect(contacto.getByText('Teléfono')).toBeVisible();
    await expect(contacto.getByText('Horario')).toBeVisible();
    await expect(contacto.getByRole('link', { name: /\+34/ })).toHaveAttribute('href', /^tel:/);
  });

  test('CA-01 (parcial): los servicios muestran categoría, duración y precio «desde»', async ({
    page,
  }) => {
    await page.goto('/');
    const servicios = page.locator('#servicios');
    await expect(servicios.getByRole('heading', { level: 3 }).first()).toBeVisible();
    const cards = servicios.locator('li');
    expect(await cards.count()).toBeGreaterThanOrEqual(8);
    await expect(servicios.getByText('Corte mujer')).toBeVisible();
    await expect(servicios.getByText(/Desde 25/)).toBeVisible();
    await expect(servicios.getByText('45 min')).toBeVisible();
    await expect(servicios.getByText('Color', { exact: true }).first()).toBeVisible();
  });
});
