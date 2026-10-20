---
id: ADR-0024
title: Serializar reservas y reprogramaciones por estilista con un advisory lock (evita el deadlock de la restricción de exclusión)
status: aceptada
date: 2026-10-21
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0015, ADR-0019, ADR-0020, T-015]
supersedes_in_part: ADR-0015
---

# ADR-0024 — Serializar por estilista con un advisory lock

> **Sustituye solo un punto de ADR-0015**: «la restricción de exclusión es la árbitra… sin bloqueos explícitos
> ni reintentos». ADR-0015 está aceptado y no se edita; el resto de sus decisiones sigue vigente.

## Contexto

ADR-0015 hizo de la restricción `appointments_no_overlap` la árbitra de la carrera (CA-08, CA-09): si dos
peticiones pasan la comprobación de disponibilidad a la vez, la segunda choca con la restricción y se traduce
a `SLOT_TAKEN`. ADR-0019 repitió el patrón en la reprogramación. La medición hecha en T-014/T-015 (Supabase
local, 12 rondas de 6 peticiones simultáneas al mismo hueco) lo desmiente: en 3 de 12 rondas, una petición gana y
**las otras 5 reciben `40P01 deadlock detected`** tras 3–5 s, no `SLOT_TAKEN`. Con tres o más transacciones que
insertan filas en conflicto con una restricción de exclusión y se esperan entre sí, PostgreSQL puede resolverlo
como interbloqueo. Las dos funciones solo capturan `exclusion_violation`. No se pierde ni se duplica ninguna cita,
pero la clienta ve un error genérico, sin huecos alternativos, tras esperar varios segundos.

## Alternativas consideradas

1. **Capturar `deadlock_detected` y devolver `SLOT_TAKEN`** — cambio mínimo, pero el deadlock sigue ocurriendo:
   PostgreSQL tarda ≥ 1 s en detectarlo (`deadlock_timeout`; medido 3–5 s) y aborta transacciones. Convierte
   un fallo de concurrencia real en una respuesta engañosa. Se descarta.
2. **Reintentar la transacción en la acción de servidor** — mueve el problema a Node, mantiene la espera y
   puede multiplicar las llamadas. Se descarta.
3. **`lock table appointments`** — correcto pero serializa todas las reservas del salón y bloquea lecturas
   relacionadas. Desproporcionado. Se descarta.
4. **`pg_advisory_xact_lock` por estilista (elegida)** — las peticiones sobre la misma estilista entran de una en
   una; las demás esperan milisegundos, ven el hueco ocupado en la comprobación de disponibilidad y devuelven
   `SLOT_TAKEN` con normalidad. Estilistas distintas no se bloquean entre sí.
5. **Bloqueo por estilista y día** — menos contención, más complejidad (un hueco que cruza medianoche, cambios de
   hora). A escala de un salón la contención no existe: no compensa.
6. **Ambas: bloqueo y captura de `deadlock_detected`** — la captura sería una vía que, de activarse, esconde un
   fallo de concurrencia en vez de mostrarlo. Se descarta; un deadlock inesperado debe verse.

## Decisión

- **`create_booking`** toma `pg_advisory_xact_lock(hashtextextended('booking-stylist:' || p_stylist_id, 0))`
  **después** de las comprobaciones baratas (entrada, selección de estilista y servicio, ventana) y **antes** de
  comprobar la disponibilidad con `get_availability` y de insertar. Orden de bloqueos: **IP → email → estilista**
  (los dos primeros ya existen, ADR-0020).
- **`reschedule_guest_appointment`** toma el bloqueo de la **estilista nueva** y, si la cita cambia de estilista,
  también el de la **antigua**, **siempre por orden de id** (así dos cambios que se cruzan, X de A a B e Y de B a A,
  no pueden esperarse en círculo). Se toma **después** de validar el token y las comprobaciones previas
  (`TOO_LATE`, selección, ventana, `NO_CHANGE`) y antes de comprobar disponibilidad y mover. Orden: **fila de la
  cita (`for update`) → estilistas por id**. No se toma antes de validar el token: la función es ejecutable por
  `anon` y, si lo fuera, cualquiera con tokens inválidos podría mantener bloqueada a una estilista.
- El bloqueo es **de transacción** (`_xact_`): se libera solo al confirmar o fallar, en todos los caminos.
- **No hay ciclo de bloqueos:** `create_booking` nunca bloquea la fila de una cita existente; la cancelación solo
  bloquea esa fila; dos reprogramaciones de la misma cita se serializan por la fila.
- **La restricción de exclusión se mantiene** como barrera última (CA-09) y `exclusion_violation` se sigue
  traduciendo a `SLOT_TAKEN`. Solo cambia que ya no es la única defensa de la carrera.
- **No se captura `deadlock_detected`:** si volviera a aparecer, debe fallar de forma visible.
- Cualquier función futura que cree o mueva citas (p. ej. el panel Admin, T-008c) **debe tomar el mismo bloqueo
  en el mismo orden**. Se anota en T-008c.

## Consecuencias

- Positivas: `SLOT_TAKEN` con alternativas en milisegundos en lugar de un deadlock de varios segundos; CA-08
  pasa a cumplirse de forma fiable; la integración deja de fallar al azar por este motivo.
- Negativas: las reservas de **la misma estilista** se serializan durante unos milisegundos. Es una ventaja a
  escala de un salón (decenas de reservas al día) y sería un cuello de botella solo con una carga muy distinta.
- La disciplina del orden de bloqueos pasa a ser parte del contrato de cualquier función que escriba citas;
  un orden distinto reintroduciría deadlocks. Se prueba con carreras mixtas (reservar + reprogramar + cancelar).
- Los advisory locks son por base de datos y se identifican por un hash: una colisión de hash solo causaría una
  espera innecesaria, no un error.
- **Coste de revertir: bajo.** Es una línea por función; revertir devuelve el comportamiento anterior.

## Relación con la constitución

- I3 (la RLS y los permisos de las funciones no cambian: `create or replace` conserva los `grant`), I9 (CA-08 con
  una batería de carrera que antes falla y después pasa). No modifica `docs/constitution.md`.
