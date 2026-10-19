// Honeypot (ADR-0016, CA-28): el campo `website` está fuera de la vista y de la accesibilidad.
// Si llega con contenido, la petición la ha rellenado un programa. Se mira sobre la entrada cruda,
// antes de validar, para no dar respuestas distintas que delaten el campo.
export function isHoneypotTriggered(input: unknown): boolean {
  if (typeof input !== 'object' || input === null) return false;
  const value = (input as { website?: unknown }).website;
  return typeof value === 'string' && value.trim() !== '';
}
