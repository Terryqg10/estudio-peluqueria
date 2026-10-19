import { describe, expect, it } from 'vitest';
import { groupSlotsByStart, partOfDay, pickStylist, splitByPartOfDay } from '@/lib/booking/slots';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('groupSlotsByStart', () => {
  it('agrupa por instante, une estilistas y ordena', () => {
    const options = groupSlotsByStart([
      { stylistId: B, startsAt: '2026-11-02T09:15:00Z' },
      { stylistId: A, startsAt: '2026-11-02T09:00:00Z' },
      { stylistId: B, startsAt: '2026-11-02T09:00:00Z' },
    ]);
    expect(options.map((o) => o.label)).toEqual(['10:00', '10:15']);
    expect(options[0]?.stylistIds.sort()).toEqual([A, B]);
    expect(options[1]?.stylistIds).toEqual([B]);
  });

  it('no repite una estilista y devuelve vacío sin huecos', () => {
    const dup = groupSlotsByStart([
      { stylistId: A, startsAt: '2026-11-02T09:00:00Z' },
      { stylistId: A, startsAt: '2026-11-02T09:00:00Z' },
    ]);
    expect(dup[0]?.stylistIds).toEqual([A]);
    expect(groupSlotsByStart([])).toEqual([]);
  });
});

describe('partOfDay y splitByPartOfDay', () => {
  it('antes de las 14:00 es mañana y desde las 14:00 es tarde, en hora local', () => {
    expect(partOfDay('2026-11-02T12:45:00Z')).toBe('morning'); // 13:45 en Madrid
    expect(partOfDay('2026-11-02T13:00:00Z')).toBe('afternoon'); // 14:00 en Madrid
  });

  it('reparte las opciones en mañana y tarde', () => {
    const options = groupSlotsByStart([
      { stylistId: A, startsAt: '2026-11-02T09:00:00Z' },
      { stylistId: A, startsAt: '2026-11-02T15:00:00Z' },
    ]);
    const split = splitByPartOfDay(options);
    expect(split.morning.map((o) => o.label)).toEqual(['10:00']);
    expect(split.afternoon.map((o) => o.label)).toEqual(['16:00']);
  });
});

describe('pickStylist', () => {
  const option = { startsAt: '2026-11-02T09:00:00Z', label: '10:00', stylistIds: [B, A] };

  it('respeta la preferida si ofrece el hueco', () => {
    expect(pickStylist(option, B)).toBe(B);
  });

  it('si no hay preferida, o no lo ofrece, elige de forma determinista', () => {
    expect(pickStylist(option)).toBe(A);
    expect(pickStylist(option, '33333333-3333-4333-8333-333333333333')).toBe(A);
  });
});
