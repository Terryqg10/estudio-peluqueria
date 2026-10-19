---
id: ADR-0008
title: Excepción con caducidad de pnpm audit para devDependencies de la plantilla
status: aceptada
date: 2026-10-19
os_version: 0.6.0
relates_to: [T-001, SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas]
---

# ADR-0008 — Excepción con caducidad de pnpm audit para devDependencies de la plantilla

## Contexto

Al cerrar T-001, `pnpm audit --audit-level=high` devuelve 10 vulnerabilidades
(5 moderate, 2 high, 3 critical). Todas están en **devDependencies que vienen
de la plantilla web-os**, no en dependencias de producción ni en código
escrito en este proyecto:

| Severidad | Paquete | Cadena | Versión corregida |
|---|---|---|---|
| critical | `vitest` <3.2.6 | `vitest@2.1.9` | ≥ 3.2.6 |
| critical | `tinypool` <2.1.2 | `vitest@2.1.9 > tinypool@1.1.1` | ≥ 2.1.2 |
| high | `vite` ≤6.4.2 | `@vitejs/plugin-react@4.7.0 > vite@5.4.21` | ≥ 6.4.3 |
| high | `braces` ≤3.0.3 | `eslint-config-next@16.4.2 > … > fast-glob > micromatch > braces@3.0.3` | no hay versión corregida publicada (VERIFICAR) |
| moderate | `esbuild`, `vite`, `vitest`, `@vitest/mocker` | idem | ver `pnpm audit` |

La puerta 5 de `rules/quality-gates.md` exige `pnpm audit --audit-level=high`
sin hallazgos "o con ADR y caducidad". Este es ese ADR.

## Alternativas consideradas

1. **Actualizar `vitest` y `vite` ahora** — elimina la mayor parte de los
   avisos, pero es un salto de versión mayor en herramientas de test dentro de
   una tarea de interfaz (T-001), con riesgo de romper la configuración de la
   plantilla. Además `braces` no tiene versión corregida, así que la puerta
   seguiría fallando. Se descarta por ahora.
2. **Aceptar el riesgo con caducidad (elegida)** — son herramientas de build y
   test que no se despliegan; el riesgo es acotado y la actualización se
   planifica como tarea propia.
3. **Quitar o ignorar `pnpm audit` en la puerta** — se descarta: deja de
   vigilar las dependencias de producción, que son las que importan.

## Decisión

Se acepta el riesgo de los hallazgos listados arriba, **solo** para las
devDependencies indicadas, con caducidad.

- **Alcance:** únicamente los paquetes de la tabla de contexto. Cualquier
  hallazgo nuevo, o cualquiera en `dependencies` (producción), no queda cubierto
  y bloquea el cierre como siempre.
- **Caducidad:** esta excepción expira al ejecutar la **tarea de mantenimiento
  post-MVP**, en la que se actualizan `vitest`, `vite` y las demás
  devDependencies afectadas. Fecha límite concreta: **DECISIÓN PENDIENTE**
  (se propone fijarla al crear esa tarea).
- **Revisión previa:** si se publica una versión corregida compatible antes de
  esa tarea, se actualiza sin esperar.

## Consecuencias

Positivas:
- Desbloquea el cierre de T-001 sin tocar dependencias dentro de una tarea de
  interfaz.
- El riesgo queda documentado y con fecha de revisión, no oculto.

Negativas:
- Hasta la caducidad, `pnpm audit` seguirá mostrando hallazgos altos y
  críticos en desarrollo.
- Se deja una deuda técnica: la tarea de mantenimiento debe crearse
  (`/new-task`) y no tiene número todavía.
- **La CI bloqueante (T-013) deberá reflejar esta excepción** (por ejemplo,
  auditar solo dependencias de producción con `pnpm audit --prod` y/o una
  lista de excepciones con fecha), o la CI fallará.
- Riesgo residual: las devDependencies se ejecutan en la máquina de
  desarrollo y en CI; una vulnerabilidad en ellas afectaría a esos entornos,
  no al sitio publicado.

## Relación con la constitución

- Invariante I9 (trazabilidad y evidencia): la excepción es explícita, con
  alcance y caducidad, no una afirmación sin respaldo.
- `rules/security.md`: "`pnpm audit` sin vulnerabilidades altas ni críticas al
  cerrar", y `rules/quality-gates.md`, puerta 5: "o con ADR y caducidad".
- No modifica `docs/constitution.md`.

> Nota de ubicación: se creó en `docs/adr/` por indicación del usuario y se
> movió a `sdd/adrs/` el 2026-10-19 (T-002), que es donde el proyecto guarda
> los ADRs. El contenido de la decisión no cambia.
