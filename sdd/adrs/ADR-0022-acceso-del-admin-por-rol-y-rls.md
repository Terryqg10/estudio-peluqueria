---
id: ADR-0022
title: Acceso del Admin — mismo enlace mágico, rol en BD, protección en servidor y RLS, alta por script
status: aceptada
date: 2026-10-22
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0021, ADR-0009, T-008a]
---

# ADR-0022 — Acceso del Admin al panel

## Contexto

RF-06 y RF-07 piden un panel Admin con agenda completa y gestión del salón; CA-17 exige que una clienta o una
invitada no puedan abrir `/admin` ni llamar a sus endpoints, y que la RLS impida leer o escribir datos de
Admin. ADR-0021 resolvió el acceso de la clienta (enlace mágico de Supabase Auth, sesión por cookie de
servidor) y dejó fuera el del Admin. La BD ya tiene `profiles.role` (`client`/`admin`) que solo cambia
`service_role`, la función `is_admin()` y políticas `admin_*` en las tablas de gestión (T-002), con prueba
`acceso-admin` (parte de BD de CA-17).

## Alternativas consideradas

1. **Email + contraseña + MFA (TOTP)** — más fuerte para una cuenta con poder sobre todas las citas, pero
   añade alta de MFA, recuperación y política de claves, y rompe el modelo sin contraseña del resto del
   proyecto. Se descarta ahora; queda como mejora (ver consecuencias).
2. **Login aparte para el Admin (`/admin/acceso`)** — separa superficies, pero duplica el formulario, el
   cupo de envíos y la sesión. Se descarta.
3. **Mismo enlace mágico y sesión; el rol sale de la BD (elegida)** — una sola vía de entrada; el permiso no
   lo da la pantalla por la que se entra sino `profiles.role`.
4. **Lista de emails de Admin en una variable de entorno** — sin tocar la BD, pero dos fuentes de verdad y
   la RLS ya depende de `profiles.role`. Se descarta.

## Decisión

- **Entrada única** `/acceso` (ADR-0021). Tras confirmar el enlace, una cuenta con rol `admin` va a `/admin` y
  las demás a `/mis-citas`. Con sesión abierta, `/acceso` hace la misma redirección.
- **El rol es el de la BD, nunca el del cliente.** `profiles.role` solo lo cambia `service_role`
  (RLS de T-002: la clienta solo actualiza `full_name` y `phone`). No hay forma de hacerse Admin desde la web.
- **Protección en capas** de `/admin`:
  1. `proxy.ts` renueva la sesión también bajo `/admin` (no decide permisos).
  2. Un guardián de servidor (`requireAdmin`) en el `layout` de `/admin` y en **cada** acción de servidor del
     panel: sin sesión → redirige a `/acceso`; con sesión sin rol `admin` → **404** (`notFound()`), igual que
     una ruta que no existe, sin revelar que el panel existe.
  3. **La RLS es la barrera real**: el panel lee y escribe con el cliente de la propia sesión (clave anónima
     más cookie), nunca con `service_role`. Si el guardián fallara, la BD rechaza igualmente.
- **Alta del Admin por script**, no por la web: `pnpm admin:promote -- <email>` (Node, cross-platform, I8)
  pone `profiles.role = 'admin'` con `service_role`; `--revoke` lo quita. Requiere que la cuenta exista (haber
  entrado una vez con el enlace) y las variables `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en
  el entorno de quien lo ejecuta. Nada de claves en el repo (I4).
- Las páginas del panel llevan `noindex`, `Cache-Control: no-store` (dinámicas) y no se enlazan desde la
  navegación pública: se entra por `/acceso` o escribiendo la URL.
- **La sesión del Admin es la misma cookie** y caducidad que la de una clienta; sin tiempo de inactividad
  propio.

## Consecuencias

- Positivas: una sola vía de acceso y de sesión; el permiso depende de un dato que solo el servicio puede
  cambiar; defensa en profundidad (guardián + RLS) con prueba de integración existente y e2e nuevo.
- Negativas: **la seguridad de la cuenta Admin es la de su bandeja de correo** (sin segundo factor). Antes de
  usar el panel con un salón real se debería añadir MFA o restringir el acceso (VERIFICAR; se anotaría como
  tarea y ADR propios). Quien tenga el enlace del email de un Admin entra como Admin durante 15 minutos.
- El 404 para una clienta con sesión dificulta depurar permisos; se compensa con el test e2e que lo fija.
- Alta manual: el Admin debe haber entrado una vez antes de ser promovido.
- **Coste de revertir: medio.** Cambiar a contraseña y MFA toca `/acceso`, el guardián y el script; el rol en
  BD y las políticas RLS se conservan.

## Relación con la constitución

- I3 (RLS como barrera real y prueba de aislamiento `acceso-admin` + e2e), I4 (clave de servicio solo en el
  entorno de quien ejecuta el script; nunca en el repo ni en el cliente), I5 (Zod en el email del script y de
  las acciones), I8 (script Node, sin sh/bash), I9 (CA-17 con test). No modifica `docs/constitution.md`.
