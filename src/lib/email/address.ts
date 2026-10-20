export type Address = { name?: string; email: string };

const EMAIL_RE = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/;

// Acepta «correo@dominio.com» o «Nombre <correo@dominio.com>». Devuelve null si no es válido.
export function parseAddress(value: string): Address | null {
  const trimmed = value.trim();
  const match = /^(.*)<([^<>]+)>$/.exec(trimmed);
  if (match) {
    const email = (match[2] ?? '').trim();
    const name = (match[1] ?? '').trim().replace(/^"|"$/g, '');
    if (!EMAIL_RE.test(email)) return null;
    return name ? { name, email } : { email };
  }
  return EMAIL_RE.test(trimmed) ? { email: trimmed } : null;
}
