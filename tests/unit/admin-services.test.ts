import { describe, expect, it } from 'vitest';
import { ServiceFormSchema, centsToEuros, eurosToCents } from '@/lib/admin/services';

const STYLIST = '11111111-1111-4111-8111-111111111111';
const valid = {
  name: ' Corte infantil ',
  category: 'Corte',
  price: '25,50',
  duration: '45',
  active: true,
  stylistIds: [STYLIST],
};

describe('servicios del Admin (T-009a)', () => {
  it('eurosToCents acepta enteros, coma y punto, y redondea a céntimos exactos', () => {
    expect(eurosToCents('45')).toBe(4500);
    expect(eurosToCents('45,5')).toBe(4550);
    expect(eurosToCents('45.50')).toBe(4550);
    expect(eurosToCents(' 0 ')).toBe(0);
    expect(eurosToCents('9999')).toBe(999900);
    expect(eurosToCents('9999,99')).toBe(999999);
  });

  it('eurosToCents rechaza lo que no es un precio', () => {
    for (const bad of ['', 'abc', '-5', '45,', '45,555', '1.234,50', '45 €', '10000', '1e3', '4 5']) {
      expect(eurosToCents(bad), bad).toBeNull();
    }
  });

  it('centsToEuros es la inversa y no deja decimales de más', () => {
    expect(centsToEuros(4500)).toBe('45');
    expect(centsToEuros(4550)).toBe('45,50');
    expect(centsToEuros(4505)).toBe('45,05');
    expect(eurosToCents(centsToEuros(4505))).toBe(4505);
  });

  it('el esquema recorta espacios y convierte precio y duración', () => {
    const parsed = ServiceFormSchema.parse(valid);
    expect(parsed).toMatchObject({ name: 'Corte infantil', price: 2550, duration: 45, active: true });
  });

  it('el esquema da un mensaje por campo no válido', () => {
    const result = ServiceFormSchema.safeParse({ ...valid, name: 'A', price: 'gratis', duration: '62', category: '' });
    expect(result.success).toBe(false);
    const fields = result.success ? [] : result.error.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(['name', 'category', 'price', 'duration']));
  });

  it('la duración va de 5 a 480 en pasos de 5', () => {
    for (const ok of ['5', '60', '480']) expect(ServiceFormSchema.safeParse({ ...valid, duration: ok }).success).toBe(true);
    for (const bad of ['0', '4', '7', '485', '1000', '-5', '6,5', '']) {
      expect(ServiceFormSchema.safeParse({ ...valid, duration: bad }).success, bad).toBe(false);
    }
  });

  it('las estilistas deben ser UUID', () => {
    expect(ServiceFormSchema.safeParse({ ...valid, stylistIds: ['no-es-uuid'] }).success).toBe(false);
    expect(ServiceFormSchema.safeParse({ ...valid, stylistIds: [] }).success).toBe(true);
  });
});
