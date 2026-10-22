---
id: ADR-0028
title: Bloqueos y vacaciones con una función de BD atómica que rechaza el bloqueo si hay citas activas
status: aceptada
date: 2026-10-22
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0013, ADR-0022, ADR-0024, ADR-0026, T-009b]
---

# ADR-0028 — Bloqueos y vacaciones

## Contexto

RF-07 y CA-19/CA-20: el Admin bloquea una franja o marca vacaciones y la disponibilidad pública lo respeta; si ya
hay citas en ese rango, «el sistema exige resolverlas antes» (spec, sección 5). `time_blocks` ya existe, la
disponibilidad (`availability_core`) ya lo excluye y un trigger avisa de los cambios (ADR-0013). Falta cómo se
crea sin dejar citas dentro del bloqueo ni carreras con reservas simultáneas.

## Alternativas consideradas

1. **`insert` directo en `time_blocks` con la RLS del Admin** — no comprueba citas ni toma el bloqueo por
   estilista: una reserva en curso podría colarse dentro del bloqueo. Se descarta.
2. **Función `security definer` atómica que rechaza con `CONFLICT` (elegida)** — toma el mismo advisory lock por
   estilista que la reserva (ADR-0024), comprueba las citas activas y solo entonces inserta.
3. **Mover o cancelar las citas automáticamente al bloquear** — destructivo y sin aviso a la clienta (T-018). Se
   descarta.
4. **Asistente que resuelve cada cita en la misma pantalla** — duplica T-008c/d. Se descarta por ahora.

## Decisión

- `admin_create_time_blocks(estilistas[], tipo, inicio, fin, nota)`: exige `is_admin()`; admite `vacation` y `block`
  (el valor `break` no se usa); valida (1–50 estilistas existentes, `inicio < fin`, fin futuro, duración ≤ 366
  días, nota ≤ 200); toma los advisory locks por estilista **en orden de id** (ADR-0024); si alguna cita
  `confirmed` o `pending` de esas estilistas solapa el rango lanza `CONFLICT` y **no inserta ninguna fila**; si no,
  inserta un bloqueo por estilista. Devuelve cuántos creó. Errores: `FORBIDDEN`, `INVALID_INPUT`, `CONFLICT`.
- **Todas las estilistas** (festivos, cierre): la aplicación envía las ids de todas las activas en una sola
  llamada; es todo o nada.
- La aplicación, ante `CONFLICT`, lista las citas afectadas con enlace a «Mover cita» (T-008d) para que el Admin
  las mueva o cancele y repita la operación. Las citas `completed`, `no_show` y `cancelled` no cuentan.
- **Vacaciones** son días completos en `Europe/Madrid` (de la medianoche del primer día a la del día siguiente al
  último); los **bloqueos de franja** son un día con hora de inicio y fin, con el cambio de hora resuelto.
- **Quitar** un bloqueo: `delete` directo con la RLS del Admin (restaura huecos; no hay riesgo de integridad).
- Un bloqueo no se edita: se quita y se crea otro.

## Consecuencias

- Crear un bloqueo con citas dentro exige resolverlas antes (más pasos, pero sin sorpresas).
- Sin aviso a la clienta cuando se mueve o cancela su cita (T-018).
- Sin bloqueos recurrentes (cada semana) ni edición; quedan fuera.
