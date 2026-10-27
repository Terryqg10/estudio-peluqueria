---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

# Home (/)

Modo: Persuade. Visitante primario: reclutador o cliente de Terry llegado desde terryq.com; secundario: clienta del salón ficticio. Acción: «Probar el panel»; después reservar y ver trabajos.
Pruebas reales: catálogo con precios «desde» y duración, 3 estilistas, disponibilidad en vivo (en /reservar), galería antes/después (imágenes generadas con IA, señaladas), panel de solo lectura. Nada inventado.
Restricciones: estilo v5-color-chart@0.1.0 (ADR-0040), paleta validada con check-palette, solo tokens, WCAG AA, prefers-reduced-motion con alternativa estática, 320–1280 px sin desbordes, CA-01 a CA-04 verificados por los tests existentes.
Decisiones abiertas: el próximo hueco libre de hoy en la muestra elegida (dropped en esta primera entrega; requiere una consulta de disponibilidad propia); si las muestras pasan de SVG propio a imágenes generadas (requiere una clave de API en el entorno del usuario).

## Direction contract

THESIS: la Home es una carta de color de tintes profesionales: los servicios son muestras de mechón numeradas colgadas de un anillo, y el precio y la acción se leen tan nítidos como la muestra. Rechaza la disposición por defecto del sector (foto en caja con texto al lado sobre rosa/crema con serif).
OWN-WORLD: cartulina gris neutra fría (`--color-bg`) para que el color de las muestras se lea verdadero; un único acento cobre (`--color-accent`) reservado al elemento en foco y a la acción principal; muestras de mechón en SVG con pinza negra y numeración tabular N.º 01–08; titulares en Bricolage Grotesque, cuerpo en Geist; esquinas cortas, contorno firme, elevación casi plana.
STORY: quien llega entiende en un vistazo que Atelier Malva es una peluquería con precio claro y reserva real (la carta), cree que el trabajo es serio porque el oficio se nota en el detalle, y actúa entrando al panel de demostración («Muestra 0») o reservando una muestra.
FIRST VIEWPORT: a la izquierda, sobre cartulina fría, el titular «Elige tu servicio, mira el precio, reserva tu hueco» a `text-display` (sin kicker), la banda «Muestra 0: prueba el panel del salón» con «Probar el panel» como único botón cobre relleno, y debajo «Ver servicios» como acción secundaria con contorno; a la derecha, el abanico de ocho muestras colgado del anillo, a escala dominante, que sale de la carta al pasar el cursor. En móvil el abanico queda bajo el texto, centrado.
FORM: carta de niveles de color de tintes profesionales, posición 3 de mi lista tras la segunda tirada (asignada), seed: f19c4727798c90f9.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
