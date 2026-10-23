---
id: ADR-0030
title: Borrado a petición y retención a 24 meses por anonimización de las citas con funciones de BD
status: aceptada
date: 2026-10-23
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0009, ADR-0015, ADR-0021, ADR-0020, T-012]
---

# ADR-0030 — Borrado y retención por anonimización

## Contexto

RF-09 exige borrado de datos a petición (CA-26) y anonimización automática a los 24 meses de la última cita (CA-27,
plazo VERIFICAR). Los datos personales viven en `appointments` (`guest_name`, `guest_email`, `guest_phone`,
`consent_at`, `consent_version`), en `profiles` (`full_name`, `phone`), en Supabase Auth (email), en
`appointment_tokens` (hash del token) y en `appointment_notes` (nota interna del Admin, texto libre).

Obstáculos del esquema: `appointments_has_owner` exige una cuenta o los tres datos de invitada, y
`appointments.user_id` es `on delete set null`: borrar una cuenta con citas **fallaría** la restricción.

## Alternativas consideradas

1. **Borrar las filas de `appointments`** — pierde el histórico del salón, libera huecos pasados y no resuelve la
   cuenta. Se descarta.
2. **Sustituir los datos por texto fijo («Anonimizada»)** — mezcla datos reales con marcadores, rompe los formatos
   (email, teléfono) y no se distingue de un dato legítimo. Se descarta.
3. **Columna `anonymized_at` y restricción que exige datos nulos si está informada (elegida)** — la garantía vive en
   la BD y la interfaz distingue «anonimizada» de «con cuenta».
4. **`pg_cron` dentro de Supabase** — depende de la extensión y del plan, no verificados. Se descarta por ahora.

## Decisión

- `appointments.anonymized_at timestamptz`. `appointments_has_owner` pasa a aceptar `anonymized_at is not null`, y una
  restricción nueva obliga a que una cita anonimizada no tenga `user_id`, nombre, email, teléfono ni consentimiento.
- Persona = `user_id` (cuenta) o, para invitadas, `lower(guest_email)`. Las citas de invitada **no se vinculan** a
  cuentas (T-007), así que borrar una cuenta no toca las citas de invitada del mismo email.
- Anonimizar una cita: pone a `null` los datos personales y el consentimiento (se borra con el dato asociado, spec
  sección 9), borra su token y su nota interna, y fija `anonymized_at`. Las citas **activas y futuras se cancelan**
  para liberar el hueco: una cita sin datos de contacto no se puede atender. Las pasadas conservan su estado.
- Funciones `security definer` con `search_path` vacío:
  - `anonymize_person` (interna, sin permisos para nadie): hace el trabajo.
  - `delete_account_data(user_id)`: solo `service_role`. Anonimiza las citas y limpia `profiles`; después la
    aplicación elimina el usuario de Auth. Si eso falla, repetir es inocuo (idempotente).
  - `delete_guest_data(token)`: `anon`/`authenticated`. Valida el token igual que `cancel_guest_appointment` y
    anonimiza **todas** las citas de ese email. El token deja de valer.
  - `anonymize_expired_data(meses = 24)`: solo `service_role`. Anonimiza a la persona cuya **última** cita empezó
    hace más de N meses (una cita reciente o futura protege todo su histórico), limpia el perfil de esas cuentas
    (la cuenta de Auth se conserva: «hasta que la clienta lo pida») y purga `rate_limits` de más de 24 h.
    Toma el bloqueo `booking-email:` de `create_booking` para no pisar una reserva simultánea.
- La retención se invoca con `pnpm run retention` (Node, cross-platform). Programarla en GitHub Actions se hace en
  T-013 (necesita proyecto alojado y secretos).
- Sin límite de peticiones propio en el borrado: la acción exige un secreto de 256 bits (enlace) o una sesión, no
  revela si algo existe y repetirla es inocua.

## Consecuencias

Positivas:
- El histórico agregado del salón se conserva sin identificar a nadie.
- La garantía «anonimizada = sin datos» la impone la BD, no la interfaz.
- Todo es testeable con la BD real.

Negativas:
- Borrar es **irreversible**; la confirmación es explícita en la interfaz.
- El enlace de invitada caduca al inicio de la cita: después de ella, una invitada no puede pedir el borrado desde el
  enlace y depende de la retención o de contactar con el salón (limitación conocida; se anota como tarea).
- Hasta T-013 la retención se ejecuta a mano.
- Un mismo email usado como invitada y como cuenta se trata como dos personas.

## Relación con la constitución

I3 (RLS y permisos explícitos: funciones solo para quien corresponde), I5 (entradas validadas con Zod en el límite),
I8 (script en Node), I9 (CA con test de integración).
