import { test, expect } from '@playwright/test';

// T-011: galería antes/después de la home (RF-01, CA-02). El filtro funciona con enlaces: se prueba también con
// JavaScript desactivado.
const items = (page: import('@playwright/test').Page) => page.locator('li[data-gallery-item]');

test.describe('galería antes/después (CA-02)', () => {
  test('galeria-filtro: filtrar por técnica deja solo esos trabajos, con técnica, estilista y enlace a reservar', async ({
    page,
  }) => {
    await page.goto('/');
    const all = await items(page).count();
    expect(all).toBeGreaterThanOrEqual(6);

    // Técnicas ofrecidas por los filtros (todas menos «Todas»).
    const techniques = await page
      .locator('a[data-technique-filter]:not([data-technique-filter="todas"])')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-technique-filter') ?? ''));
    expect(techniques.length).toBeGreaterThanOrEqual(3);

    let total = 0;
    for (const technique of techniques) {
      await page.locator(`a[data-technique-filter="${technique}"]`).click();
      await expect(page).toHaveURL(new RegExp(`tecnica=${encodeURIComponent(technique)}`));
      await expect(page.locator(`a[data-technique-filter="${technique}"]`)).toHaveAttribute('aria-current', 'true');

      const cards = items(page);
      const count = await cards.count();
      expect(count).toBeGreaterThan(0);
      total += count;
      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        await expect(card).toHaveAttribute('data-technique', technique);
        await expect(card.getByRole('heading', { level: 3 })).toHaveText(technique);
        await expect(card).toContainText('Con ');
        const reserve = card.getByRole('link', { name: /^Reservar / });
        await expect(reserve).toHaveAttribute('href', /^\/reservar\?servicio=[0-9a-f-]{36}$/);
      }
    }
    expect(total).toBe(all); // cada trabajo tiene una técnica y aparece en su filtro

    await page.locator('a[data-technique-filter="todas"]').click();
    await expect(items(page)).toHaveCount(all);
    await expect(page.locator('a[data-technique-filter="todas"]')).toHaveAttribute('aria-current', 'true');
  });

  test('el enlace de un trabajo abre la reserva con ese servicio elegido', async ({ page }) => {
    await page.goto('/?tecnica=Balayage');
    const card = items(page).first();
    const name = (await card.getByRole('link', { name: /^Reservar / }).innerText()).replace(/^Reservar /, '');
    await card.getByRole('link', { name: /^Reservar / }).click();
    await expect(page).toHaveURL(/\/reservar\?servicio=/);
    await expect(page.getByLabel(new RegExp(name)).first()).toBeChecked();
  });

  test('una técnica que no existe se ignora y se muestran todos los trabajos; sin JavaScript también filtra', async ({
    browser,
    page,
  }) => {
    await page.goto('/');
    const all = await items(page).count();

    for (const bad of ['Inventada', 'balayage', '<script>alert(1)</script>', '']) {
      await page.goto(`/?tecnica=${encodeURIComponent(bad)}`);
      await expect(items(page)).toHaveCount(all);
      await expect(page.locator('a[data-technique-filter="todas"]')).toHaveAttribute('aria-current', 'true');
    }

    const context = await browser.newContext({ javaScriptEnabled: false });
    const noJs = await context.newPage();
    await noJs.goto('/?tecnica=Corte#galeria');
    const cards = noJs.locator('li[data-gallery-item]');
    expect(await cards.count()).toBeGreaterThan(0);
    for (const technique of await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-technique')))) {
      expect(technique).toBe('Corte');
    }
    await context.close();
  });

  test('cada par lleva alt, srcset y sizes; se apila en móvil y va en dos columnas desde md', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/?tecnica=Balayage#galeria');
    const card = items(page).first();
    const imgs = card.locator('img');
    await expect(imgs).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const img = imgs.nth(i);
      await expect(img).toHaveAttribute('alt', /.{5,}/);
      await expect(img).toHaveAttribute('srcset', /.+/);
      await expect(img).toHaveAttribute('sizes', /.+/);
      await expect(img).toHaveAttribute('width', '1000');
      await expect(img).toHaveAttribute('height', '1000');
    }

    // Móvil: una imagen debajo de la otra. Escritorio: lado a lado.
    await card.scrollIntoViewIfNeeded();
    const mobile = [await imgs.nth(0).boundingBox(), await imgs.nth(1).boundingBox()];
    expect(mobile[1]?.y ?? 0).toBeGreaterThan((mobile[0]?.y ?? 0) + (mobile[0]?.height ?? 0) - 1);

    await page.setViewportSize({ width: 1280, height: 900 });
    const desktop = [await imgs.nth(0).boundingBox(), await imgs.nth(1).boundingBox()];
    expect(Math.abs((desktop[1]?.y ?? 0) - (desktop[0]?.y ?? 0))).toBeLessThan(2);
    expect(desktop[1]?.x ?? 0).toBeGreaterThan((desktop[0]?.x ?? 0) + (desktop[0]?.width ?? 0) - 1);
  });
});
