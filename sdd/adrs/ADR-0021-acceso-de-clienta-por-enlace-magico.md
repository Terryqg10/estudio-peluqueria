---
id: ADR-0021
title: Acceso de la clienta con cuenta — enlace mágico de Supabase Auth con SMTP propio y límite de envíos
status: aceptada
date: 2026-10-22
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0009, ADR-0017, ADR-0020, T-007]
---

# ADR-0021 — Acceso de la clienta por enlace mágico

## Contexto

RF-04 permite reservar como invitada o con cuenta y pide que el acceso sea **sin contraseña**; la clienta con
cuenta solo ve sus citas (CA-12). El plan (sección 4) dejó el método a un «ADR-A» sin escribir: token propio
para la invitada (ya hecho, ADR-0009) y, como alternativa, Supabase Auth con enlace OTP para la cuenta. T-007
necesita ese acceso. El proyecto Supabase local limita Auth a 2 emails por hora y no tiene SMTP propio; Auth
guarda el email en `auth.users` y la RLS de `appointments` ya filtra por `auth.uid()` (T-002).

## Alternativas consideradas

1. **Email + contraseña** — lo más conocido, pero contradice RF-04 (sin contraseña) y añade recuperación,
   política de claves y más superficie de ataque. Se descarta.
2. **Código OTP de 6 dígitos tecleado** — sin clic en enlace, útil si el correo se abre en otro dispositivo;
   más fricción al teclear y más UI. Se descarta como flujo principal.
3. **Enlace propio generado en servidor** (`admin.generateLink` + `EmailSender`, ADR-0017) — una sola ruta de
   plantillas y control del texto; a cambio, más código sensible con `service_role` y caducidad y un solo uso
   a cargo del proyecto. Se descarta.
4. **Enlace mágico de Supabase Auth (`signInWithOtp`) con SMTP propio (elegida)** — Supabase genera, caduca y
   verifica el token; el proyecto solo configura el envío y valida la entrada.
5. **Canjeo del enlace con un clic en página propia** (añadida al implementar): el enlace del email abre
   `/acceso/confirmar?token_hash=…`, que solo muestra un botón; la sesión se abre al pulsarlo (POST). Un
   antivirus o previsualizador que haga GET no gasta el enlace de un solo uso. Coste: un clic más.

## Decisión

- **Acceso por enlace mágico** de Supabase Auth, sin contraseña. La interfaz no ofrece contraseña; el
  primer enlace crea la cuenta (`enable_signup` por email sigue activo). VERIFICAR en T-007 si Auth permite
  desactivar el inicio de sesión con contraseña en el servidor y, si sí, hacerlo.
- **Envío por SMTP propio**: Mailpit en local y Resend en producción (mismo proveedor que ADR-0017), configurado
  en `supabase/config.toml` y en el proyecto Supabase. Sin SMTP propio, Auth limita los envíos de forma que no
  sirve en producción (VERIFICAR el tope vigente antes de publicar). La plantilla vive en la config de Supabase,
  no en el `EmailSender`.
- **Respuesta idéntica** exista o no el email: la acción de servidor nunca revela si hay cuenta. Los errores
  de Auth se registran y se muestran como el mismo mensaje genérico («Si el email es válido, te hemos enviado
  un enlace»). Se valida el email con Zod antes de llamar a Auth.
- **Límite propio de envíos del enlace**: **3 por email y 10 por IP, por hora** (valores provisionales, VERIFICAR
  con el salón), en la acción de servidor, con el mismo mecanismo que ADR-0020: IP en HMAC con sal
  (`RATE_LIMIT_SALT`), `rate_limits` con caducidad en horas y bloqueo por IP apagado fuera de producción salvo
  `RATE_LIMIT_IP_ENFORCE=1`. Al superarlo se responde con el mismo mensaje genérico **sin enviar** y se registra.
  El cupo global de Auth queda como segunda barrera.
- **Intervalo mínimo de Auth entre correos a una dirección** (`auth.email.max_frequency`): si Auth lo
  aplica (`over_email_send_rate_limit`), la respuesta es la misma de éxito. Un error distinto delataría que a
  ese email se le envió uno hace poco. En producción el intervalo es de **60 s** (VERIFICAR en el proyecto).
- **Caducidad y un solo uso** del enlace los fija Supabase (`otp_expiry`); se acorta a **15 minutos**
  (`otp_expiry = 900`). Un enlace caducado o usado lleva a `/acceso` con un mensaje claro.
- **Sesión por cookie de servidor** (`@supabase/ssr`), solo `httpOnly`; ninguna clave de servicio llega al
  cliente. `/mis-citas` lee con el cliente de la propia usuaria y la RLS, nunca con `service_role`.
- **El rol Admin no se toca**: el acceso del Admin (T-008) es otra decisión. `profiles.role` sigue sin poder
  cambiarse desde el cliente.
- **Las citas de invitada no se vinculan por email**: «mis citas» solo muestra las que tienen `user_id` de la
  usuaria (CA-12 sin ambigüedad). Vincularlas exigiría verificar el email y su propio ADR.

## Consecuencias

- Positivas: sin contraseñas que guardar; la verificación del token queda en Supabase; reutiliza Resend y el
  mecanismo de límites de ADR-0020; la RLS existente es la que protege los datos.
- Negativas: dependencia de la entrega del email (si no llega, no hay acceso); la plantilla del email queda
  fuera del `EmailSender`; un tercero puede agotar el cupo de envíos de un email ajeno (mismo riesgo que
  ADR-0020); se crean cuentas para cualquier email que lo pida, aunque no tengan citas (cuentas vacías, sin
  datos más que el email).
- Hasta que exista «reservar con cuenta», ninguna cita se crea con `user_id`: «mis citas» solo tendrá datos de
  semilla y de tests.
- **Coste de revertir: medio.** Cambiar a otro método toca `/acceso`, la ruta de retorno y la config de Auth;
  las cuentas ya creadas siguen válidas (identidad = email en `auth.users`). Pasar a contraseña añadiría
  recuperación y política de claves.

## Relación con la constitución

- I3 (RLS de `appointments` ya definida y con prueba de aislamiento `aislamiento-clientas`), I4 (SMTP y sal solo
  en el entorno del servidor, nada en el repo), I5 (Zod en el límite del email), I6 (formulario de acceso con
  etiqueta, foco visible y mensajes accesibles), I9 (T-007 con CA-12 y comprobaciones documentadas). No
  modifica `docs/constitution.md`.
