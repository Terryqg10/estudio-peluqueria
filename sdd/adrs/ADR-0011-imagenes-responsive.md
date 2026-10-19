---
id: ADR-0011
title: Las imágenes de contenido deben ser responsive y verificables
status: aceptada
date: 2026-10-19
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, T-003]
---

# ADR-0011 — Las imágenes de contenido deben ser responsive y verificables

## Contexto

El responsive del layout está cubierto por reglas del OS y por el barrido de 18
anchos (`tests/responsive.spec.ts`). Las imágenes solo tienen una línea en el
estilo v1 («`srcset` y tamaños responsive») y el plan fijaba formatos y pesos,
pero no `sizes`, relación de aspecto, recortes por pantalla ni reserva de
dimensiones. Ninguna puerta lo verifica. Además, el barrido actual solo recorre
`/`, no el resto de páginas públicas.

El proyecto es de portfolio y la fotografía es protagonista (hero, galería
antes/después, equipo), por lo que es donde más pesa el rendimiento en móvil.

## Alternativas consideradas

1. **Dejarlo como guía del estilo v1, sin test** — no cuesta nada, pero no
   queda evidencia (invariante I9) y se degrada con cada imagen nueva.
2. **Regla en el plan y la spec, con test e2e (elegida)** — verificable y
   ligera; se aplica sin tocar el OS.
3. **Enmendar la constitución o `quality-gates.md` del OS** — sería lo más
   completo, pero la constitución no se edita desde un proyecto. Se deja como
   sugerencia al OS.

## Decisión

- Se añade **RNF-13** (imágenes responsive) y los criterios **CA-36** y
  **CA-37** a la spec mediante enmienda (sección 12).
- La regla se detalla en el plan, sección 5a («Imágenes responsive»).
- El barrido de 18 anchos pasa a recorrer **todas** las páginas públicas desde
  una lista única de rutas (CA-37).
- Un test e2e `imagenes-responsive` comprueba, en cada página con imágenes,
  `alt`, dimensiones o relación de aspecto, `srcset`/`sizes` y ausencia de
  desborde (CA-36).
- Se implementa en T-003, que es la primera tarea con imágenes.

## Consecuencias

Positivas:
- La regla pasa a ser evidencia automática, no una intención.
- Cada página nueva queda cubierta por el barrido sin tocar el test.
- Mejor rendimiento en móvil (LCP y CLS).

Negativas:
- Un test e2e más y más trabajo al añadir imágenes (`sizes` explícito en cada una).
- La regla vive solo en este proyecto; el OS no la hereda salvo que se proponga.

## Relación con la constitución

- I6 (accesibilidad AA): el `alt` obligatorio se verifica.
- I9 (trazabilidad y evidencia): cada CA nuevo tiene test.
- No modifica `docs/constitution.md`; se sugiere elevar la regla al OS.
