---
id: ADR-0009
title: Reserva de invitada con token de gestión con hash y acceso por funciones security definer
status: aceptada
date: 2026-10-19
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, T-002]
---

# ADR-0009 — Reserva de invitada con token de gestión con hash y acceso por funciones security definer

(Corresponde al «ADR-A» del plan.)

## Contexto

RF-04 permite reservar como invitada, sin cuenta ni contraseña, y gestionar la
cita con un enlace. La invitada no tiene `auth.uid()`, así que la RLS no puede
identificarla. Hay que decidir cómo se guarda el token y cómo accede a su cita
sin abrir datos de otras personas.

La petición original proponía `guest_management_token UUID DEFAULT
gen_random_uuid() UNIQUE` en `appointments`, accedido mediante una política RLS
que valida el token. La spec aprobada (sección 8) y el plan exigen un token de
≥ 256 bits guardado solo como hash.

## Alternativas consideradas

1. **UUID en claro en `appointments` + política RLS con el token** — simple,
   pero un UUID v4 tiene unos 122 bits aleatorios; quien lea la tabla (una
   fuga, un backup, un log) obtiene acceso a todas las citas; y una política
   RLS no recibe el token salvo por cabecera o configuración de sesión, lo que
   la hace frágil. Se descarta.
2. **Supabase Auth con enlace OTP por email** — reutiliza el sistema de
   Supabase, pero crea una cuenta implícita por cada invitada y entra en
   conflicto con «reservar sin cuenta». Se descarta para este caso.
3. **Token aleatorio de 256 bits, solo hash en BD, acceso por funciones
   `security definer` (elegida)** — la tabla solo contiene hashes inútiles por
   sí solos y la superficie pública es mínima y auditable.

## Decisión

- **Token:** 32 bytes aleatorios (256 bits) generados en el servidor
  (`gen_random_bytes(32)`, extensión `pgcrypto`), codificados en base64url. Se
  entrega a la invitada **una sola vez** (en el enlace del email). En la BD
  solo se guarda `sha256(token)`.
- **Tabla `appointment_tokens`:** `appointment_id`, `token_hash` (único),
  `expires_at`, `created_at`. Sin política de acceso para `anon` ni
  `authenticated`: solo la leen las funciones. Se borra con la cita
  (`on delete cascade`).
- **`appointments.user_id`** es opcional (`NULL` para invitada). No se guarda
  ningún token en `appointments`.
- **Acceso por funciones `security definer`** con `set search_path = ''`:
  - `issue_management_token(appointment_id)`: solo `service_role`; devuelve el
    token en claro una vez y guarda el hash.
  - `get_guest_appointment(token)` y `cancel_guest_appointment(token)`:
    ejecutables por `anon` y `authenticated`. Hashean la entrada y buscan por
    hash; si el token no existe, ha caducado, o la cita no está en un estado
    gestionable, devuelven el mismo error genérico (`INVALID_TOKEN`), sin
    distinguir casos.
  - `cancel_guest_appointment` aplica la regla de las 24 h (error `TOO_LATE`,
    que solo se emite tras validar el token) y la transición permitida
    (ADR-0010).
- **RLS de `appointments`:** `anon` no tiene ninguna política (denegado por
  defecto). Una clienta con cuenta lee solo las suyas (`user_id = auth.uid()`).
  El Admin lee y escribe todo mediante `public.is_admin()`. **No se concede
  `UPDATE` directo a clientas:** una política `UPDATE` no puede limitar qué
  columnas cambia ni las transiciones; sus cancelaciones y cambios irán por
  funciones (T-006/T-007). Esto difiere de la petición original
  («SELECT/UPDATE si `auth.uid() = user_id`»).
- **Caducidad del token:** `expires_at` = inicio de la cita (VERIFICAR si debe
  permitir consulta posterior).
- **Longitud:** ≥ 256 bits; la comparación es por igualdad de hash en un
  índice único, no por comparación del token en claro.

## Consecuencias

Positivas:
- Una fuga de la tabla no entrega enlaces válidos.
- La superficie pública son tres funciones pequeñas y testeables.
- Coherente con la spec y el plan; no requiere enmienda de la spec.

Negativas:
- Si la invitada pierde el email, no recupera el token (riesgo aceptado en la
  spec). Habrá que prever que el Admin pueda gestionar la cita.
- Más código que un UUID en claro; el token en claro viaja una vez por email y
  no puede reenviarse sin generar uno nuevo.
- Las funciones `security definer` deben auditarse con cuidado (`search_path`
  fijado, permisos revocados a `public`).

## Relación con la constitución

- I3 (RLS antes de consumir datos, con prueba de aislamiento).
- I4 (sin secretos en el repo): el token nunca se guarda en claro.
- I5 (inputs validados): el token se valida por forma antes de consultar.
