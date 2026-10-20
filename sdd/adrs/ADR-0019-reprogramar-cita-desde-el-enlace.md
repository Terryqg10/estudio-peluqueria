---
id: ADR-0019
title: Reprogramar la cita desde el enlace con una función de BD que conserva cita y token
status: aceptada
date: 2026-10-22
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0009, ADR-0013, ADR-0015, ADR-0018, T-006c]
---

# ADR-0019 — Reprogramar la cita desde el enlace

## Contexto

RF-05 permite a la clienta cambiar su cita (día, hora o estilista) hasta 24 h antes. La spec
(sección 7) define la transición `confirmada → confirmada` si faltan ≥ 24 h y el nuevo hueco está
libre. Hay que decidir cómo se mueve la cita, qué pasa con el token, qué ventana vale para el
nuevo hueco y cómo se calcula la disponibilidad sin que la cita choque consigo misma.

## Alternativas consideradas

1. **Cancelar y crear otra cita** — reutiliza `create_booking`, pero deja un instante sin cita, el
   token apunta a la cita vieja y se pierde la traza. Se descarta.
2. **Actualizar la misma cita en una función de BD (elegida).** Atómica; conserva `id` y token.
3. **Token nuevo al cambiar** — invalida el enlace anterior, pero sin aviso por email (T-006d) la
   clienta se quedaría sin acceso. Se descarta.
4. **Añadir `p_exclude_appointment` a `get_availability`** — es invocable por `anon`: pasar un id de
   cita a mano permitiría sondear citas ajenas. Se descarta.

## Decisión

- **`reschedule_guest_appointment(token, estilista, inicio)`**, `security definer`, para `anon` y
  `authenticated`. Mismo patrón que `cancel_guest_appointment`: token validado y fila bloqueada;
  `INVALID_TOKEN` genérico; `TOO_LATE` solo tras validar el token y sobre la cita **original**.
  Errores: `INVALID_INPUT`, `INVALID_SELECTION`, `OUT_OF_WINDOW`, `NO_CHANGE`, `SLOT_TAKEN`.
- **El servicio no cambia**; la duración es la de la cita.
- **Ventana del nuevo hueco: la de reservar** (de 2 h a 60 días). Consecuencia aceptada: se puede
  mover a un hueco a menos de 24 h, desde el cual ya no se podrá cancelar ni cambiar sola.
- **Mismo token**: `appointment_tokens.expires_at` pasa al nuevo inicio (ADR-0009: caduca al inicio
  de la cita), sin emitir otro.
- **`availability_core(servicio, día, estilista, cita_excluida)`** contiene el cálculo y solo lo
  ejecutan `service_role` y otras funciones `security definer`. `get_availability` mantiene firma,
  permisos y resultado y delega en él con `null`.
- **`get_guest_reschedule_availability(token, día)`**, para `anon`, ofrece los huecos de la cita del
  token ignorándola a ella: se puede mover a un hueco que solape con el actual.
- La restricción de exclusión sigue siendo la árbitra de la carrera (CA-09): `exclusion_violation`
  se traduce a `SLOT_TAKEN`.
- El trigger de disponibilidad (ADR-0013) ya avisa de la franja antigua y de la nueva al actualizar.

## Consecuencias

- Un enlace da la capacidad de mover la cita (igual que ya daba la de cancelarla, ADR-0009).
- Sin T-006d no se avisa por email del cambio.
- Si un cambio de `get_availability` se olvida en el núcleo, ambas rutas divergen: por eso solo hay
  una copia del cálculo.
- No hay límite de cambios por cita (se valorará con T-005c).
