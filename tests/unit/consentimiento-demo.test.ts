import { describe, expect, it } from 'vitest';
import { CONSENT_TEXT, CONSENT_VERSION } from '@/lib/booking/consent';

// T-030 (ADR-0038, CA-53): el aviso de demo y el enlace a la privacidad se añaden junto al consentimiento, pero el texto
// que se acepta y su versión (que se guarda con cada cita) no cambian.
describe('consentimiento de la reserva', () => {
  it('conserva su texto y su versión', () => {
    expect(CONSENT_VERSION).toBe('borrador-1');
    expect(CONSENT_TEXT).toBe('Acepto que el salón guarde mi nombre, email y teléfono para gestionar esta cita.');
  });
});
