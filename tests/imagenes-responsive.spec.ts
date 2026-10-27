import { test, expect } from '@playwright/test';
import { PUBLIC_PAGES } from '../src/lib/public-pages';

// CA-36 / RNF-13 / ADR-0011: toda imagen de contenido es responsive y verificable.
const WIDTHS = [320, 375, 768, 1024, 1280];

type ImgInfo = {
  src: string;
  alt: string | null;
  hasSizes: boolean;
  hasSrcset: boolean;
  hasDimensions: boolean;
  aspectReserved: boolean;
  fetchPriority: string | null;
  right: number;
  left: number;
  inAllowedOverflow: boolean;
};

test.describe('imágenes responsive', () => {
  for (const route of PUBLIC_PAGES) {
    for (const width of WIDTHS) {
      test(`${route}: alt, srcset, sizes, dimensiones y sin desborde a ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(route);
        await page.waitForLoadState('load');

        const images = await page.evaluate((): ImgInfo[] =>
          Array.from(document.querySelectorAll('main img')).map((el) => {
            const img = el as HTMLImageElement;
            const rect = img.getBoundingClientRect();
            const parentStyle = img.parentElement ? getComputedStyle(img.parentElement) : null;
            return {
              src: img.currentSrc || img.src,
              alt: img.getAttribute('alt'),
              hasSizes: img.hasAttribute('sizes'),
              hasSrcset: img.hasAttribute('srcset'),
              hasDimensions: img.hasAttribute('width') && img.hasAttribute('height'),
              aspectReserved: !!parentStyle && parentStyle.aspectRatio !== 'auto',
              fetchPriority: img.getAttribute('fetchpriority'),
              right: rect.right,
              left: rect.left,
              inAllowedOverflow: !!img.closest('[data-allow-overflow]'),
            };
          }),
        );

        for (const img of images) {
          expect(img.alt, `alt en ${img.src}`).not.toBeNull();
          // ADR-0040: las muestras de la carta son SVG decorativos (alt vacío): no son imágenes de contenido ni tienen versiones por
          // resolución, así que no se les exige srcset ni sizes; sí dimensiones y que no desborden.
          const decorativeVector = img.alt === '' && /\.svg(\?|$)/.test(img.src);
          if (!decorativeVector) {
            expect(img.hasSrcset, `srcset en ${img.src}`).toBe(true);
            expect(img.hasSizes, `sizes en ${img.src}`).toBe(true);
          }
          expect(img.hasDimensions || img.aspectReserved, `dimensiones o aspect-ratio en ${img.src}`).toBe(true);
          // Excepción explícita (puerta 7): una tira con scroll deliberado (`data-allow-overflow`) puede tener imágenes fuera de la ventana.
          if (img.inAllowedOverflow) continue;
          expect(img.right, `${img.src} se sale por la derecha a ${width}px`).toBeLessThanOrEqual(width + 1);
          expect(img.left, `${img.src} se sale por la izquierda a ${width}px`).toBeGreaterThanOrEqual(-1);
        }

        // Solo la imagen LCP lleva prioridad alta.
        const high = images.filter((i) => i.fetchPriority === 'high');
        expect(high.length, 'imágenes con fetchpriority=high').toBeLessThanOrEqual(1);
      });
    }
  }

  // ADR-0040 (T-041): el hero ya no es una foto sino la carta de muestras; es decorativa (aria-hidden, alt vacío) y reserva su tamaño.
  // La información está en el texto del hero y en la carta de servicios.
  test('la home tiene su carta decorativa en el hero, oculta a lectores de pantalla y con tamaño reservado', async ({
    page,
  }) => {
    await page.goto('/');
    const fan = page.locator('.swatch-fan');
    await expect(fan).toHaveAttribute('aria-hidden', 'true');
    const imgs = fan.locator('img');
    expect(await imgs.count()).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < (await imgs.count()); i++) {
      const img = imgs.nth(i);
      await expect(img).toHaveAttribute('alt', '');
      await expect(img).toHaveAttribute('width', /\d+/);
      await expect(img).toHaveAttribute('height', /\d+/);
    }
  });
});
