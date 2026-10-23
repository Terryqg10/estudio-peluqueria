---
id: ADR-0034
title: Reservar con cuenta guardando user_id y una copia de contacto, con la identidad tomada de la sesión
status: aceptada
date: 2026-10-23
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0009, ADR-0015, ADR-0020, ADR-0021, ADR-0030, ADR-0033, T-017, T-021]
---

# ADR-0034 — Reservar con cuenta

## Contexto

RF-04 dice «invitada o con cuenta», pero ninguna pantalla creaba citas con `user_id`: `create_booking` solo guardaba
datos de invitada. Por eso T-017 (contacto de las clientas con cuenta en el panel) y T-018 no tenían casos reales.
El email de la cuenta vive en `auth.users`, que el Admin no puede leer con la clave anónima (ADR-0022).

## Alternativas consideradas

1. **Cita de cuenta solo con `user_id`** — el Admin necesitaría una función que lea `auth.users` y nombre y teléfono
   del perfil; la confirmación, los avisos (ADR-0033), el límite por email y el enlace de gestión tendrían que
   tratar dos orígenes de contacto. Más piezas y más superficie.
2. **`user_id` más una copia de nombre, email y teléfono en la cita (elegida)** — la cita de cuenta es una cita de
   invitada con dueño. Todo lo que ya funciona para invitadas funciona sin cambios.
3. **Mantener la reserva solo como invitada y enmendar RF-04** — descartada por el usuario.

## Decisión

- `create_booking` gana `p_user_id uuid default null` (solo `service_role`, como antes). Si viene, valida que la
  cuenta existe y guarda `user_id` además de la copia de contacto. Mismos límites, bloqueos y disponibilidad.
- **La identidad sale de la sesión**: `getBookingAccount()` lee la cookie en el servidor; con sesión de clienta, el
  servidor fuerza el email de la cuenta (ignora el del formulario) y pasa `user_id`. Nada de `userId` llega nunca de
  la entrada del navegador. Sin sesión, o con sesión de **Admin** (no mezcla su cuenta de gestión con citas de
  clienta), se reserva como invitada. Si la lectura de la sesión falla, se reserva como invitada.
- Tras reservar, si el perfil no tiene nombre o teléfono, se guardan los de la reserva (nunca se pisan los
  existentes). La siguiente reserva viene precargada.
- `/reservar` con sesión: nombre y teléfono precargados, email de la cuenta en solo lectura y una nota.
- Privacidad: la copia de contacto es un dato personal más de la cita; el borrado (`delete_account_data`) y la
  retención (`anonymize_expired_data`) ya la ponen a nulo por `user_id`. El borrado de invitada por email
  (ADR-0032) no toca estas citas (solo las de `user_id` nulo).
- **T-017 queda absorbida**: el Admin ve nombre, teléfono y email de las citas de cuenta con la RLS actual.
- Enmienda de la spec: CA-44 y CA-45 (RF-04, RF-10) y sección 9.

## Consecuencias

Positivas:
- RF-04 queda completo sin tocar `auth.users` ni la RLS del Admin.
- Confirmación, avisos, enlace de gestión, límites y borrado funcionan sin cambios.

Negativas:
- El contacto se duplica en cada cita (copia por reserva, como las invitadas); si la clienta cambia de nombre o
  teléfono en su perfil, las citas antiguas conservan el valor con el que se reservaron.
- Las citas de cuenta anteriores a esta tarea (solo existen en tests) no tienen copia de contacto.
- Un email de cuenta que coincide con el de una invitada anterior se sigue tratando como personas distintas (T-007),
  aunque el límite por email cuenta ambas.

## Relación con la constitución

I3 (función solo para `service_role`; la identidad no viene del cliente), I5 (entradas con Zod), I9 (CA con tests
de integración, unitarios y e2e).
