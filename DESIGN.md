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
  slot-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "44px"
  slot-button-selected:
    backgroundColor: "{colors.copper}"
    textColor: "{colors.copper-ink}"
  stylist-filter:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  stylist-filter-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.chart-card}"
  day-ruler:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.tile}"
    height: "40px"
---

# Design System: Atelier Malva

## Overview

**Creative North Star: "La carta de color"**

El sistema es la carta de tintes de un salón profesional: una cartulina gris neutra y fría para que el color de las muestras se lea verdadero, con las muestras de mechón colgadas de un anillo. Los servicios son filas de esa carta (en la Home para leer, en /reservar para elegir), con su muestra tumbada, número tabular, duración y precio «desde». Precio, número y acción se leen tan nítidos como la muestra: contornos firmes, esquinas cortas, elevación casi plana.

La voz es seca y precisa, de oficio, no de decoración. Hay un único acento cobre, reservado a lo que se puede hacer ahora o ya está elegido. El color de pelo es contenido (SVG en `public/images/carta/`, generados por `scripts/gen-swatches.mjs`), nunca un token ni un valor en un componente. Se rechaza la disposición por defecto del sector (foto en caja con texto al lado, rosa o crema con serif).

**Key Characteristics:**
- Cartulina fría (`chart-card`) y blanco `surface`; un solo acento cobre.
- Listas con líneas divisorias en vez de tarjetas; precio alineado a la derecha en cifras tabulares.
- Abanico de ocho muestras en el hero, decorativo (`aria-hidden`), que se abre al cargar y saca la muestra al pasar el cursor.
- Reservar es leer la jornada: cada estilista tiene una regla horaria de mechones y la hora elegida cuelga de ella en cobre; los controles siguen siendo radios y botones estándar.
- Movimiento seco con `transform` y `opacity`; con `prefers-reduced-motion` el abanico queda quieto y abierto.

## Colors

Neutros fríos de croma casi nulo más un cobre rojizo; la paleta son los 14 tokens de `palette.css`, validada con check-palette.

### Primary
- **Cobre de acción** (`copper`): relleno del botón principal de la Home («Probar el panel»), del filtro de galería seleccionado, de la hora y el día elegidos en /reservar (botón y mechón de su regla), del botón de confirmar el formulario, de la regla inferior de la fila de servicio elegida y del foco. `copper-hover` en hover; `copper-ink` es el texto sobre cobre.

### Neutral
- **Cartulina fría** (`chart-card`): fondo de página.
- **Blanco papel** (`surface`) y **Gris de muestra** (`surface-muted`): superficie de tarjetas de móvil, de la fila de servicio elegida, de la regla horaria y de la ficha; `surface-muted` es el fondo de hover de botones y filas.
- **Línea suave** (`border`): separador de filas. **Contorno firme** (`border-strong`): bordes de controles, encabezados de grupo, anillo del abanico, bloque «Muestra 0», contorno de la regla horaria y borde de la ficha.
- **Tinta** (`ink`) y **Tinta apagada** (`ink-muted`): texto y texto secundario; `ink` rellena además el filtro de estilista elegido, y `ink-muted` tiñe las hebras libres de la regla.
- **Texto cobre** (`copper-text`) y **Cobre suave** (`copper-soft`): enlaces de acción en texto y su hover, la marca «Elegido» de la fila de servicio y los avisos de estado.
- `danger` y `success` están en la paleta; ni la Home ni el selector de /reservar los usan.

### Named Rules
**The One Copper Rule.** El cobre marca lo que se puede hacer ahora o lo ya elegido. En el primer viewport de la Home solo «Probar el panel» va en cobre; «Ver servicios» y «Reservar» son secundarios con contorno firme. En /reservar el cobre es lo elegido (hora, día, servicio) y la confirmación del formulario; el filtro de estilista elegido va en tinta, no en cobre, y «Continuar con tus datos» es secundario.

**The Content Color Rule.** Los colores de pelo viven dentro de los SVG como contenido. En componentes y CSS solo hay nombres de token: nada de hex, rgb() ni hsl(). Las hebras de la regla horaria son una forma (máscara) cuyo color es siempre un token.

## Typography

**Display Font:** Bricolage Grotesque (variable, `next/font`, expuesta como `font-display`)
**Body Font:** Geist (`--font-brand`, base de `font-sans`)

**Character:** una grotesca con carácter para los titulares y una sans neutra para el cuerpo; la numeración de la carta usa cifras tabulares.

