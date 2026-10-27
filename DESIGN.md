---
name: Atelier Malva
description: Peluquería de mujer en forma de carta de niveles de color de tintes profesionales; precio claro, reserva real, un solo acento cobre.
colors:
  chart-card: "#eef0f3"
  surface: "#ffffff"
  surface-muted: "#e3e6eb"
  border: "#d2d7de"
  border-strong: "#737b87"
  ink: "#14171c"
  ink-muted: "#4a525d"
  copper: "#b5401c"
  copper-hover: "#962f12"
  copper-ink: "#ffffff"
  copper-soft: "#f7e3da"
  copper-text: "#a33a18"
  danger: "#b42318"
  success: "#067647"
typography:
  display:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5.4vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.02
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Bricolage Grotesque, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    fontFeature: "'tnum'"
rounded:
  tile: "6px"
  control: "6px"
  card: "8px"
  container: "12px"
spacing:
  gutter: "clamp(1rem, 4vw, 1.5rem)"
  touch-min: "44px"
  row-y: "20px"
  section-y: "48px"
components:
  button-primary:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.copper-ink}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.copper-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-muted}"
  link-action:
    textColor: "{colors.copper-text}"
    rounded: "{rounded.control}"
    padding: "0 24px"
    height: "44px"
  link-action-hover:
    backgroundColor: "{colors.copper-soft}"
---

# Design System: Atelier Malva

## Overview

**Creative North Star: "La carta de color"**

El sistema es la carta de tintes de un salón profesional: una cartulina gris neutra y fría para que el color de las muestras se lea verdadero, con las muestras de mechón colgadas de un anillo. Los servicios son filas de esa carta, con su muestra tumbada, número tabular, duración y precio «desde». Precio, número y acción se leen tan nítidos como la muestra: contornos firmes, esquinas cortas, elevación casi plana.

La voz es seca y precisa, de oficio, no de decoración. Hay un único acento cobre, reservado a lo que se puede hacer ahora. El color de pelo es contenido (SVG en `public/images/carta/`, generados por `scripts/gen-swatches.mjs`), nunca un token ni un valor en un componente. Se rechaza la disposición por defecto del sector (foto en caja con texto al lado, rosa o crema con serif).

**Key Characteristics:**
- Cartulina fría (`chart-card`) y blanco `surface`; un solo acento cobre.
- Listas con líneas divisorias en vez de tarjetas; precio alineado a la derecha en cifras tabulares.
- Abanico de ocho muestras en el hero, decorativo (`aria-hidden`), que se abre al cargar y saca la muestra al pasar el cursor.
- Movimiento seco con `transform` y `opacity`; con `prefers-reduced-motion` el abanico queda quieto y abierto.

## Colors

Neutros fríos de croma casi nulo más un cobre rojizo; la paleta son los 14 tokens de `palette.css`, validada con check-palette.

### Primary
- **Cobre de acción** (`copper`): relleno del botón principal de la Home («Probar el panel»), del filtro de galería seleccionado y del foco. `copper-hover` en hover; `copper-ink` es el texto sobre cobre.

### Neutral
- **Cartulina fría** (`chart-card`): fondo de página.
- **Blanco papel** (`surface`) y **Gris de muestra** (`surface-muted`): superficie de tarjetas de móvil y fondo de hover de botones secundarios.
- **Línea suave** (`border`): separador de filas. **Contorno firme** (`border-strong`): bordes de controles, encabezados de grupo, anillo del abanico, bloque «Muestra 0».
- **Tinta** (`ink`) y **Tinta apagada** (`ink-muted`): texto y texto secundario.
- **Texto cobre** (`copper-text`) y **Cobre suave** (`copper-soft`): enlaces de acción en texto y su hover.
- `danger` y `success` están en la paleta; la Home no los usa.

### Named Rules
**The One Copper Rule.** El cobre marca lo que se puede hacer ahora. En el primer viewport solo «Probar el panel» va en cobre; «Ver servicios» y «Reservar» son secundarios con contorno firme.

**The Content Color Rule.** Los colores de pelo viven dentro de los SVG como contenido. En componentes y CSS solo hay nombres de token: nada de hex, rgb() ni hsl().

## Typography

**Display Font:** Bricolage Grotesque (variable, `next/font`, expuesta como `font-display`)
**Body Font:** Geist (`--font-brand`, base de `font-sans`)

**Character:** una grotesca con carácter para los titulares y una sans neutra para el cuerpo; la numeración de la carta usa cifras tabulares.

### Hierarchy
- **Display** (600, `clamp(2.25rem, 5.4vw, 3.75rem)`, 1.02): solo el h1 del hero.
- **Headline** (600, 1.875rem, tight): h2 de sección («Servicios y precios», «Nuestros trabajos», «Visítanos»). El trabajo de galería usa Bricolage a 1.5rem.
- **Title** (600, 1.25rem/1.125rem, tight): h3 de grupo de servicio y nombre del servicio.
- **Body** (400, 1rem, relaxed; el lead del hero 1.125rem): textos y duraciones, medida `max-w-prose`.
- **Label** (600, 0.75rem, `tabular-nums`): número impreso sobre la pinza de cada muestra. Es el mínimo del sistema (`--text-min`).

