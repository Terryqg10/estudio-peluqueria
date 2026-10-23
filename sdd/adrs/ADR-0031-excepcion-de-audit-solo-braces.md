---
id: ADR-0031
title: La excepción de pnpm audit se reduce a braces, que no tiene versión corregida
status: aceptada
date: 2026-10-23
os_version: 0.6.0
relates_to: [ADR-0008, ADR-0023, ADR-0025, T-016]
supersedes: [ADR-0008, ADR-0023]
---

# ADR-0031 — Excepción de `pnpm audit` limitada a `braces`

## Contexto

ADR-0008 y ADR-0023 aceptaron, con caducidad «al cerrar T-016», 13 hallazgos de `pnpm audit` en devDependencies
(`vitest`, `vite`, `tinypool`, `esbuild`, `@vitest/mocker` y `braces`). T-016 subió `vitest` a 4.1.12 y `vite` a
6.4.5, que corrigen todos menos uno. Al subir, el audit mostraba además dos avisos nuevos de `vitest` y
`@vitest/mocker` (< 4.1.12) que también quedan resueltos.

Queda **un** hallazgo high: `braces` ≤ 3.0.3 (GHSA-vfj7-8cjw-p6xm, denegación de servicio por patrones muy
anidados). Llega por `eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch`. **No existe versión
corregida** (la última publicada es 3.0.3 y el aviso cubre todas).

## Alternativas consideradas

1. **Dejar el audit en rojo** — bloquea la CI sin que se pueda hacer nada. Se descarta.
2. **`pnpm.overrides` a una versión inexistente o a otra librería** — no hay versión corregida y forzar otra rompe
   `micromatch`. Se descarta.
3. **Mantener una excepción mínima, solo para `braces` (elegida)** — con caducidad ligada a la aparición de arreglo.

## Decisión

- La lista blanca (`scripts/audit-allowlist.json`) contiene únicamente `GHSA-vfj7-8cjw-p6xm` (`braces`).
  **ADR-0008 y ADR-0023 quedan cerrados** (esta decisión los sustituye).
- Es solo devDependency (lint), **no hay hallazgos en producción** (`--prod` limpio) y el patrón anidado que lo
  dispara no lo controla ningún dato externo: `eslint` solo expande los globs de la configuración del repo.
- **Caduca** cuando se publique una versión corregida de `braces` (o `micromatch`/`fast-glob` dejen de depender de
  ella). Se revisa en cada actualización de `eslint-config-next`; `check-audit` avisa cuando la entrada deja de
  aparecer.

## Consecuencias

Positivas:
- El audit bloqueante ya cubre casi todo: cualquier hallazgo high o critical nuevo falla la CI.
- Desaparecen las herramientas con avisos críticos (servidor UI de Vitest, `tinypool`).

Negativas:
- Sigue una excepción vigente que depende de un tercero.
- Vitest 4 exige Node ≥ 20 (el repo usa 24) y vite 6.

## Relación con la constitución

Puerta 5 de calidad (`pnpm audit --audit-level=high` sin hallazgos «o con ADR y caducidad») e invariante I9
(evidencia): los números y el antes/después están en `sdd/reviews/T-016.md`.
