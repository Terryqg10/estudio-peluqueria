---
id: ADR-0014
title: Tabla stylist_services para limitar qué servicios hace cada estilista
status: aceptada
date: 2026-10-20
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, T-004]
---

# ADR-0014 — Tabla stylist_services para limitar qué servicios hace cada estilista

## Contexto

En T-002 quedó pendiente (DECISIÓN PENDIENTE) la tabla `stylist_services` del
plan: sin ella, toda estilista podría hacer todo servicio. La disponibilidad
(T-004) debe ofrecer solo huecos con estilistas que realmente hacen ese
servicio, y la interfaz de reserva (T-005) debe poder filtrar estilistas por servicio.

## Alternativas consideradas

1. **Sin tabla (toda estilista hace todo)** — más simple, pero ofrece huecos
   falsos (p. ej. una colorista para un peinado de evento) y no refleja un salón real.
2. **Tabla `stylist_services` (elegida)** — relación muchos a muchos explícita.
3. **Array de servicios en `stylists`** — evita una tabla, pero rompe la integridad
   referencial y complica RLS y consultas.

## Decisión

Se crea `public.stylist_services (stylist_id, service_id)` con clave primaria
compuesta y claves foráneas con `on delete cascade`.

- **RLS:** lectura pública (`anon` y `authenticated`), porque la interfaz debe
  mostrar qué estilistas hacen cada servicio; escritura solo para Admin con las
  cuatro políticas explícitas.
- **Disponibilidad:** `get_availability` solo considera estilistas con una fila
  para el servicio pedido (ADR-0013).
- **Semilla:** cada servicio lo hacen una o más estilistas, con solapes para que
  elegir estilista importe (datos ficticios, VERIFICAR).
- **Admin (T-009/T-010):** gestionará esta relación junto con los servicios.

## Consecuencias

Positivas:
- Disponibilidad fiel a la realidad del salón y filtro por servicio en la UI.
- Integridad referencial y política RLS homogénea con el resto.

Negativas:
- Una tabla más y un paso más al dar de alta servicios o estilistas (el Admin
  debe asignarlos, o el servicio no tendrá huecos).
- Un servicio sin ninguna estilista asignada no se podrá reservar; la UI de
  Admin deberá avisarlo.

## Relación con la constitución

- I3 (RLS) y I9 (trazabilidad). No modifica `docs/constitution.md`.
