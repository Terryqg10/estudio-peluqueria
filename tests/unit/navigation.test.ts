import { describe, expect, it } from 'vitest';
import { NAV_ITEMS } from '@/lib/navigation';
import { PUBLIC_PAGES } from '@/lib/public-pages';

// test-31: todo destino de la navegación es una ruta interna real (CA-32).
describe('NAV_ITEMS', () => {
  it('solo contiene rutas internas, sin "#" ni vacías', () => {
    expect(NAV_ITEMS.length).toBeGreaterThan(0);
    for (const item of NAV_ITEMS) {
      expect(item.href.startsWith('/')).toBe(true);
      expect(item.href).not.toBe('#');
      expect(item.label.trim()).not.toBe('');
    }
  });

  it('no repite destinos', () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('todo destino de la navegación está en la lista única de páginas públicas (CA-37)', () => {
    const publicPages: readonly string[] = PUBLIC_PAGES;
    for (const item of NAV_ITEMS) {
      expect(publicPages).toContain(item.href);
    }
  });

  it('no usa numeraciones en las etiquetas', () => {
    for (const item of NAV_ITEMS) {
      expect(item.label).not.toMatch(/^\d{1,2}[\s.)-]/);
    }
  });
});
