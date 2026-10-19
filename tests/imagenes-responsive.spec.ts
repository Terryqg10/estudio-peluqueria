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
            };
          }),
        );

        for (const img of images) {
          expect(img.alt, `alt en ${img.src}`).not.toBeNull();
          expect(img.hasSrcset, `srcset en ${img.src}`).toBe(true);
          expect(img.hasSizes, `sizes en ${img.src}`).toBe(true);
          expect(img.hasDimensions || img.aspectReserved, `dimensiones o aspect-ratio en ${img.src}`).toBe(true);
          expect(img.right, `${img.src} se sale por la derecha a ${width}px`).toBeLessThanOrEqual(width + 1);
          expect(img.left, `${img.src} se sale por la izquierda a ${width}px`).toBeGreaterThanOrEqual(-1);
        }

        // Solo la imagen LCP lleva prioridad alta.
        const high = images.filter((i) => i.fetchPriority === 'high');
        expect(high.length, 'imágenes con fetchpriority=high').toBeLessThanOrEqual(1);
      });
    }
  }

  test('la home tiene su imagen de hero con alt descriptivo', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('main img').first();
    await expect(hero).toHaveAttribute('alt', /.{15,}/);
    await expect(hero).toHaveAttribute('fetchpriority', 'high');
    await expect(hero).toHaveAttribute('loading', 'eager');
  });
});
