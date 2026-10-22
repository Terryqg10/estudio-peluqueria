---
id: ADR-0027
title: Notas internas de la cita para la estilista, en una tabla aparte solo visible para el Admin
status: aceptada
date: 2026-10-22
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0009, ADR-0022, ADR-0026, T-008d]
---

# ADR-0027 — Notas internas de la cita

## Contexto

El usuario pide un campo «Notas para la estilista» en la pantalla de mover cita (T-008d). La tabla `appointments`
no tiene notas. Una clienta con cuenta lee **todas las columnas** de sus citas (`own_select_appointments`), así que
una columna `notes` en `appointments` sería visible para ella. Una nota interna («prefiere agua tibia», «llega
tarde casi siempre») no debe llegar a la clienta.

## Alternativas consideradas

1. **Columna `notes` en `appointments`** — simple, pero la clienta la leería; habría que restringir columnas con
   privilegios y tocar todas las consultas existentes. Se descarta.
2. **Tabla `appointment_notes` solo para el Admin (elegida)** — separación por diseño: sin política para clientas
   ni anónimos, la RLS lo garantiza sin cambiar nada de lo existente.
3. **Guardar la nota en el email o en un servicio externo** — innecesario y con más riesgo de privacidad.

## Decisión

- `public.appointment_notes (appointment_id uuid primary key references appointments on delete cascade, note text
  not null check (char_length(note) between 1 and 500), updated_at timestamptz)`.
- RLS activada; **solo políticas de Admin** (select, insert, update, delete con `is_admin()`); sin acceso para
  `anon`. Una clienta o invitada no la lee ni la escribe.
- Una nota vacía borra la fila. Texto libre de hasta 500 caracteres, validado con Zod en el servidor.
- Se borra con la cita (`on delete cascade`), así que sigue la retención y la anonimización de la cita.
- Las notas se leen y escriben con el cliente de la sesión del Admin y la RLS, nunca con `service_role`.

## Consecuencias

Positivas:
- La clienta nunca ve las notas, probado por integración.

Negativas:
- Es texto libre: puede contener datos personales. La sección 9 de la spec se enmienda para declararlo.
- Esta tarea solo muestra la nota en la pantalla de la cita; mostrarla en la agenda queda como mejora.
- No hay historial de cambios de la nota.
