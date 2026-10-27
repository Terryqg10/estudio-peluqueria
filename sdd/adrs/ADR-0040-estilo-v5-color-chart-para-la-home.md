---
id: ADR-0040
title: Estilo nuevo v5-color-chart (carta de color) y paleta propia para el rediseño de la Home
status: aceptada
date: 2026-10-27
os_version: 0.6.0
relates_to: [SPEC-001-peluqueria-reservas, PLAN-001-peluqueria-reservas, ADR-0012, T-041]
---

# ADR-0040 — Estilo v5-color-chart y paleta propia

## Contexto

El usuario considera la Home «extremadamente básica» y pide un rediseño completo con Impeccable (2026-10-27). Tras `/impeccable init` (PRODUCT.md) y `/impeccable shape`
(dos tiradas de direcciones) eligió la dirección **«Carta de niveles de color»** y confirmó el brief y el estilo nuevo. La regla de `styles.md` dice que un estilo aprobado es inmutable
y que un cambio crea una versión nueva con ADR; el color no forma parte del estilo (paleta por proyecto, 14 tokens, 20 pares de contraste, `check-palette`).

## Alternativas consideradas

1. **Seguir en `v1-soft-commerce` y rediseñar solo composición** — el usuario ya descartó esta vía: el problema es de identidad, no de maquetación.
2. **Otro estilo del OS (v2, v3, v4)** — ninguno encaja con una Home de oficio y de lectura rápida para quien evalúa; v4 es de paneles y v2/v3 piden hero 3D u oscuro a sangre.
3. **Estilo nuevo del proyecto `v5-color-chart` (elegida)** — tokens propios (forma, tipografía, movimiento, layout) con el mismo contrato de nombres que v1, de modo que los componentes
   existentes lo heredan al cambiar solo `tokens.css` y `palette.css`; el resto de superficies se rediseña después en tareas propias.

## Decisión

- Se crea `design/styles/v5-color-chart/` (`style.md` y `tokens.css`, versión 0.1.0, estado borrador) como **estilo del proyecto**: no toca los de web-os y se registra en `design/styles/index.md`.
  Mantiene los mismos nombres de token que v1 (contrato de componentes) y añade los propios de la carta (`--swatch-*`).
- Paleta nueva en `palette.css`, **modo claro con base neutra fría** (la carta se lee sobre cartulina gris neutra para que las muestras de color se vean verdaderas) y **un solo acento cálido**
  (cobre rojizo) reservado para el elemento en foco y la acción principal. Los colores de las muestras de pelo no son tokens: son contenido (imágenes SVG), como pide `palette-rules.md` («el resto solo en imágenes»).
- Tipografía: titulares en **Bricolage Grotesque** (sustituye a Fraunces, ADR-0012, solo en la parte de titulares; este ADR enmienda esa decisión) y cuerpo en Geist, con cifras tabulares para la numeración de la carta.
- `PLAN-001` pasa a `style: v5-color-chart@0.1.0` y registra la paleta nueva.

## Consecuencias

Positivas:
- Identidad propia y reconocible para la Home sin tocar la lógica; las páginas restantes heredan tokens y paleta sin cambios de componentes.
- La paleta y el estilo nuevos pasan por `check-palette` y por los tests de accesibilidad y responsive existentes.

Negativas:
- El cambio de tokens y paleta es global: las páginas que no se rediseñan ahora (reserva, cuenta, panel) cambian de aspecto hasta que tengan su tarea; hay que revisarlas con la suite existente.
- Un estilo del proyecto no se propaga solo al OS: llevarlo a web-os (patrón reutilizable) es una decisión posterior.
- Coste de revertir: bajo-medio; basta con volver a importar `v1-soft-commerce/tokens.css` y la paleta anterior (queda en el historial de git) y restaurar la fuente.

## Relación con la constitución

I6 (WCAG AA) y I7 (`prefers-reduced-motion`) se mantienen: la paleta se valida con `check-palette` y los tokens de movimiento se anulan solos. I2 y I5 no cambian. Un estilo aprobado no se edita: v1 queda intacto.

## Enmienda de verificación (método, no criterios)

Los criterios CA-36 / RNF-13 / ADR-0011 («toda imagen de contenido es responsive y verificable») no cambian. Cambia **cómo** se comprueban en `tests/imagenes-responsive.spec.ts`:

- Las muestras de la carta son SVG propios y decorativos (`alt` vacío): son vectoriales, no son imagen de contenido y no existen versiones por resolución; se les sigue exigiendo `alt`, dimensiones y que no desborden, pero no `srcset` ni `sizes`.
- El hero deja de ser una foto (decisión del usuario, «renovar todo»): el test «la home tiene su imagen de hero con alt descriptivo» pasa a comprobar que la carta del hero es decorativa (`aria-hidden`, `alt` vacío) y reserva su tamaño. No existe CA que exija una foto de hero (CA-03 pide h1 y CTA visibles sin scroll, que sigue verificado por `home`).
- La galería pasa a filas en escritorio y a tira con `scroll-snap` en móvil (revisión final de Impeccable): `galeria-ultima-centrada` (T-035) se sustituye por `galeria-filas`
  (en escritorio ninguna fila queda huérfana; en móvil la tira es desplazable y alcanzable con teclado) y el par antes/después va siempre lado a lado. CA-02 (filtro por técnica) no cambia.
  `imagenes-responsive` ignora la comprobación de «se sale de la ventana» solo dentro de un contenedor con `data-allow-overflow` (la excepción explícita de la puerta 7 para carruseles).
