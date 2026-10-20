---
id: ADR-0023
title: Ampliar la excepción de pnpm audit a tres avisos nuevos de vite (launch-editor), con la misma caducidad
status: aceptada
date: 2026-10-21
os_version: 0.6.0
relates_to: [ADR-0008, T-014, T-016]
extends: ADR-0008
---

# ADR-0023 — Ampliar la excepción de `pnpm audit` (extiende ADR-0008)

> **Extiende a ADR-0008, no lo sustituye.** ADR-0008 está aceptado y no se edita; este ADR añade
> hallazgos a su lista y concreta su caducidad. Todo lo que ADR-0008 dice y este ADR no cambia, sigue vigente.

## Contexto

ADR-0008 aceptó, con caducidad, 10 hallazgos de `pnpm audit --audit-level=high` en devDependencies de la
plantilla (`vitest`, `tinypool`, `vite`, `braces`, `esbuild`, `@vitest/mocker`) y dijo que «cualquier hallazgo
nuevo bloquea el cierre». Al hacer `/check` de T-014 (2026-10-21) el audit da **13**: se han publicado tres
avisos nuevos sobre `vite@5.4.21`, que llega por `@vitejs/plugin-react@4.7.0` y ya estaba en la lista de ADR-0008.
`pnpm audit --audit-level=high --prod` sigue limpio: ninguno afecta a lo que se despliega.

## Hallazgos que se añaden

| Severidad | Paquete | Aviso | Cadena | Corregido en |
|---|---|---|---|---|
| high | `vite` ≤ 6.4.3 | `launch-editor`: la comprobación `fs.existsSync()` se puede saltar en rutas alternativas de Windows | `@vitejs/plugin-react@4.7.0 > vite@5.4.21` | ≥ 6.4.4 |
| moderate | `vite` ≤ 6.4.3 | `launch-editor`: `escapeCmdArgs()` no escapa `%` en Windows | idem | ≥ 6.4.4 |
| moderate | `vite` ≤ 6.4.3 | `launch-editor`: la CLI del editor se interpreta mal y permite ejecutar comandos | idem | ≥ 6.4.4 |

Total tras este ADR: **13 hallazgos cubiertos** (7 moderate, 3 high, 3 critical), todos en devDependencies.

## Alternativas consideradas

1. **Actualizar ya `vite` con un `override` de pnpm** — cierra los tres, pero `vitest@2.1.9` espera vite 5 y
   puede romper los 238 tests unitarios y los 133 de integración. Se hace como tarea propia (T-016).
2. **Hacer ya la actualización completa (vitest, vite, plugin-react)** — resuelve todo, pero es una tarea
   grande ajena a la que se está cerrando. Se agenda como T-016.
3. **Ampliar la excepción con la misma caducidad (elegida)** — mismo razonamiento que ADR-0008: herramientas de
   desarrollo que no se despliegan; el riesgo es acotado.
4. **Dejar de ejecutar `pnpm audit` en la puerta** — se descarta, igual que en ADR-0008.

## Decisión

- Se **añaden a la excepción de ADR-0008** los tres hallazgos de la tabla. Mismo alcance (solo devDependencies,
  solo estos paquetes y cadenas) y mismas condiciones.
- **Caducidad concreta:** la excepción completa (ADR-0008 más este ADR) **expira al cerrar T-016** («Upgrade de
  Vitest y Vite»), que es la «tarea de mantenimiento post-MVP» de ADR-0008. Se propone que T-016 se cierre
  **antes de publicar el sitio**; si eso es un requisito formal queda como **DECISIÓN PENDIENTE**.
- **Riesgo real:** `launch-editor` solo se usa si se ejecuta el servidor de desarrollo de Vite y se abren
  archivos en el editor desde el navegador. Este proyecto usa Vitest en Node, no el servidor de Vite con UI,
  y nada de esto llega a producción. Aun así, no se debe abrir el UI de Vitest ni enlaces de «abrir en editor»
  de procedencia no fiable mientras la excepción esté vigente.
- **Cualquier hallazgo posterior** a este ADR (otro aviso nuevo, o cualquiera en `dependencies`) **sigue
  bloqueando el cierre** y requiere un ADR nuevo o actualizar antes de cerrar. Este ADR no es una excepción abierta.

## Consecuencias

- Positivas: se desbloquea el cierre de T-014 sin tocar el árbol de dependencias ni arriesgar los tests.
- Negativas: la deuda de actualización crece (13 hallazgos) y pueden aparecer más avisos sobre `vite@5` y
  `vitest@2`, que obligarían a repetir este trámite. Por eso T-016 no debe retrasarse.
- `braces` sigue sin versión corregida publicada (VERIFICAR): T-016 no podrá cerrarlo y requerirá o bien una
  versión nueva de `eslint-config-next`, o mantener esa excepción concreta con su propio ADR.
- **Coste de revertir: bajo.** Se revierte actualizando las dependencias (T-016) y retirando la excepción.

## Relación con la constitución

- `rules/security.md` («`pnpm audit` sin vulnerabilidades altas ni críticas al cerrar») y `rules/quality-gates.md`,
  puerta 5 («o con ADR y caducidad»). No modifica `docs/constitution.md`.
