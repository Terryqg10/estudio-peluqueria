---
id: ADR-0013
title: Disponibilidad calculada en la base de datos y actualizada en tiempo real con Realtime y sondeo de respaldo
status: aceptada
date: 2026-10-20
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, T-004]
---

# ADR-0013 — Disponibilidad calculada en la base de datos y actualizada en tiempo real con Realtime y sondeo de respaldo

(Corresponde al «ADR-B» del plan.)

## Contexto

RF-02 exige huecos libres en los que cabe la duración del servicio, con
disponibilidad en tiempo real, y CA-07 exige que otra sesión deje de ver un
hueco ocupado sin recargar en un máximo de N segundos. Hay que decidir dónde se
calcula la disponibilidad y cómo se propagan los cambios, teniendo en cuenta que
la RLS (ADR-0009) impide al anónimo leer `appointments`, `time_blocks` y los
horarios de las estilistas.

## Alternativas consideradas

1. **Calcular en el cliente o en Node con las citas leídas** — exigiría abrir
   lectura de datos de citas al público (rompe ADR-0009) o usar `service_role`
   en cada petición. Se descarta.
2. **Función de BD `security definer` que devuelve solo franjas (elegida para el
   cálculo)** — el cálculo vive junto a los datos, usa la misma restricción
   anti-solape y no expone ninguna cita ni persona.
3. **Postgres Changes de Realtime sobre `appointments`** — requeriría permiso de
   lectura para el anónimo y expondría datos. Se descarta.
4. **Realtime *broadcast* emitido por un trigger de BD (elegida para el tiempo
   real)** — el canal solo transporta «ha cambiado la disponibilidad de la
   estilista X», sin datos personales; los clientes vuelven a consultar la función.
5. **Solo sondeo periódico** — robusto y simple, pero con más latencia y más
   carga si el intervalo es corto. Se usa como respaldo, no como mecanismo principal.

## Decisión

- **Cálculo:** función `public.get_availability(p_service_id, p_date, p_stylist_id)`
  (`security definer`, `stable`, `search_path = ''`), ejecutable por `anon` y
  `authenticated`. Devuelve solo `(stylist_id, starts_at)`.
  - Intersecta `stylist_schedule` y `salon_hours` del día de la semana, en
    `Europe/Madrid`, y genera inicios cada **15 minutos** donde cabe la duración
    del servicio.
  - Descarta los inicios que se solapan con citas activas (`status <> 'cancelled'`)
    o con `time_blocks` de esa estilista.
  - Solo ofrece estilistas activas que hacen el servicio (`stylist_services`, ADR-0014)
    y servicios activos.
  - **Ventana de reserva:** desde `now() + 2 horas` hasta `now() + 60 días`
    (VERIFICAR con el salón; valores de la spec).
- **Tiempo real:** un trigger `AFTER INSERT OR UPDATE OR DELETE` sobre `appointments`
  y `time_blocks` emite por Realtime *broadcast* (`realtime.send`) un mensaje al
  tema público `availability` con `{stylist_id, starts_at, ends_at}` y la
  operación. **Sin nombre, email, teléfono ni id de cita.**
- **Cliente (T-005):** se suscribe al canal `availability`; al recibir un mensaje
  de la estilista y el día en pantalla, vuelve a llamar a `get_availability`.
- **Respaldo por sondeo:** si el canal no está en estado `SUBSCRIBED`, la
  interfaz sondea `get_availability` cada **15 segundos**; con el canal activo,
  una consulta de verificación cada **60 segundos**. **N (CA-07) = 15 s** como
  máximo de latencia aceptada en el peor caso.
- **Sin garantía de entrega:** el *broadcast* puede perder un mensaje (se observó en
  los tests que el primero emitido justo tras `SUBSCRIBED` se pierde). Por eso, al
  suscribirse y al reconectar, la interfaz **vuelve a consultar** `get_availability`
  y no asume que ha recibido todos los avisos.
- La fuente de verdad sigue siendo la restricción de exclusión de la BD (CA-09):
  si un hueco mostrado ya no está libre, la reserva falla con `SLOT_TAKEN`.

## Consecuencias

Positivas:
- No se expone ninguna cita al anónimo; el canal no transporta datos personales.
- El cálculo y la restricción viven en el mismo sitio y se prueban con la BD real.
- Funciona aunque Realtime falle (sondeo).

Negativas:
- Lógica de negocio en SQL (menos cómoda de depurar y de cambiar que en TypeScript).
- Un canal público sin autenticación: cualquiera puede escucharlo, aunque solo ve
  que «algo cambió» en una estilista. Aceptable porque no hay datos personales; si
  más adelante se quiere restringir, se pasa a canal privado con RLS en `realtime.messages`.
- Más consultas a la BD al refrescar; mitigable con el intervalo de 60 s y, si
  hace falta, con *debounce* en el cliente.

## Relación con la constitución

- I3 (RLS antes de consumir datos): se mantiene el aislamiento de ADR-0009.
- I9 (trazabilidad): CA-06 y CA-07 con test.
- No modifica `docs/constitution.md`.
