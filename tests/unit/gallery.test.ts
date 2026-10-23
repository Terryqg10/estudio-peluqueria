import { describe, expect, it } from 'vitest';
import { filterByTechnique, parseTechnique, techniquesOf, type GalleryItem } from '@/lib/gallery/gallery';

function item(id: string, technique: string): GalleryItem {
  return {
    id,
    technique,
    serviceId: `service-${id}`,
    serviceName: `Servicio ${technique}`,
    stylistName: 'Estilista',
    beforePath: `/images/galeria/${id}-antes.jpg`,
    afterPath: `/images/galeria/${id}-despues.jpg`,
    altBefore: 'Antes de prueba',
    altAfter: 'Después de prueba',
    aiGenerated: true,
  };
}

const ITEMS = [item('1', 'Balayage'), item('2', 'Corte'), item('3', 'Balayage'), item('4', 'Color')];

describe('galería antes/después (T-011, CA-02)', () => {
  it('techniquesOf devuelve las técnicas sin repetir, en el orden de aparición', () => {
    expect(techniquesOf(ITEMS)).toEqual(['Balayage', 'Corte', 'Color']);
    expect(techniquesOf([])).toEqual([]);
  });

  it('filterByTechnique deja solo los trabajos de esa técnica; sin técnica, todos', () => {
    expect(filterByTechnique(ITEMS, 'Balayage').map((i) => i.id)).toEqual(['1', '3']);
    expect(filterByTechnique(ITEMS, 'Color').map((i) => i.id)).toEqual(['4']);
    expect(filterByTechnique(ITEMS, null)).toHaveLength(4);
    expect(filterByTechnique(ITEMS, 'Inexistente')).toEqual([]);
  });

  it('parseTechnique solo acepta una técnica que exista (entrada externa)', () => {
    expect(parseTechnique('Corte', ITEMS)).toBe('Corte');
    expect(parseTechnique(['Color', 'Corte'], ITEMS)).toBe('Color'); // el primero
    for (const bad of [undefined, '', 'corte', 'Corte ', '<script>', 'Balayage&x=1', ['Inventada']]) {
      expect(parseTechnique(bad, ITEMS), JSON.stringify(bad)).toBeNull();
    }
  });

  it('parseTechnique con la galería vacía devuelve siempre null', () => {
    expect(parseTechnique('Corte', [])).toBeNull();
  });
});
