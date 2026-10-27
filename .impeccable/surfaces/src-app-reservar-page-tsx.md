---
version: 1
slug: "src-app-reservar-page-tsx"
primary_target: "src/app/reservar/page.tsx"
related_targets: []
---

# Reservar (/reservar)

Modo: Operate. Visitante: quien reserva una cita (clienta del salón; secundariamente, quien evalúa el proyecto y comprueba la disponibilidad en vivo). Tarea: servicio → día → hora (en la fila de una estilista) → datos → confirmar, en menos de un minuto y sobre todo en móvil.
Información que se lee primero: servicio con precio «desde», qué horas libres hay ese día por estilista y qué llevas elegido (ficha de la cita).
Estados: carga, error con reintento, día sin horas (próximos días libres), servicio sin estilista, hueco elegido que se ocupa a la vez (aviso y alternativas), cuenta con sesión, sin JavaScript (aviso). Orden del flujo sin cambios (spec RF-02, sin enmienda).
Restricciones: estilo v5-color-chart (DESIGN.md), solo tokens, WCAG AA, prefers-reduced-motion, 320–1280 px, controles estándar (radios, botones de hora, enlaces), sin tocar lógica de disponibilidad ni de reserva.
Decisiones tomadas por el usuario (2026-10-27): ficha en móvil como barra inferior pegajosa; la estilista se elige al pulsar su hora (filtro «Todas» y nombres para acotar); el selector de servicio usa las mismas muestras SVG que la Home.

## Direction contract

THESIS: reservar es leer la jornada: cada estilista tiene su regla horaria hecha de mechones y la hora elegida cuelga de ella en cobre; la herramienta sigue siendo una herramienta (radios, botones de hora, formulario estándar), sin convertirse en póster. Rechaza la rejilla única de horas de todas las estilistas mezcladas y el paso de estilista como pantalla aparte.
OWN-WORLD: cartulina gris fría, contorno firme y filas con línea en vez de tarjetas; un único cobre para la hora elegida y la acción de confirmar; muestras de mechón tumbadas con N.º sobre la pinza en el selector de servicio y en la ficha; reglas horarias de 10:00 a 20:00 con lo libre dibujado como hebras (resumen decorativo, aria-hidden); Bricolage Grotesque en titulares, Geist en cuerpo, cifras tabulares.
STORY: quien reserva entiende a la vista qué horas hay y de quién, elige una y ve su cita construida en la ficha (servicio, estilista, día, hora, duración y precio «desde»), y sigue a «Tus datos» sin perder lo elegido.
FIRST VIEWPORT: a la izquierda, el título «Reserva tu cita», el aviso de demo y la lista de servicios como filas de la carta (muestra tumbada con número, nombre y duración, y precio a la derecha); a la derecha, la ficha de la cita pegajosa (vacía hasta elegir hora). Tras elegir servicio aparecen día, filtro de estilista y la fila de cada estilista con su regla y sus horas. En móvil la ficha es una barra inferior pegajosa con el resumen en una línea y «Continuar con tus datos».
FORM: jornada en tiras por estilista, posición 2 de mi lista de estructuras (repartida en el sorteo de superficie), seed: d295294555b6232a.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