### Named Rules
**The Tabular Rule.** Precios y números de carta llevan `tabular-nums`.

## Layout

Mobile-first con contenedor `max-w-6xl` y margen lateral `--layout-gutter`. Secciones con padding vertical de 3rem (4rem desde `sm`). Breakpoints del contrato: 640, 768, 1024 y 1280 px.

- Hero: una columna en móvil con el abanico bajo el texto; dos columnas iguales desde `lg`. El abanico escala con `--swatch-width` y su contenedor.
- Servicios: fila en rejilla; en móvil muestra de 9rem y texto, con «Reservar» debajo; desde `sm` cuatro columnas (muestra 13rem, nombre, precio, acción).
- Galería: en móvil tira con scroll-snap (desbordamiento deliberado, `data-allow-overflow`); desde `md` una fila por trabajo, texto a la izquierda y par antes/después de `--layout-pair-width` (26rem) a la derecha.
- Navegación de la galería: filtros como enlaces (`?tecnica=`), funcionan sin JavaScript.

## Elevation & Depth

Casi plano. La profundidad la dan líneas, bordes y el contraste entre cartulina y blanco, no sombras. `--shadow-card` (anillo de 1px más 2px/6px de difuminado suave) existe y se usa solo en los mensajes de estado de la galería; `--shadow-lift` está reservado a la muestra elegida.

### Named Rules
**The Flat Card Rule.** En reposo no hay sombras ni tarjetas flotantes: las listas son filas con línea de separación. La elevación llega solo como respuesta a una muestra elegida.

## Shapes

Esquinas cortas: 6px en controles, 8px en tarjetas, 12px en contenedores; nunca píldoras. El único círculo es el anillo del abanico (24px, borde de 3px en `border-strong`). Las muestras son siluetas troqueladas con pinza negra, en SVG.

## Components

### Buttons
- **Shape:** esquinas cortas (6px), altura mínima de 44px, padding horizontal de 24px.
- **Primary:** relleno `copper`, texto `copper-ink`, peso 600; solo para la acción principal («Probar el panel»).
- **Secondary:** transparente, borde de 1px `border-strong`, texto `ink`; en hover rellena `surface-muted`. Es «Ver servicios», «Reservar» y «Reservar [servicio]».
- **Link-action:** texto `copper-text` sin borde; hover con fondo `copper-soft`.
- **Hover / Focus / Press:** transición de color y `scale` en 160ms con `--ease-soft`; pulsación a `scale(0.98)`; foco de 2px `copper` con offset de 2px.

### Filter chips (galería)
- Borde y fondo `surface` en reposo; seleccionado con relleno `copper` y `aria-current`. Altura mínima de 44px, esquinas de 6px.

### Rows (carta de servicios)
- Línea inferior `border`, padding vertical de 20px. Muestra tumbada que se desliza `--swatch-slide` al pasar por la fila, con su número tabular impreso sobre la pinza.

### Swatch fan (componente firma)
Ocho muestras SVG colgadas de un anillo, rotadas 8° entre contiguas, con transform-origin en la pinza. Se abren al cargar (380ms, escalonado 45ms); al pasar el cursor o enfocar, la muestra sube `--swatch-pull`. Decorativo (`aria-hidden`); la información está en la carta de servicios.

### Muestra 0 (invitación al panel)
Bloque con borde superior e inferior `border-strong` y título en Bricolage, que contiene el botón primario. Solo existe con `DEMO_ENABLED=1`.

### Contact list
Lista de definición con filtete superior `border-strong`; etiquetas en `ink-muted`; teléfono como enlace de 44px cuyo hover pasa a `copper-text`.

## Do's and Don'ts

### Do:
- **Do** usar solo nombres de token (`bg-accent`, `text-fg-muted`, `border-border-strong`); los colores de pelo van dentro de los SVG como contenido.
- **Do** dejar el cobre para la acción principal y el foco; el resto de acciones, secundarias con contorno firme.
- **Do** componer los servicios como filas con línea de separación y precio alineado a la derecha.
- **Do** usar solo `transform` y `opacity` en el movimiento, con las duraciones de `--duration-*`, y que `prefers-reduced-motion` deje el abanico quieto y abierto.
- **Do** mantener la altura táctil de 44px y el texto de al menos 12px.

### Don't:
- **Don't** usar píldoras ni sombras difusas grandes.
- **Don't** usar degradados decorativos ni cobre decorativo fuera de la acción principal y el foco.
- **Don't** dibujar mechones con valores de color fijos en componentes: las muestras son SVG con su origen documentado.
- **Don't** volver a la disposición del sector (foto en caja con texto al lado, rosa o crema con serif).
