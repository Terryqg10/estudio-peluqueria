---
id: ADR-0018
title: Envío de la confirmación tras reservar y enlace de cita /cita/<token>
status: aceptada
date: 2026-10-21
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0009, ADR-0015, ADR-0017, T-006a]
---

# ADR-0018 — Envío de la confirmación tras reservar y enlace de cita /cita/<token>

## Contexto

T-005b crea la cita pero la invitada no recibe nada ni puede volver a ella. ADR-0009 definió un
token de 256 bits guardado como hash y ADR-0015 dejó su emisión para el momento del envío. Hay que
decidir el orden de las operaciones, qué pasa si el envío falla, cómo se construye el enlace sin
abrir un vector de suplantación y qué muestra la página del enlace.

## Alternativas consideradas

1. **Construir el enlace con la cabecera `Host` de la petición** — sin configuración, pero un
   atacante puede falsear `Host` y hacer que el email lleve un enlace a su dominio (envenenamiento
   de enlaces). Se descarta.
2. **Enviar el email en segundo plano (`after`) y no informar del fallo** — la reserva responde
   antes, pero la persona no sabría que no ha recibido nada.
3. **Enviar de forma síncrona, con tiempo máximo, y dejar constancia del resultado (elegida).**

## Decisión

- **Orden** (en la acción de servidor, tras `create_booking`): emitir el token con
  `issue_management_token` → construir el enlace → enviar → marcar `confirmation_email_sent_at`.
  El token en claro solo existe en memoria durante esos pasos: **no se guarda ni se registra**.
- **Si algo falla, la cita se mantiene** (spec, sección 5). Se registra solo el identificador de la
  cita y el tipo de fallo (sin email, nombre ni token). La marca queda nula y la página de
  confirmación muestra un aviso para contactar con el salón. Reenviar (o regenerar el token) es
  una acción de Admin posterior.
- **Enlace:** `{APP_URL}/cita/<token>`, con `APP_URL` configurado y validado (ADR-0017), **nunca** la
  cabecera `Host`.
- **Página `/cita/[token]`** (T-006a, solo lectura):
  - El token se valida por forma (43 caracteres base64url) antes de consultar; la consulta usa la
    función pública `get_guest_appointment` con la clave anónima.
  - **Un único mensaje «enlace no válido o caducado»** para forma incorrecta, token desconocido,
    manipulado o caducado: no revela si la cita existe (ADR-0009).
  - Respuesta con `Cache-Control: no-store`, `noindex` y `Referrer-Policy: no-referrer`, para que el
    token de la URL no se filtre a terceros por la cabecera `Referer` ni se indexe.
  - Muestra servicio, estilista, día, hora y estado; **sin datos personales** (ni nombre, ni email,
    ni teléfono). Cancelar y cambiar llegan con T-006b.
- **Columna `appointments.confirmation_email_sent_at`** (nula = no enviado). Solo la escribe
  `service_role`; las clientas no pueden modificarla (ya no tienen `UPDATE` sobre `appointments`).

## Consecuencias

Positivas:
- El enlace no se puede falsear desde la petición; el token no queda en logs ni en la BD en claro.
- Un fallo de correo no pierde la reserva y se ve en la pantalla de confirmación.
- Los mensajes de error no permiten enumerar citas.

Negativas:
- El envío síncrono añade hasta 5 s a la reserva en el peor caso.
- Una variable más (`APP_URL`) que debe ser correcta en producción: un valor erróneo produce enlaces
  rotos, y sin ella en producción no se envía.
- Sin reintentos: si falla, la invitada no recibe el enlace hasta que alguien lo reenvíe.
- Quien tenga el enlace tiene acceso a la cita (es el modelo sin contraseña elegido en ADR-0009).

## Relación con la constitución

- I3/I4/I5/I9 como en ADR-0009 y ADR-0015; privacidad: ni logs ni URL con datos personales.
- No modifica `docs/constitution.md`.
