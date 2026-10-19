import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatPriceFrom,
  groupServices,
  type ServiceRow,
} from '@/lib/services/catalog';

const row = (over: Partial<ServiceRow>): ServiceRow => ({
  id: 'id',
  category: 'Color',
  name: 'Servicio',
  price_from_cents: 1000,
  duration_min: 30,
  sort_order: 0,
  ...over,
});

describe('groupServices', () => {
  it('agrupa por categoría respetando el orden de aparición', () => {
    const groups = groupServices([
      row({ id: '1', category: 'Corte y peinado', name: 'Corte mujer' }),
      row({ id: '2', category: 'Color', name: 'Color' }),
      row({ id: '3', category: 'Corte y peinado', name: 'Peinado' }),
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Corte y peinado', 'Color']);
    expect(groups[0]?.services.map((s) => s.name)).toEqual(['Corte mujer', 'Peinado']);
  });

  it('devuelve una lista vacía si no hay servicios', () => {
    expect(groupServices([])).toEqual([]);
  });
});

describe('formatPriceFrom', () => {
  it('muestra «Desde» y el euro en formato español', () => {
    expect(formatPriceFrom(2500).replace(/\s/g, ' ')).toBe('Desde 25 €');
  });

  it('conserva los céntimos cuando existen', () => {
    expect(formatPriceFrom(2550).replace(/\s/g, ' ')).toBe('Desde 25,50 €');
  });
});

describe('formatDuration', () => {
  it.each([
    [30, '30 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [150, '2 h 30 min'],
    [180, '3 h'],
  ])('%i minutos → %s', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});
