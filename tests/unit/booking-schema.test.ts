import { describe, expect, it } from 'vitest';
import { BookingFormSchema, toFieldErrors } from '@/lib/booking/schema';

const uuid = '3f0c1d2e-8a4b-4c6d-9e1f-2a3b4c5d6e7f';

const valid = {
  serviceId: uuid,
  stylistId: uuid,
  startsAt: '2026-11-02T09:00:00.000Z',
  name: 'Ana García',
  email: 'ana@correo.com',
  phone: '+34 600 000 000',
  consent: true,
};

function errorsFor(over: Record<string, unknown>) {
  const result = BookingFormSchema.safeParse({ ...valid, ...over });
  return result.success ? null : toFieldErrors(result.error);
}

describe('BookingFormSchema (CA-10, CA-25)', () => {
  it('acepta datos válidos y normaliza espacios y mayúsculas del email', () => {
    const result = BookingFormSchema.safeParse({
      ...valid,
      name: '  Ana García  ',
      email: '  Ana@Correo.COM ',
      phone: ' 600 000 000 ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Ana García');
      expect(result.data.email).toBe('ana@correo.com');
      expect(result.data.phone).toBe('600 000 000');
    }
  });

  it.each([
    ['Ana', true],
    ['María-José O’Neil', true],
    ['José Ñúñez', true],
    ['A', false],
    ['', false],
    ['   ', false],
    ['Ana123', false],
    ['<script>', false],
    ['a'.repeat(81), false],
  ])('nombre «%s» → válido: %s', (name, ok) => {
    expect(BookingFormSchema.safeParse({ ...valid, name }).success).toBe(ok);
  });

  it.each([
    ['ana@correo.com', true],
    ['ana.garcia+salon@correo.es', true],
    ['ana@', false],
    ['@correo.com', false],
    ['ana correo.com', false],
    ['ana@correo', false],
    ['', false],
  ])('email «%s» → válido: %s', (email, ok) => {
    expect(BookingFormSchema.safeParse({ ...valid, email }).success).toBe(ok);
  });

  it.each([
    ['600 000 000', true],
    ['+34 600 000 000', true],
    ['(91) 123 45 67', true],
    ['600-000-000', true],
    ['12345', false],
    ['abc600000000', false],
    ['+34 600 000 000 000 000 000', false],
    ['', false],
  ])('teléfono «%s» → válido: %s', (phone, ok) => {
    expect(BookingFormSchema.safeParse({ ...valid, phone }).success).toBe(ok);
  });

  it('CA-25: sin consentimiento (false, ausente o distinto de true) se rechaza con mensaje', () => {
    expect(errorsFor({ consent: false })?.consent).toBe('Debes aceptar para poder reservar');
    expect(errorsFor({ consent: undefined })?.consent).toBeTruthy();
    expect(errorsFor({ consent: 'on' })?.consent).toBeTruthy();
    expect(BookingFormSchema.safeParse(valid).success).toBe(true);
  });

  it('un instante o un id manipulados no generan errores de campo visibles', () => {
    expect(BookingFormSchema.safeParse({ ...valid, startsAt: 'mañana' }).success).toBe(false);
    expect(errorsFor({ startsAt: 'mañana' })).toEqual({});
    expect(errorsFor({ serviceId: 'x' })).toEqual({});
  });

  it('devuelve un único mensaje por campo y todos los campos erróneos a la vez', () => {
    const errors = errorsFor({ name: '', email: 'x', phone: '1', consent: false });
    expect(Object.keys(errors ?? {}).sort()).toEqual(['consent', 'email', 'name', 'phone']);
  });

  it('el campo honeypot es opcional y acotado', () => {
    expect(BookingFormSchema.safeParse({ ...valid, website: '' }).success).toBe(true);
    expect(BookingFormSchema.safeParse({ ...valid, website: 'x'.repeat(201) }).success).toBe(false);
  });
});