### Hierarchy
- **Display** (600, `clamp(2.25rem, 5.4vw, 3.75rem)`, 1.02): solo el h1 del hero.
- **Headline** (600, 1.875rem, tight): h2 de sección («Servicios y precios», «Nuestros trabajos», «Visítanos») y «Elige día y hora» en /reservar. El trabajo de galería usa Bricolage a 1.5rem.
- **Title** (600, 1.25rem/1.125rem, tight): h3 de grupo de servicio, nombre del servicio y nombre de estilista en su fila. En /reservar, la leyenda «Elige tu servicio» y el título «Tu cita» van en Bricolage 600 a 1.5rem.
- **Body** (400, 1rem, relaxed; el lead del hero 1.125rem): textos y duraciones, medida `max-w-prose`.
- **Label** (600, 0.75rem, `tabular-nums`): número impreso sobre la pinza de cada muestra y marcas horarias de la regla (estas en `ink-muted`, 400). Es el mínimo del sistema (`--text-min`).

### Named Rules
**The Tabular Rule.** Precios, horas y números de carta llevan `tabular-nums`.

## Layout

Mobile-first con contenedor `max-w-6xl` y margen lateral `--layout-gutter`. Secciones con padding vertical de 3rem (4rem desde `sm`). Breakpoints del contrato: 640, 768, 1024 y 1280 px.

- Hero: una columna en móvil con el abanico bajo el texto; dos columnas iguales desde `lg`. El abanico escala con `--swatch-width` y su contenedor.
- Servicios: fila en rejilla; en móvil muestra de 9rem y texto, con «Reservar» debajo; desde `sm` cuatro columnas (muestra 13rem, nombre, precio, acción).
- Galería: en móvil tira con scroll-snap (desbordamiento deliberado, `data-allow-overflow`); desde `md` una fila por trabajo, texto a la izquierda y par antes/después de `--layout-pair-width` (26rem) a la derecha.
- Navegación de la galería: filtros como enlaces (`?tecnica=`), funcionan sin JavaScript.
- /reservar: desde `lg` dos columnas, el flujo a la izquierda (bloques separados 3rem en vertical) y la ficha «Tu cita» de 20rem a la derecha, pegajosa a 6rem del borde superior, con 2.5rem entre columnas. En móvil una columna; con hora elegida el contenido añade 7rem de padding inferior para la barra fija.
- Orden del flujo: servicio, día, filtro de estilista, jornada por estilista, datos. Tras elegir servicio la vista baja hasta «Elige día y hora» (suave; instantáneo con `prefers-reduced-motion`; margen de desplazamiento de 6rem para no quedar bajo la cabecera).
- Jornada: una fila por estilista con línea inferior `border` y un eje horario común a todas las filas (de la primera hora entera con huecos a la última tras el fin del servicio), con marcas cada 2 h.

## Elevation & Depth

Casi plano. La profundidad la dan líneas, bordes y el contraste entre cartulina y blanco, no sombras. `--shadow-card` (anillo de 1px más 2px/6px de difuminado suave) existe y se usa solo en los mensajes de estado de la galería; `--shadow-lift` está reservado a la muestra elegida de la Home y /reservar no lo usa: la ficha, la regla y las filas se separan con borde.

### Named Rules
**The Flat Card Rule.** En reposo no hay sombras ni tarjetas flotantes: las listas son filas con línea de separación. La elevación llega solo como respuesta a una muestra elegida.

## Shapes

Esquinas cortas: 6px en controles y regla horaria, 8px en tarjetas, 12px en contenedores; nunca píldoras. El único círculo es el anillo del abanico (24px, borde de 3px en `border-strong`). Las muestras son siluetas troqueladas con pinza negra, en SVG; las hebras de la regla son una máscara SVG dentro de una caja de esquina corta.

## Components

### Buttons
- **Shape:** esquinas cortas (6px), altura mínima de 44px, padding horizontal de 24px.
- **Primary:** relleno `copper`, texto `copper-ink`, peso 600; solo para la acción principal («Probar el panel», confirmar la reserva).
- **Secondary:** transparente, borde de 1px `border-strong`, texto `ink`; en hover rellena `surface-muted`. Es «Ver servicios», «Reservar», «Reservar [servicio]» y «Continuar con tus datos».
- **Link-action:** texto `copper-text` sin borde; hover con fondo `copper-soft`.
- **Hover / Focus / Press:** transición de color y `scale` en 160ms con `--ease-soft`; pulsación a `scale(0.98)`; foco de 2px `copper` con offset de 2px.

### Filter chips (galería)
- Borde y fondo `surface` en reposo; seleccionado con relleno `copper` y `aria-current`. Altura mínima de 44px, esquinas de 6px.

### Rows (carta de servicios)
- Línea inferior `border`, padding vertical de 20px. Muestra tumbada que se desliza `--swatch-slide` al pasar por la fila, con su número tabular impreso sobre la pinza.

