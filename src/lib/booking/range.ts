// PostgREST devuelve un `tstzrange` como texto: ["2026-11-02 09:00:00+00","2026-11-02 10:00:00+00")
export type TimeRange = { start: string; end: string };

const RANGE_RE = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/;

function toIso(value: string): string | null {
  // «2026-11-02 09:00:00+00» no es ISO para JS: se separa fecha y hora y se completa el huso.
  const normalized = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function parseRange(value: unknown): TimeRange | null {
  if (typeof value !== 'string') return null;
  const match = RANGE_RE.exec(value.trim());
  if (!match || !match[1] || !match[2]) return null;
  const start = toIso(match[1]);
  const end = toIso(match[2]);
  return start && end ? { start, end } : null;
}
