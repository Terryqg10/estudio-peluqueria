// Cookie de corta duración que enlaza la acción de reservar con la página de confirmación sin poner
// identificadores ni datos personales en la URL. httpOnly: el navegador no la expone a scripts.
export const CONFIRMATION_COOKIE = 'reserva_confirmada';

// `secure` depende del protocolo REAL de la petición, no de NODE_ENV: WebKit rechaza las cookies
// `Secure` sobre http://localhost, mientras que en producción (HTTPS) deben llevarla.
// `x-forwarded-proto` lo pone el proxy (p. ej. Vercel).
export function confirmationCookieOptions(forwardedProto: string | null) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/reservar',
    maxAge: 60 * 10, // 10 minutos
    secure: forwardedProto?.split(',')[0]?.trim() === 'https',
  } as const;
}
