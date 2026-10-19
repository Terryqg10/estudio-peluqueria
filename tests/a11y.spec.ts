import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.describe('accesibilidad', () => {
  test('la home no tiene violaciones graves ni críticas', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    if (serious.length > 0) {
      for (const v of serious) {
        console.error(`[a11y] ${v.id} (${v.impact}): ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) {
          console.error(`  - ${node.target.join(' ')}`);
        }
      }
    }
    expect(serious, 'violaciones graves o críticas de axe').toEqual([]);
  });

  test('respeta prefers-reduced-motion', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const hasInfiniteAnim = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const style = getComputedStyle(el);
        if (style.animationIterationCount === 'infinite') return true;
      }
      return false;
    });
    expect(hasInfiniteAnim).toBe(false);
    await context.close();
  });
});
