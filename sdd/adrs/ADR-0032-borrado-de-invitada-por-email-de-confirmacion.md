---
id: ADR-0032
title: Borrado de datos de la invitada sin el enlace de su cita, con email de confirmación de un solo uso
status: aceptada
date: 2026-10-23
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0009, ADR-0017, ADR-0020, ADR-0021, ADR-0030, T-020]
---

# ADR-0032 — Borrado de la invitada por email de confirmación

## Contexto

ADR-0030 permite borrar desde el enlace de la cita, pero este caduca al inicio de la cita (ADR-0009): después, o si
la invitada perdió el email, no hay autoservicio. Decisión del usuario (2026-10-23): formulario con su email y
enlace de confirmación.

## Alternativas consideradas

1. **Ampliar la vida del enlace de la cita solo para borrar** — simple, pero no ayuda a quien perdió el email y
   modifica ADR-0009. Descartada por el usuario.
2. **Solo desde el Admin por contacto** — sin autoservicio y con carga manual. Descartada por el usuario.
3. **Formulario + enlace de un solo uso por email (elegida)** — prueba la posesión del email sin cuentas.

## Decisión

- Tabla `deletion_requests` con solo hashes (SHA-256 del token y del email en minúsculas) y caducidad de **1 hora**.
  No se guarda el email en claro. RLS activada, sin políticas.
- `request_guest_deletion(email)` (solo `service_role`) emite el token si hay citas de invitada sin anonimizar
  de ese email; si no, devuelve `null`. Una solicitud nueva sustituye a la anterior.
- `confirm_guest_deletion(token)` (`anon`) valida con el mismo error para forma, desconocido, caducado o usado;
  consume el token y anonimiza con `anonymize_person` (ADR-0030).
- **Sin enumeración**: la respuesta del formulario es idéntica exista o no el email, esté agotado el cupo o falle el
  envío; solo se envía correo si hay citas y cupo. Los fallos se registran sin datos personales.
- **Cupo** de solicitudes por email (3) y por IP (10) por hora, con HMAC y sal de servidor como en ADR-0020 y
  ADR-0021 (valores VERIFICAR con el salón). La retención purga también las solicitudes caducadas.
- **Confirmación con POST**: el enlace abre una página con un botón; un escáner de correo que haga GET no borra nada.
- El enlace se construye desde `APP_URL`, nunca desde `Host`; la página es `noindex`, `no-store` y `no-referrer`.
- Enmienda de la spec: CA-40 y CA-41 (RF-09 y RF-10) y sección 9.

## Consecuencias

Positivas:
- Cualquier invitada puede ejercer el borrado aunque haya perdido el email o la cita ya haya pasado.
- No se añaden datos personales: solo hashes y por una hora.

Negativas:
- Quien ya no controle el email no puede usar esta vía (queda la retención a 24 meses o contactar con el salón).
- Un correo más que enviar por el proveedor (coste y entregabilidad).
- Dos hashes del mismo email en `rate_limits` y `deletion_requests` permiten, en teoría, correlacionar con fuerza
  bruta si se conoce la sal; por eso el HMAC lleva sal secreta y las filas duran horas.

## Relación con la constitución

I3 (funciones con permisos explícitos), I5 (entradas con Zod), I9 (CA con test de integración y e2e).
