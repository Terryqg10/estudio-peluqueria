---
id: ADR-0015
title: La reserva se crea con una función de BD transaccional ejecutable solo por service_role
status: aceptada
date: 2026-10-21
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, ADR-0009, ADR-0013, T-005b]
---

# ADR-0015 — La reserva se crea con una función de BD transaccional ejecutable solo por service_role

## Contexto

T-005b convierte la selección de hueco en una cita real (RF-02, RF-03, RF-04). Hay que
decidir cómo se inserta: la RLS (ADR-0009) no concede `INSERT` sobre `appointments` ni al
anónimo ni a la clienta, y el mismo hueco puede pedirse a la vez desde dos sesiones (CA-08).
También hay que decidir quién puede ejecutar la operación y qué errores devuelve.

## Alternativas consideradas

1. **`INSERT` directo desde la app con `service_role`** — simple, pero reparte reglas de
   negocio (ventana, estilista, servicio, solape) entre Node y SQL y es fácil dejar un hueco.
2. **Función `create_booking` ejecutable por `anon`** — cualquiera con la clave anónima (pública)
   podría llamarla directamente, saltándose el honeypot, la validación Zod y futuros límites
   por IP. Se descarta.
3. **Función `create_booking` `security definer`, ejecutable solo por `service_role`
   (elegida)** — toda la regla de negocio vive en una transacción de BD y la única puerta de
   entrada es la acción de servidor, donde se aplican Zod, honeypot y límites.

## Decisión

- `public.create_booking(p_service_id, p_stylist_id, p_starts_at, p_guest_name, p_guest_email,
  p_guest_phone, p_consent_version)` es `security definer`, `search_path = ''`, y **solo
  `service_role` puede ejecutarla** (`revoke` a `public`, `anon` y `authenticated`).
- **Valida dentro de la función** (defensa en profundidad, aunque la app ya valide con Zod):
  nombre, email y teléfono con formato razonable, `consent_version` no vacío, servicio y
  estilista activos, estilista que hace el servicio (ADR-0014), y ventana de reserva.
- **El hueco debe estar ofrecido por `get_availability`** para esa estilista y ese instante:
  una sola fuente de verdad para horarios, bloqueos, rejilla de 15 min y ventana (ADR-0013).
- **La restricción de exclusión es la árbitra** (CA-09): si dos peticiones pasan la
  comprobación a la vez, la segunda choca con `appointments_no_overlap` y se traduce a
  `SLOT_TAKEN`. Sin bloqueos explícitos ni reintentos.
- **Guarda** `status = 'confirmed'`, `user_id = null` (invitada), `consent_at = now()` y
  `consent_version`; el email se normaliza a minúsculas y sin espacios.
- **No emite el token de gestión.** Lo hace `issue_management_token` (ADR-0009) cuando se
  envía el email (T-006). Así no se genera un token en claro que nadie recibe.
- **Errores** (mensaje del `raise exception`, sin detalles internos): `INVALID_INPUT`,
  `INVALID_SELECTION` (servicio o estilista incorrectos), `OUT_OF_WINDOW`, `SLOT_TAKEN`.
- La acción de servidor traduce `SLOT_TAKEN` en una respuesta con **huecos alternativos** del
  mismo día (spec, sección 5) y el resto en un error genérico sin pistas.
- **Confirmación sin datos en la URL:** tras reservar, la acción de servidor deja una **cookie
  funcional de primera parte** `reserva_confirmada` con el id de la cita (no es un dato personal),
  `httpOnly`, `SameSite=Lax`, limitada a `/reservar` y de **10 minutos**. La página
  `/reservar/confirmada` la lee en servidor y muestra solo servicio, estilista y hora. `Secure`
  depende del protocolo real de la petición (`x-forwarded-proto`), no de `NODE_ENV`: WebKit
  rechaza las cookies `Secure` sobre `http://localhost` (se observó en los e2e del móvil).
- **Entorno:** la app necesita la clave de servicio solo en servidor
  (`SUPABASE_SERVICE_ROLE_KEY`, nunca `NEXT_PUBLIC_*`), validada con Zod y usada únicamente
  desde `src/lib/supabase/service-client.ts`.

## Consecuencias

Positivas:
- Una transacción, una fuente de verdad y la restricción de BD como garantía real contra la
  doble reserva.
- Los bots no pueden crear citas llamando a la API pública: deben pasar por la acción de servidor.
- Los errores son estables y testeables.

Negativas:
- Una variable de entorno de servidor más, con un secreto de alto poder: debe protegerse en
  Vercel y no aparecer en el cliente ni en el repositorio.
- Más lógica en SQL (menos cómoda de depurar).
- La comprobación previa contra `get_availability` más la inserción no son una única
  sentencia; la correctitud ante la carrera descansa en la restricción de exclusión (probada).

## Relación con la constitución

- I3 (RLS): no se abre `INSERT` a ningún rol de cliente.
- I4 (secretos fuera del repo): la clave de servicio solo existe en el entorno del servidor.
- I5 (validación con Zod en el límite) y I9 (trazabilidad: CA-08, CA-10, CA-25 con test).
- No modifica `docs/constitution.md`.
