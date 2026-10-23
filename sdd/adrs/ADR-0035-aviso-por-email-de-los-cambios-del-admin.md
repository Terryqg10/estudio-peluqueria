---
id: ADR-0035
title: Aviso por email a la clienta cuando el Admin mueve o cancela su cita, sin afectar a la operación y con el resultado visible en el panel
status: aceptada
date: 2026-10-23
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0017, ADR-0026, ADR-0033, ADR-0034, T-018]
---

# ADR-0035 — Aviso de los cambios del Admin

## Contexto

Cuando el Admin mueve o cancela una cita (ADR-0026) la clienta no recibía nada, y la pantalla de cancelar decía «avísala
tú». T-006d (ADR-0033) ya avisa cuando es la invitada quien cambia su cita. Desde T-021 (ADR-0034) las citas de cuenta
guardan una copia de nombre, email y teléfono, así que el mismo envío sirve para invitadas y cuentas.

## Alternativas consideradas

1. **Enviar desde la función de BD del Admin** — la BD no habla con el proveedor de correo y mezclaría la operación con
   un efecto externo. Se descarta (como en ADR-0033).
2. **Aviso silencioso** (sin decir al Admin si salió) — si el correo falla, la clienta no se entera y el Admin cree que
   sí. Se descarta.
3. **Reutilizar `sendChangeNotice` con origen «salón» y mostrar el resultado en el panel (elegida).**

## Decisión

- `sendChangeNotice` y la plantilla ganan un **origen** (`client` por defecto, `salon`) y, en los cambios del salón, la
  **fecha anterior**. Con origen `salon` el texto dice que ha sido el salón, enlaza a `/contacto` y, si se cancela, a
  `/reservar`. No emite token y no escribe en la BD.
- `moveAppointment` y `cancelAppointmentAsAdmin` avisan **solo después** de que la función de BD confirme, y devuelven
  `notified: boolean`. La fecha anterior se lee antes de mover, con la sesión del Admin (si falla, el aviso sale sin
  ella). Un fallo de envío, una cita sin email (citas de cuenta anteriores a T-021) o el email sin configurar **no**
  deshacen la operación: solo ponen `notified` en falso y se registran con id y motivo, sin datos personales.
- La agenda añade al aviso de resultado «Hemos avisado a la clienta por email.» o «No hemos podido avisarla por email:
  contacta con ella.», mediante `&avisada=1|0` en la URL (sin datos personales). Guardar solo la nota no avisa.
- El texto de la pantalla de cancelar pasa de «avísala tú» a «Le enviaremos un email con el aviso».
- Los avisos ya existentes de «Cita movida.» y «Cita cancelada.» cambian de texto exacto; los tests que los comprobaban
  se actualizan a la frase nueva (el texto de interfaz no es un CA de la spec).
- Enmienda de la spec: CA-46 y CA-47 (RF-07 y RF-11) y sección 9.

## Consecuencias

Positivas:
- La clienta se entera de los cambios del salón y el Admin sabe si se pudo avisar.
- Sin migración ni columna nueva.

Negativas:
- Hasta 5 s más en la acción del Admin si el proveedor tarda (tope del adaptador).
- Sin marca de envío: no se puede reenviar ni consultar después.
- Las citas de cuenta anteriores a T-021 no tienen email: el Admin recibe el aviso de «contacta con ella».

## Relación con la constitución

I5 (entradas validadas con Zod antes de actuar), I9 (CA con tests unitarios y e2e con Mailpit).
