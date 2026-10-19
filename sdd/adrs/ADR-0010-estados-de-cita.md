---
id: ADR-0010
title: Estados de cita como enum en inglés en la base de datos
status: aceptada
date: 2026-10-19
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, T-002]
---

# ADR-0010 — Estados de cita como enum en inglés en la base de datos

(Corresponde al «ADR-E» del plan.)

## Contexto

La spec (sección 7) define los estados `confirmada`, `completada`, `cancelada`
y `no_asistio`, y deja `pendiente` como estado transitorio no persistido (a
verificar en el plan). Para T-002 hay que fijar el enum de la BD y qué estados
ocupan hueco.

## Alternativas consideradas

1. **Estados en español en la BD** (los de la spec) — coherente con la spec,
   pero mezcla idiomas con el código y los tipos generados.
2. **Estados en inglés en la BD, etiqueta en español en la interfaz
   (elegida)** — convención habitual; la traducción vive en un único mapa en
   la UI.
3. **Sin `pending`** — fiel a la spec, pero impide una futura aprobación
   manual sin migrar el enum.

## Decisión

Tipo `appointment_status` con cinco valores:

| Valor BD | Etiqueta UI | Ocupa hueco |
|---|---|---|
| `pending` | pendiente | Sí |
| `confirmed` | confirmada | Sí |
| `completed` | completada | Sí |
| `no_show` | no asistió | Sí |
| `cancelled` | cancelada | No |

- La reserva **nace en `confirmed`** (confirmación automática, como en la
  spec). `pending` existe en el enum y ocupa hueco, pero **ningún flujo actual
  lo usa**; se reserva para una futura aprobación manual.
- La restricción anti-solape (CA-09) es una exclusión sobre
  `(stylist_id, tstzrange)` para las filas con estado distinto de `cancelled`.
- Transiciones permitidas (se aplican en T-005/T-006/T-008, no en esta
  tarea):

| Desde | Hacia | Quién |
|---|---|---|
| (nueva) | `confirmed` | Invitada, Clienta |
| `confirmed` | `cancelled` | Clienta (≥ 24 h), invitada con token (≥ 24 h), Admin |
| `confirmed` | `completed`, `no_show` | Admin, pasada la hora de inicio |
| `pending` | `confirmed`, `cancelled` | Admin (sin uso actual) |

- Las filas con `pending`, `completed` y `no_show` no se pueden volver a
  `confirmed` ni reabrir: cualquier otra transición se rechaza.

## Consecuencias

Positivas:
- Tipos generados coherentes con el código.
- Se puede añadir aprobación manual sin migrar el enum.

Negativas:
- Una pequeña desviación de la spec (nombres en inglés y estado `pending`
  persistido pero sin uso). Se anota como enmienda en la sección 12 de la spec.
- Un estado sin uso es deuda conceptual; si nunca se usa, conviene retirarlo.

## Relación con la constitución

- I9 (trazabilidad): la enmienda a la spec y este ADR dejan la decisión
  registrada.
- No modifica `docs/constitution.md`.
