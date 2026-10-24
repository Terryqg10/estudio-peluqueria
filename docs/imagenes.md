# Registro de imágenes

Una fila por imagen del proyecto. Sin registro, la imagen no entra (PLAN-001,
sección 5a). Todas las licencias son **VERIFICAR** hasta comprobarlas de nuevo
en la página de origen antes de publicar.

| Archivo | Uso | Origen | Autor | Licencia | Fecha | Notas |
|---|---|---|---|---|---|---|
| `public/images/hero-inicio.jpg` | Hero de la home | [Pexels: Curly Haired Woman with Crocodile Hair Clip](https://www.pexels.com/photo/curly-haired-woman-with-crocodile-hair-clip-7755215/) | RDNE Stock project | Pexels «Free» (atribución no obligatoria; VERIFICAR en [pexels.com/license](https://www.pexels.com/license/)) | 2026-10-19 | Descargada reducida a 2000 px de ancho (`auto=compress&cs=tinysrgb&w=2000`), 2000×1333 px, 224 KB. Original 6720×4480 px |
| `public/images/galeria/galeria-*-antes.webp` y `-despues.webp` (14 archivos) | Galería antes/después de la home (7 pares) | Generadas con IA por el autor del proyecto (herramienta y modelo: **VERIFICAR**, anotar aquí) | Proyecto (sin terceros) | Imágenes generadas: **VERIFICAR** los términos de la herramienta usada antes de publicar | 2026-10-24 | Originales cuadrados de 2048×2048 px (fuera del repo); optimizadas con `scripts/optimize-gallery.mjs` a WebP de 1000×1000 px, 62–96 KB cada una (1,1 MB en total). Ninguna muestra el rostro. La web las marca «Imagen generada con IA» |

## Reglas

- Una imagen de banco no se presenta como cliente real del salón ficticio.
- Imágenes generadas con IA (antes/después, T-011): guardar aquí el prompt base
  y marcar `ai_generated` en la BD. Constan como tales en el README.
- Las licencias de banco se anotan con enlace a la página de la foto y a la
  licencia vigente. Si una licencia exige atribución, se muestra en la web.
- Alt obligatorio en cada uso; decorativas con `alt=""`.

## Galería antes/después (T-011)

Desde T-031 hay **7 pares generados con IA** (`galeria-<técnica>-<n>-antes.webp` y `-despues.webp`, WebP cuadrado de 1000×1000 px, ≤ 120 KB cada uno). Ya no hay ilustraciones provisionales. **No son fotos de trabajos reales.**

### Cómo cambiar o añadir imágenes (script de optimización)

1. Genera cada par con el prompt de la tabla (misma persona, misma luz y encuadre en las dos imágenes; cuadradas, ≥ 1000×1000 px,
   sin rostro identificable). Guárdalas fuera del repo como `<nombre>-antes.jpg` y `<nombre>-despues.jpg`.
2. Si hay pares nuevos, añádelos a `PAIRS` de `scripts/optimize-gallery.mjs` (original → `<técnica>-<n>`) y ejecuta
   `node scripts/optimize-gallery.mjs <carpeta con los originales>`: recorta al centro, reduce a 1000×1000 px y guarda WebP
   ≤ 120 KB en `public/images/galeria/`.
3. Actualiza o añade la fila de `gallery_items` (rutas, `alt_before`, `alt_after` y `ai_generated = true`) en
   `supabase/seed.sql`, y en el proyecto alojado con una consulta; en local, `pnpm run db:reset:local`.
4. Anota aquí cada archivo definitivo (herramienta, fecha y prompt usados).

Las imágenes generadas con IA se muestran en la web como «Imagen generada con IA».

### Prompts base (uno por par)

Estilo común: fotografía de salón de peluquería, luz natural suave, retrato de mujer adulta vista de espalda o de
tres cuartos (sin rostro identificable), fondo neutro, sin texto ni logotipos, sin marcas de agua.

| Par | Técnica · estilista · servicio | Antes | Después |
|---|---|---|---|
| `balayage-1` | Balayage · Lucía Marín · Balayage | Cabello castaño oscuro, largo, un solo tono, algo apagado | El mismo cabello con balayage miel y caramelo, degradado natural y brillante |
| `balayage-2` | Balayage · Lucía Marín · Balayage | Cabello rubio oscuro con raíz marcada y puntas secas | El mismo cabello con balayage rubio ceniza luminoso, raíz suave |
| `mechas-1` | Mechas · Lucía Marín · Mechas | Cabello castaño medio liso sin matices | El mismo cabello con mechas finas rubio dorado distribuidas por el contorno |
| `color-1` | Color · Carmen Ortega · Color | Cabello con canas visibles y color desigual | El mismo cabello con color cobrizo uniforme y brillo |
| `corte-1` | Corte · Carmen Ortega · Corte mujer | Melena larga sin forma, puntas abiertas | La misma persona con corte en capas a la altura de los hombros, movimiento |
| `corte-2` | Corte · Carmen Ortega · Corte mujer | Media melena pesada y sin volumen | La misma persona con bob desfilado a la mandíbula, ligero |
| `peinado-1` | Peinado · Carmen Ortega · Peinado de evento | Cabello suelto, liso, sin peinar | El mismo cabello con recogido bajo con ondas y trenza lateral para un evento |
| `tratamiento-1` | Tratamiento · Irene Solís · Tratamiento de keratina | Cabello encrespado, voluminoso y mate | El mismo cabello liso, sedoso y con brillo tras el tratamiento de keratina |

Textos alternativos sugeridos: «Antes: <descripción del antes>» y «Después: <descripción del después>».
