---
id: ADR-0039
title: Migrar zod 3 a zod 4 por el aviso high GHSA-mrhx-c7xc-m3w5
status: aceptada
date: 2026-10-26
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, ADR-0031, T-038]
---

# ADR-0039 — Migrar zod 3 a zod 4

## Contexto

El 2026-10-26 `pnpm audit` empezó a dar un hallazgo **high** en `zod` (GHSA-mrhx-c7xc-m3w5: agotamiento de memoria al validar colecciones
con restricciones de tamaño muy grandes), en una **dependencia de producción**. Está en `<4.6.6` y solo se corrige en `>=4.6.6`: el proyecto usa
`zod ^3.24.0` (3.25.76), sin parche en la rama 3. La puerta 5 de `quality-gates.md` exige `pnpm audit --audit-level=high` sin hallazgos (o ADR con
caducidad), y la CI de `main` y de los PR de Dependabot está en rojo por ello. El portfolio (terryq.com) ya pasó a zod 4.6.7 por el mismo aviso.

## Alternativas consideradas

1. **Excepción con caducidad en `scripts/audit-allowlist.json` (como ADR-0031 con `braces`)** — deja la CI en verde sin tocar código, pero acepta una
   vulnerabilidad en producción sin plazo claro y obliga a migrar de todos modos. Se descarta: ADR-0031 solo cubre devDependencies.
2. **Migrar a zod 4 (elegida)** — corrige el hallazgo y la deuda de versión; coste: cambios de API en los ~25 ficheros que validan entradas.

## Decisión

Subir a `zod ^4.6.7` (con `pnpm.overrides` para que las devDependencies usen la misma versión) y adaptar el código a zod 4 sin cambiar el comportamiento: mismas validaciones, mismos mensajes de error al usuario y los mismos tipos
derivados de los esquemas (`z.infer`). La verificación son los tests existentes (unitarios, integración y e2e); no se altera ningún CA ni test.

## Consecuencias

Positivas:
- Cierra GHSA-mrhx-c7xc-m3w5 en producción y deja `pnpm audit` limpio de hallazgos high.
- Alinea el proyecto con el portfolio y con la rama mantenida de zod.

Negativas:
- Riesgo de regresión sutil en mensajes o formatos de error; se mitiga con los tests que ya cubren las validaciones.
- `eslint-config-next` arrastra su propia copia de zod 3 (devDependency, vía `eslint-plugin-react-hooks`, que acepta zod 3 o 4) y `pnpm audit` la marca igual: se unifica con un `pnpm.overrides` de `zod` a `^4.6.7`. Si una actualización de ese plugin dejara de admitir zod 4, el override se revisa.

## Relación con la constitución

I5 (inputs externos validados con Zod, tipos derivados del esquema) se mantiene. I2 (TypeScript estricto) se mantiene: sin `any` ni `@ts-ignore` en la migración.
