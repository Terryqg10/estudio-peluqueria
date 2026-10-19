import { describe, expect, it } from 'vitest';
import { isRelevantMessage, pollIntervalMs, POLL_FALLBACK_MS, POLL_VERIFY_MS } from '@/lib/booking/live';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

const message = (over: Record<string, unknown> = {}) => ({
  stylist_id: A,
  starts_at: '2026-11-02T09:00:00+00:00',
  ends_at: '2026-11-02T10:00:00+00:00',
  op: 'INSERT',
  id: 'id-del-mensaje-de-realtime',
  ...over,
});

describe('isRelevantMessage', () => {
  const context = { date: '2026-11-02', stylistIds: [A] };

  it('acepta un aviso de una estilista mostrada en el día visible', () => {
    expect(isRelevantMessage(message(), context)).toBe(true);
  });

  it('ignora a otra estilista o a otro día', () => {
    expect(isRelevantMessage(message({ stylist_id: B }), context)).toBe(false);
    expect(
      isRelevantMessage(
        message({ starts_at: '2026-11-03T09:00:00+00:00', ends_at: '2026-11-03T10:00:00+00:00' }),
        context,
      ),
    ).toBe(false);
  });

  it('un bloqueo de varios días afecta a los días intermedios', () => {
    const vacation = message({
      starts_at: '2026-11-01T08:00:00+00:00',
      ends_at: '2026-11-05T20:00:00+00:00',
    });
    expect(isRelevantMessage(vacation, context)).toBe(true);
    expect(isRelevantMessage(vacation, { ...context, date: '2026-11-06' })).toBe(false);
  });

  it('usa la fecha local: una franja que acaba a medianoche local no afecta al día siguiente', () => {
    // 22:30 UTC del 2 de noviembre ya es el 2 de noviembre 23:30 en Madrid (UTC+1).
    const late = message({
      starts_at: '2026-11-02T22:30:00+00:00',
      ends_at: '2026-11-02T22:45:00+00:00',
    });
    expect(isRelevantMessage(late, context)).toBe(true);
    expect(isRelevantMessage(late, { ...context, date: '2026-11-03' })).toBe(false);
  });

  it.each([
    ['mensaje vacío', null],
    ['sin campos', {}],
    ['estilista no uuid', message({ stylist_id: 'x' })],
    ['sin fechas', { stylist_id: A, op: 'INSERT' }],
    ['texto', 'hola'],
  ])('rechaza una entrada mal formada: %s', (_name, raw) => {
    expect(isRelevantMessage(raw, context)).toBe(false);
  });
});

describe('pollIntervalMs', () => {
  it('sondea cada 15 s sin canal y cada 60 s con el canal activo', () => {
    expect(pollIntervalMs(false)).toBe(POLL_FALLBACK_MS);
    expect(pollIntervalMs(true)).toBe(POLL_VERIFY_MS);
    expect(POLL_FALLBACK_MS).toBe(15_000);
    expect(POLL_VERIFY_MS).toBe(60_000);
  });
});
