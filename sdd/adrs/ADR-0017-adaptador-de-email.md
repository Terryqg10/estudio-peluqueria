---
id: ADR-0017
title: Email transaccional con un adaptador EmailSender sin dependencias (Mailpit en local, Resend en producción)
status: aceptada
date: 2026-10-21
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, ADR-0018, T-006a]
---

# ADR-0017 — Email transaccional con un adaptador EmailSender sin dependencias (Mailpit en local, Resend en producción)

(Corresponde al «ADR-C» del plan.)

## Contexto

RF-11 pide un adaptador de email intercambiable: bandeja local en desarrollo y un proveedor
real en producción, seleccionable solo con variables de entorno y sin claves en el repositorio
(CA-30). La spec nombra Resend o SendGrid. Supabase local incluye Mailpit (v1.30.2 en este
entorno), que expone una API HTTP de envío y de consulta.

## Alternativas consideradas

1. **`nodemailer` + SMTP a Mailpit y un SDK por proveedor** — conocido, pero añade
   dependencias (con su superficie de auditoría) para algo que cabe en una `fetch`.
2. **Adaptador propio con `fetch` y una interfaz mínima (elegida)** — cero dependencias nuevas;
   Mailpit y Resend se llaman por HTTP; añadir SendGrid u otro es una implementación más.
3. **Usar el correo de Supabase Auth** — está pensado para correos de autenticación, no
   transaccionales de reservas; descartado.

## Decisión

- Interfaz `EmailSender.send(message)` que **nunca lanza**: devuelve `{ ok: true }` o
  `{ ok: false, reason }` con `reason` ∈ `PROVIDER_ERROR`, `TIMEOUT`, `MISCONFIGURED`.
- Implementaciones en `src/lib/email/`:
  - **`mailpit`** (desarrollo): `POST {MAILPIT_URL}/api/v1/send`.
  - **`resend`** (producción): `POST https://api.resend.com/emails` con `Authorization: Bearer`.
    VERIFICAR el contrato vigente, el plan gratuito, sus términos y la verificación del dominio
    remitente antes de activarlo. Sin SDK.
- **Selección por entorno** (módulo solo de servidor, validado con Zod):
  `EMAIL_PROVIDER` (`mailpit` o `resend`), `EMAIL_FROM`, `APP_URL` y `RESEND_API_KEY`.
  - Fuera de producción, los valores por defecto permiten trabajar sin configurar nada
    (`mailpit`, `http://127.0.0.1:54324`, remitente de ejemplo, `http://localhost:3000`).
  - **En producción no hay valores por defecto**: si falta algo, el envío responde
    `MISCONFIGURED` y no se envía; nunca se cae a Mailpit, y `APP_URL` debe ser `https`.
    «Producción» es `VERCEL_ENV=production` o `EMAIL_STRICT=1` (otros alojamientos), **no**
    `NODE_ENV`: la build local de pruebas (`next build` + `next start`) también es
    `NODE_ENV=production` y debe poder usar Mailpit.
- **Tiempo máximo** de 5 s por envío (`AbortSignal.timeout`); un envío lento no bloquea la reserva.
- **Contenido:** texto y HTML con el servicio, la estilista, el día y la hora, y el enlace de
  gestión. Todo dato introducido por la persona (nombre) se **escapa** en el HTML. El token no va
  en el asunto.
- **Topes de coste:** Resend se usará en su plan gratuito (VERIFICAR el límite). Antes de activarlo
  en producción se declara el tope en `docs/costs.md` y se configura en el proveedor (rules/security).
- **SendGrid** u otro proveedor: una implementación más de la misma interfaz, cuando haga falta.

## Consecuencias

Positivas:
- Sin dependencias nuevas ni claves en el repositorio; el cambio de proveedor es una variable.
- Un fallo del proveedor no puede romper la reserva (la interfaz no lanza).
- Fácil de probar: Mailpit expone una API para leer los correos en los e2e.

Negativas:
- Un cliente HTTP por proveedor que mantener y que verificar contra su documentación vigente.
- Sin reintentos ni cola: un fallo se registra y se resuelve a mano (reenvío desde Admin, T-006b o posterior).
- Resend no se puede probar de verdad sin clave: se verifica la forma de la petición con tests y
  queda pendiente una prueba real al activarlo.

## Relación con la constitución

- I4 (secretos fuera del repo): `RESEND_API_KEY` solo en el entorno del servidor.
- I5 (validación con Zod) y I9 (CA-30 con test). Costes: `docs/costs.md` antes de activar un proveedor.
- No modifica `docs/constitution.md`.
