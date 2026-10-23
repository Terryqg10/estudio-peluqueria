# Registro de imágenes

Una fila por imagen del proyecto. Sin registro, la imagen no entra (PLAN-001,
sección 5a). Todas las licencias son **VERIFICAR** hasta comprobarlas de nuevo
en la página de origen antes de publicar.

| Archivo | Uso | Origen | Autor | Licencia | Fecha | Notas |
|---|---|---|---|---|---|---|
| `public/images/hero-inicio.jpg` | Hero de la home | [Pexels: Curly Haired Woman with Crocodile Hair Clip](https://www.pexels.com/photo/curly-haired-woman-with-crocodile-hair-clip-7755215/) | RDNE Stock project | Pexels «Free» (atribución no obligatoria; VERIFICAR en [pexels.com/license](https://www.pexels.com/license/)) | 2026-10-19 | Descargada reducida a 2000 px de ancho (`auto=compress&cs=tinysrgb&w=2000`), 2000×1333 px, 224 KB. Original 6720×4480 px |
| `public/images/galeria/galeria-*-antes.jpg` y `-despues.jpg` (16 archivos) | Galería antes/después de la home | Generadas por `scripts/make-gallery-placeholders.mjs` | Proyecto (sin terceros) | Propia: formas y degradados, sin fotos ni material de terceros | 2026-10-22 | **Provisionales**: rotuladas «Imagen provisional». Se sustituyen por imágenes generadas con IA (ver más abajo) antes de publicar |

## Reglas

- Una imagen de banco no se presenta como cliente real del salón ficticio.
- Imágenes generadas con IA (antes/después, T-011): guardar aquí el prompt base
  y marcar `ai_generated` en la BD. Constan como tales en el README.
- Las licencias de banco se anotan con enlace a la página de la foto y a la
  licencia vigente. Si una licencia exige atribución, se muestra en la web.
- Alt obligatorio en cada uso; decorativas con `alt=""`.

## Galería antes/después (T-011)

Hoy hay **8 pares provisionales** (`public/images/galeria/galeria-<técnica>-<n>-antes.jpg` y `-despues.jpg`,
16 KB–21 KB cada una): ilustraciones rotuladas «Imagen provisional», generadas con
`node scripts/make-gallery-placeholders.mjs`. **No son fotos de trabajos reales y se sustituyen antes de publicar.**

### Cómo sustituirlas por imágenes generadas con IA

1. Genera cada par con el prompt de la tabla (misma persona, misma luz y encuadre en las dos imágenes; formato
   4:3, ≥ 1200×900 px; ≤ 120 KB cada una tras comprimir, PLAN-001 5a).
2. Copia los archivos a `public/images/galeria/` con el nombre `galeria-<técnica>-<n>-antes` / `-despues` y la
   extensión real (`.jpg`, `.webp` o `.avif`).
3. Actualiza `before_path`, `after_path`, `alt_before` y `alt_after` de esa fila en `supabase/seed.sql` (en
   producción, en la tabla `gallery_items`) y `pnpm exec supabase db reset` en local. pon `ai_generated` en `true` (la web mostrará «Imagen generada con IA»). En la semilla está en `false` porque las provisionales no son de IA.
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
