import { describe, expect, it } from 'vitest';
import { AvailabilityQuerySchema } from '@/lib/availability/schema';

const uuid = '3f0c1d2e-8a4b-4c6d-9e1f-2a3b4c5d6e7f';

describe('AvailabilityQuerySchema', () => {
  it('acepta servicio, fecha y estilista opcional', () => {
    expect(AvailabilityQuerySchema.safeParse({ serviceId: uuid, date: '2026-11-02' }).success).toBe(true);
    expect(
      AvailabilityQuerySchema.safeParse({ serviceId: uuid, date: '2026-11-02', stylistId: uuid }).success,
    ).toBe(true);
  });

  it.each([
    ['servicio no uuid', { serviceId: 'x', date: '2026-11-02' }],
    ['estilista no uuid', { serviceId: uuid, date: '2026-11-02', stylistId: 'x' }],
    ['formato de fecha', { serviceId: uuid, date: '02/11/2026' }],
    ['fecha inexistente (30 de febrero)', { serviceId: uuid, date: '2026-02-30' }],
    ['mes 13', { serviceId: uuid, date: '2026-13-01' }],
    ['sin fecha', { serviceId: uuid }],
    ['vacío', {}],
  ])('rechaza %s', (_name, input) => {
    expect(AvailabilityQuerySchema.safeParse(input).success).toBe(false);
  });

  it('acepta el 29 de febrero solo en año bisiesto', () => {
    expect(AvailabilityQuerySchema.safeParse({ serviceId: uuid, date: '2028-02-29' }).success).toBe(true);
    expect(AvailabilityQuerySchema.safeParse({ serviceId: uuid, date: '2027-02-29' }).success).toBe(false);
  });
});
