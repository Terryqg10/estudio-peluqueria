---
id: v5-color-chart
version: 0.1.0
status: borrador
scope: estilo del proyecto (peluquería Atelier Malva); no forma parte del OS
modo: claro (base neutra fría)
origen: ADR-0040, /impeccable shape (T-041), dirección «Carta de niveles de color»
---

# v5-color-chart — la carta de color

Mundo: la carta de color de tintes profesionales. Cartulina gris neutra (para que el color de las muestras se lea verdadero), muestras de mechón numeradas, cifras tabulares
y un único acento cobre que marca el elemento en foco (la acción principal). El color de las muestras es contenido (imágenes), no token.

## Principios

- **Un acento, un foco:** el cobre solo marca lo que se puede hacer ahora (reservar, probar el panel). Nada decorativo en cobre.
- **Contorno firme:** precio, número y acción se leen tan nítidos como la muestra; bordes visibles (`--color-border-strong` en controles).
- **Eje de lectura simétrico:** nombre → muestras → acción; las muestras alineadas como un parterre, sin ornamento suelto.
- **La muestra es el controlador:** pasar el cursor o enfocar saca la muestra de la carta (`--swatch-pull`), y la pulsación la hunde (`--press-scale`).

## Forma y elevación

Esquinas cortas (`--radius-*` de 0.375 a 0.75 rem), sin píldoras. Elevación casi plana (`--shadow-card`); `--shadow-lift` solo para la muestra elegida.

## Tipografía

Titulares en Bricolage Grotesque (`--font-heading`), cuerpo en Geist (`--font-brand`). La numeración de la carta usa `tabular-nums`. `--text-display` escala con `clamp()`.

## Movimiento

Seco y preciso: `--ease-soft`, 160/260/380 ms. Solo `transform` y `opacity`. Con `prefers-reduced-motion` todos los tokens se anulan: el abanico queda quieto y abierto.

## Layout

Contenedor `--layout-container`, margen `--layout-gutter`, mobile-first. El abanico escala con `--swatch-width` y en móvil pasa a tira.

## Prohibido

Píldoras, sombras difusas grandes, degradados decorativos, cobre fuera del foco, mechones dibujados con valores de color fijos en componentes (las muestras son imágenes con su origen documentado).
