---
id: ADR-0029
title: Horarios semanales del salón y de las estilistas con una función de BD atómica que rechaza si dejan citas fuera
status: aceptada
date: 2026-10-22
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0013, ADR-0022, ADR-0024, ADR-0028, T-009c]
---

# ADR-0029 — Horarios semanales

## Contexto

RF-07 incluye la «gestión de horarios de cada estilista». `salon_hours` y `stylist_schedule` ya existen (varios
tramos por día y estilista) y `availability_core` ofrece huecos dentro de la **intersección** de ambos. Falta editarlos
sin tocar la BD y sin dejar citas futuras fuera de horario. RF-07 no tenía criterio de aceptación para esto.

## Alternativas consideradas

1. **`insert`/`delete` directos con la RLS del Admin** — no comprueba citas ni toma el bloqueo por estilista. Se descarta.
2. **Función atómica que reemplaza la semana completa de un ámbito y rechaza con `CONFLICT` (elegida)** — coherente con
   ADR-0028 y con la spec (sección 5).
3. **Guardar y avisar de las citas que quedan fuera** — deja citas sin resolver y es incoherente con bloqueos. Se descarta.
4. **Editar día a día** — más llamadas y estados intermedios; un formulario por semana es más simple y atómico.

## Decisión

- `admin_save_weekly_hours(estilista | null, tramos jsonb)`: `null` es el horario del **salón**; un id, el de esa
  estilista. Reemplaza **todos** los tramos de ese ámbito (un día sin tramos es día libre). Exige `is_admin()`,
  valida (1–7 de lunes a domingo, `inicio < fin`, rejilla de 15 min, sin solapes dentro del día, ≤ 70 tramos),
  toma los advisory locks por estilista en orden de id (ADR-0024) y, tras escribir, comprueba las citas.
- **Citas fuera de horario:** una cita `confirmed` o `pending` futura está fuera si no cabe entera en algún tramo
  de la intersección salón ∩ estilista de su día de la semana (hora de Madrid). Si hay alguna, lanza `CONFLICT` y se
  deshace todo. La lógica vive en `schedule_conflicts` (interna), que también usa `admin_schedule_conflicts`, la
  función que la aplicación llama para **listar** las citas afectadas con enlace a «Mover cita».
- Para el horario del salón se comprueban las citas de **todas** las estilistas; para una estilista, solo las suyas.
- Errores: `FORBIDDEN`, `INVALID_INPUT`, `CONFLICT`.
- Se añaden por enmienda de la spec **CA-38** (la disponibilidad usa el nuevo horario) y **CA-39** (se rechaza si
  deja citas fuera y se listan).

## Consecuencias

- Un cambio de horario con citas fuera exige resolverlas antes, pero no deja citas huérfanas.
- Un día con horario de salón pero sin tramos de estilista es día libre para ella (como ya hacía la disponibilidad).
- Sin aviso a la clienta cuando se mueve su cita (T-018). Sin excepciones de un día (para eso están los bloqueos).
- La página pública de contacto muestra el horario desde `SITE`, no desde `salon_hours`: pueden diferir (anotado).
