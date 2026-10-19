---
id: ADR-0016
title: Antiabuso de la reserva pública con honeypot ahora y límites de citas en una tarea aparte
status: aceptada
date: 2026-10-21
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, ADR-0015, T-005b]
---

# ADR-0016 — Antiabuso de la reserva pública con honeypot ahora y límites de citas en una tarea aparte

## Contexto

La reserva como invitada es pública y sin contraseña (RF-04). RF-10 pide un campo trampa
(honeypot) y límites de citas activas por email y por IP (CA-28 y CA-29). Los límites por IP
exigen infraestructura propia (tabla de contadores, IP en hash con caducidad, ventana) y
afectan a la privacidad; el honeypot es barato y se puede cerrar en T-005b sin mezclar capas.

## Alternativas consideradas

1. **CAPTCHA externo** — eficaz, pero añade un proveedor, datos de terceros y fricción, y
   está fuera del alcance de la spec (sin dependencias externas por ahora).
2. **Honeypot + límites juntos en T-005b** — más completo, pero la tarea deja de ser atómica.
3. **Honeypot en T-005b y límites en una tarea posterior (elegida)** — cierra CA-28 ya y
   deja CA-29 con diseño decidido.

## Decisión

**Ahora (T-005b, CA-28):**
- Un campo `website` fuera de la vista y de la accesibilidad: dentro de un contenedor con
  `aria-hidden="true"`, `tabIndex={-1}`, `autoComplete="off"` y estilo `sr-only` (no
  `display: none`, que muchos bots detectan).
- Si llega relleno, la acción de servidor **responde con el mismo error genérico** que un
  fallo ordinario («No hemos podido completar la reserva»), **sin llamar a la BD** y sin
  mensaje que delate el motivo. No se registra la dirección del visitante.
- El honeypot es una capa más: la defensa de fondo son la validación Zod, la validación de la
  función de BD y la restricción anti-solape.

**Después (tarea T-005c, CA-29) — diseño ya decidido:**
- Tabla `rate_limits` con clave en hash (`sha256` de email normalizado o de IP más una sal de
  servidor), ventana y contador, accesible solo con `service_role`.
- Límite de citas **activas** por email y por IP (valor inicial 3, VERIFICAR) y limitación de
  intentos por ventana. La IP se obtiene en la acción de servidor y nunca se guarda en claro.
- Caducidad automática de los contadores (horas). Se actualiza la sección 9 de la spec.

## Consecuencias

Positivas:
- CA-28 se cierra ya con coste casi nulo y sin dependencias ni datos de terceros.
- Los límites se diseñan con calma, con su propio análisis de privacidad.

Negativas:
- Hasta T-005c no hay límite de citas por persona: un bot que rellene bien el formulario
  puede crear muchas citas. **No publicar la reserva sin T-005c.**
- Un honeypot no frena a un atacante que lo conozca; es defensa contra bots genéricos.

## Relación con la constitución

- I5 (validación en el límite), I9 (CA-28 con test), y la sección 9 de la spec (la IP solo
  como hash) cuando llegue T-005c. No modifica `docs/constitution.md`.
