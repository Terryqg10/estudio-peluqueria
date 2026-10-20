---
id: ADR-0020
title: Límites de reserva — citas activas por email y reservas por ventana e IP, aplicados en la BD
status: aceptada
date: 2026-10-22
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0015, ADR-0016, T-005c]
---

# ADR-0020 — Límites de reserva por email e IP

## Contexto

RF-10 y CA-29 piden limitar las citas activas por email y por IP en la reserva de invitada, que es
pública y sin contraseña. ADR-0016 dejó el diseño esbozado (tabla `rate_limits`, IP en hash con sal y
caducidad en horas). Hay tres decisiones: cómo se limita por IP sin guardar datos personales de más,
dónde se aplica el límite para que no haya carreras y qué hacer cuando no se conoce la IP.

## Alternativas consideradas

1. **IP también por citas activas** — literal con la spec, pero obliga a guardar el hash de la IP
   mientras la cita siga activa (semanas), contra la sección 9 («solo hash y TTL corto, horas»).
2. **Solo email** — no cubre al bot que cambia de email; RF-10 pide también IP.
3. **Email por citas activas e IP por reservas creadas por ventana (elegida).**
4. **Aplicar el límite en la acción de servidor (TypeScript)** — más fácil de depurar, pero dos
   peticiones simultáneas pueden pasar ambas la comprobación. Se descarta.
5. **Aplicarlo dentro de `create_booking` (elegida).**

## Decisión

- **Email: citas activas.** «Activa» = `pending` o `confirmed` y aún no terminada. Se cuentan en
  `appointments` por email normalizado; cancelar una libera cupo (CA-29 literal). Máximo inicial: **3**.
- **IP: reservas creadas por ventana.** Se cuentan filas de `rate_limits` con ese hash en los últimos
  **60 minutos**; máximo inicial: **10**. Cancelar **no** libera cupo de IP; se libera al pasar la ventana.
  Es una enmienda a RF-10 y CA-29 (spec, sección 12). Solo una reserva **creada** consume cupo.
- **Dentro de `create_booking`**, misma transacción, con `pg_advisory_xact_lock` por IP y por email (siempre
  en ese orden): sin bloqueo, dos peticiones simultáneas pasarían ambas la comprobación. Errores nuevos:
  `LIMIT_IP` y `LIMIT_EMAIL`. Los valores viajan como parámetros (por defecto, los mismos) desde un único
  módulo de la app (`src/lib/booking/limits.ts`).
- **La IP nunca se guarda en claro**: la acción de servidor calcula HMAC-SHA256 con una sal secreta
  (`RATE_LIMIT_SALT`, solo servidor, obligatoria en producción) y pasa solo el hash. Los registros de más de
  dos ventanas se borran al escribir (sin tarea programada hasta T-013).
- **Fuera de producción el límite por IP está apagado** (la acción pasa `null`), salvo
  `RATE_LIMIT_IP_ENFORCE=1`: todos los e2e reservan desde la misma IP y la agotarían. El límite por email
  siempre está activo. «Producción» se decide como en el email (`VERCEL_ENV=production` o `EMAIL_STRICT=1`).
- **En producción sin IP identificable** (cabecera ausente o inválida) se usa **un cubo común** («desconocida»):
  no se deja pasar sin límite ni se puede esquivar mandando basura. **Sin sal en producción se falla cerrado**
  (`UNAVAILABLE`), sin reservar.
- **`rate_limits`**: RLS activada sin políticas; `anon` y `authenticated` sin acceso; solo `service_role` y las
  funciones `security definer`.
- El honeypot sigue antes de la BD y no consume cupo (ADR-0016).

## Consecuencias

- Quien tenga un email puede ser bloqueado por un tercero que reserve 3 citas con él (modelo de invitada sin
  verificación de email). Mitigación futura: verificar el email antes de confirmar. Se anota como riesgo.
- El mensaje de límite por email revela que ese email tiene 3 citas activas a quien lo teclea.
- Los alias de email (`a+1@…`, puntos de Gmail) esquivan el límite por email; el de IP lo acota.
- Muchas personas detrás de una misma IP (wifi del salón, CGNAT) comparten el cupo de IP: por eso 10 por hora.
- Los valores 3, 10 y 60 son provisionales (VERIFICAR con el salón).
- Si la plataforma no entrega la IP real del visitante, el límite por IP degrada a un cubo común (VERIFICAR el
  alojamiento antes de publicar).
- Cambia la firma de `create_booking` (parámetros nuevos con valor por defecto): los llamadores anteriores
  siguen funcionando; los tests de T-005b se ajustaron para usar un email distinto por reserva.

## Relación con la constitución

- I3 (RLS en `rate_limits`, con prueba de aislamiento), I4 (la sal solo en el entorno del servidor), I5
  (Zod en el límite, hash y límites validados también en la BD), I9 (CA-29 con test). No modifica
  `docs/constitution.md`.
