---
id: ADR-0033
title: Aviso por email a la invitada tras cancelar o cambiar su cita desde el enlace, sin token nuevo y sin afectar a la operación
status: aceptada
date: 2026-10-23
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0009, ADR-0017, ADR-0018, ADR-0019, T-006d, T-018]
---

# ADR-0033 — Aviso al cancelar o cambiar la cita

## Contexto

La invitada cancela (T-006b) o cambia (T-006c) su cita desde el enlace, pero solo ve el resultado en pantalla. La
confirmación de reserva (ADR-0018) ya se envía por el adaptador `EmailSender` (ADR-0017) y emite un token cada vez.

## Alternativas consideradas

1. **Reutilizar `sendBookingConfirmation`** — emite un token nuevo, que sustituye al hash anterior e invalida el
   enlace del primer correo. Se descarta.
2. **Aviso sin enlace personal ni token (elegida)** — el resumen basta; el enlace del correo de confirmación sigue
   valiendo.
3. **Enviar desde la BD (trigger o `pg_net`)** — la BD no habla con el proveedor de correo y cubriría también los
   cambios del Admin sin decidirlo antes (T-018). Se descarta.
4. **Sin aviso, solo pantalla** — la invitada no tiene constancia por escrito. Se descarta.

## Decisión

- `sendChangeNotice(appointmentId, 'cancelled' | 'rescheduled')` lee con la clave de servicio nombre, email, servicio,
  estilista y fecha de la cita y envía el aviso. No escribe en la BD y **no emite token**.
- Se llama **después de que la BD confirme** la operación, desde un parámetro opcional `onDone` de
  `cancelAppointment` y `rescheduleAppointment`; el id de la cita **no sale al cliente**.
- **Nunca afecta a la operación**: si el envío falla, no está configurado o lanza, la persona ve el mismo resultado y
  el fallo se registra con id y motivo, sin email, nombre ni enlace (como ADR-0018). Una operación rechazada (menos de
  24 h, hueco ocupado, sin cambio) no envía nada.
- Cancelada: resumen y enlace a `/reservar`. Cambiada: nuevo día, hora y estilista, y que el enlace sigue valiendo.
  Nombre y datos de la BD, escapados en el HTML.
- Fuera de alcance: cambios del Admin y cuentas de clienta (T-018, depende de T-017) y mostrar la fecha anterior.
- Enmienda de la spec: CA-42 y CA-43 (RF-05 y RF-11) y sección 9.

## Consecuencias

Positivas:
- La invitada tiene constancia escrita sin perder el enlace anterior.
- Reutiliza el adaptador, sin migración ni columna nueva.

Negativas:
- Hasta 5 s más de espera en la acción si el proveedor tarda (tope del adaptador, igual que la confirmación).
- Sin marca de envío: no se puede reenviar ni saber si llegó (a diferencia de `confirmation_email_sent_at`).
- Con un fallo de envío la persona no se entera de que no hay correo.

## Relación con la constitución

I5 (entradas validadas antes de actuar), I9 (CA con tests unitarios y e2e con Mailpit).