### Fila de servicio seleccionable (/reservar)
- Etiqueta con radio nativo oculto visualmente (`sr-only`), agrupada por categoría bajo un encabezado con filete `border-strong`. Rejilla de muestra (6rem; 9rem desde `sm`), nombre con duración y precio «desde» a la derecha; mínimo 44px.
- Hover: fondo `surface-muted`. Elegida: fondo `surface`, regla inferior de 2px en `copper`, muestra desplazada `--swatch-slide` y la marca «Elegido» en `copper-text` bajo el precio. Foco por teclado: contorno de 2px `copper`. Usa las mismas muestras tumbadas que la Home (`muestra-N-h.svg`, N = posición en la carta módulo 8) con el número impreso sobre la pinza.

### Filtro de estilista
- Radios nativos como botones: «Todas» y un botón por nombre, solo si varias estilistas hacen el servicio. Contorno `border-strong`, fondo `surface`, 44px, esquina de 6px, hover `surface-muted`; elegido en `ink` con texto `chart-card` (no cobre). Solo acota la jornada: la estilista concreta se elige al pulsar su hora.

### Fila de estilista y regla horaria
- Nombre (1.125rem, 600) con el recuento de horas libres a la derecha («Sin horas libres este día» si no hay); debajo la regla y los botones de hora.
- La regla (`day-ruler`) es decorativa (`aria-hidden`): caja de 40px con contorno de 1px `border-strong`, fondo `surface` y esquina de 6px. Cada hora libre es una banda de la longitud del servicio con la forma de `hebras.svg` como máscara, teñida con `ink-muted` al 45% de opacidad; la hora elegida va en `copper` opaco y por encima. Marcas horarias de 12px bajo la regla.
- La forma de las hebras es contenido (`public/images/carta/hebras.svg`, generado por `scripts/gen-swatches.mjs`); el color es siempre del token.

### Botones de hora
- Cuadrícula de 4 columnas por hora entera: cada botón ocupa la columna de su cuarto (:00, :15, :30, :45), de modo que se lee contra las marcas de la regla. 44px, esquina de 6px, cifras tabulares; reposo `surface` con contorno `border-strong` y hover `surface-muted`; elegido en `copper` con `aria-pressed`. Pulsación a `--press-scale`.

### Ficha «Tu cita»
- Vacía hasta elegir hora. En escritorio: bloque de 20rem, pegajoso, con borde de 1px `border-strong`, esquinas rectas y padding de 20px; muestra tumbada del servicio, lista de definición (servicio, estilista, día, hora y duración, precio «desde») y botón secundario «Continuar con tus datos» (ancla `#datos`).
- En móvil: barra inferior fija, de borde superior `border-strong` sobre `surface`, en dos líneas (hora · estilista, y debajo servicio · día) con el botón a ancho completo; el título queda solo para lectores de pantalla.

### Swatch fan (componente firma)
Ocho muestras SVG colgadas de un anillo, rotadas 8° entre contiguas, con transform-origin en la pinza. Se abren al cargar (380ms, escalonado 45ms); al pasar el cursor o enfocar, la muestra sube `--swatch-pull`. Decorativo (`aria-hidden`); la información está en la carta de servicios.

### Muestra 0 (invitación al panel)
Bloque con borde superior e inferior `border-strong` y título en Bricolage, que contiene el botón primario. Solo existe con `DEMO_ENABLED=1`.

### Contact list
Lista de definición con filete superior `border-strong`; etiquetas en `ink-muted`; teléfono como enlace de 44px cuyo hover pasa a `copper-text`.

## Do's and Don'ts

### Do:
- **Do** usar solo nombres de token (`bg-accent`, `text-fg-muted`, `border-border-strong`); los colores de pelo van dentro de los SVG como contenido.
- **Do** dejar el cobre para la acción principal, lo elegido y el foco; el resto de acciones, secundarias con contorno firme.
- **Do** componer los servicios como filas con línea de separación y precio alineado a la derecha.
- **Do** dibujar lo libre de una jornada como hebras (máscara con color de token) y dejar los controles en radios y botones estándar; la regla es un resumen decorativo.
- **Do** elegir la estilista al pulsar su hora; el filtro «Todas» y los nombres solo acotan.
- **Do** usar solo `transform` y `opacity` en el movimiento, con las duraciones de `--duration-*`, y que `prefers-reduced-motion` deje el abanico quieto y abierto y el desplazamiento automático instantáneo.
- **Do** mantener la altura táctil de 44px y el texto de al menos 12px.

### Don't:
- **Don't** usar píldoras ni sombras difusas grandes.
- **Don't** usar degradados decorativos ni cobre decorativo fuera de la acción principal, lo elegido y el foco.
- **Don't** dibujar mechones con valores de color fijos en componentes: las muestras son SVG con su origen documentado.
- **Don't** mezclar en una sola rejilla las horas de todas las estilistas ni sacar la estilista a un paso aparte.
- **Don't** volver a la disposición del sector (foto en caja con texto al lado, rosa o crema con serif).
