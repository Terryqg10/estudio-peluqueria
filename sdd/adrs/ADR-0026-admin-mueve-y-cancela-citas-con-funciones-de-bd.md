---
id: ADR-0026
title: El Admin mueve y cancela citas con funciones de BD que reutilizan el cálculo de disponibilidad
status: aceptada
date: 2026-10-22
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0019, ADR-0022, ADR-0024, T-008c]
---

# ADR-0026 — El Admin mueve y cancela citas

## Contexto

RF-06 y CA-16: el Admin modifica (estilista, día, hora) o cancela una cita y el cambio se refleja en la
agenda y en la disponibilidad pública. RF-05: la ventana de 24 h solo limita a la clienta («después, solo el
Admin»). La RLS ya permite al Admin actualizar `appointments` (ADR-0022), pero un `update` directo se saltaría
el cálculo de disponibilidad y el bloqueo por estilista (ADR-0024).

## Alternativas consideradas

1. **`update` directo desde el cliente del Admin** — sin reglas de horario ni bloqueo por estilista; la
   restricción anti-solape sería la única barrera. Se descarta.
2. **Funciones de BD `security definer` que comprueban `is_admin()` (elegida)** — atómicas, reutilizan
   `availability_core` y el bloqueo por estilista, y se prueban en integración.
3. **Server Action con `service_role`** — el panel nunca usa esa clave (ADR-0022). Se descarta.
4. **Permitir cualquier hora sin solape** — flexible, pero contradice la disponibilidad pública y T-009
   (vacaciones y bloqueos). Se descarta; las excepciones fuera de horario podrían venir con otro ADR.

## Decisión

- `admin_reschedule_appointment(cita, estilista, inicio)` y `admin_cancel_appointment(cita)`:
  `security definer`, `set search_path = ''`, ejecutables solo por `authenticated`; lo primero que hacen es
  exigir `is_admin()` y, si no, lanzar `FORBIDDEN`.
- `admin_appointment_availability(cita, día)` devuelve los huecos de esa cita ignorándola a ella (mismo
  motivo que `get_guest_reschedule_availability`), también solo para el Admin.
- Mover: solo citas `confirmed` o `pending`; mismo servicio y duración; el hueco debe estar ofrecido por
  `availability_core` (horario, bloqueos, sin solape) **sin** la ventana de 24 h de la clienta. La ventana de 2 h a 60 días
  forma parte de `availability_core` y **sí** se aplica (no se duplica el cálculo): el Admin no puede mover
  una cita al pasado ni a más de 60 días; bloqueo por estilista en orden de id (ADR-0024); `exclusion_violation` → `SLOT_TAKEN`. El token de
  la clienta sigue valiendo y su caducidad pasa al nuevo inicio, como en ADR-0019. Errores: `FORBIDDEN`,
  `NOT_FOUND`, `INVALID_STATE`, `INVALID_INPUT`, `INVALID_SELECTION`, `NO_CHANGE`, `SLOT_TAKEN`.
- Cancelar: `confirmed` o `pending` → `cancelled` (spec, sección 7); cancelar una ya cancelada es
  `INVALID_STATE`. El trigger de disponibilidad (ADR-0013) avisa de la franja liberada.
- Las acciones de servidor del panel llaman a `requireAdmin()` y validan con Zod antes de la función.

## Consecuencias

- **Sin aviso a la clienta** (no existe aviso de cambios, T-006d, y exigiría enmienda de la spec): si el Admin
  mueve o cancela una cita, la clienta no se entera salvo que la contacten. Se anota como tarea nueva.
- Sin registro de quién cambió qué (fuera de alcance, como en T-008a); `updated_at` se actualiza.
- Marcar `completada` o `no_asistio` no entra aquí.
- Si cambia el cálculo de disponibilidad, solo hay que tocar `availability_core`.
