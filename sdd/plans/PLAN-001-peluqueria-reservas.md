---
id: PLAN-001-peluqueria-reservas
spec: SPEC-001-peluqueria-reservas
rigor_level: L
style: v1-soft-commerce@0.5.0
palette:
  source: sector
  mode: claro
  seed: "#A8456A"
  approved_by: user
  checked: "check-palette OK, 2026-10-19 (14 tokens, 20 pares)"
deploy: vercel
status: aprobada
created: 2026-10-19
updated: 2026-10-19
---

# PLAN-001 — Web de peluquería de mujer con reserva en tiempo real y chatbot de reglas

> Nota de versión de estilo: `design/styles/index.md` lista v1 como
> `borrador 0.3.0`, pero `design/styles/v1-soft-commerce/style.md` declara
> `version: 0.5.0`. Se toma la del propio estilo (0.5.0). VERIFICAR que el
> registro está desactualizado.

## 1. Resumen técnico

Aplicación Next.js (App Router) con Supabase (Postgres, Auth, RLS, Realtime)
desplegada en Vercel. La web pública es mayormente de servidor; la reserva y
el panel Admin son interactivos. La disponibilidad se calcula en la base de
datos y la no solapación de citas la garantiza una restricción de exclusión.
El chatbot es un componente React de reglas, sin dependencias externas ni
estado persistente. El email pasa por un adaptador intercambiable por
variable de entorno.

## 2. Arquitectura

| Capa | Decisión |
|---|---|
| Framework | Next.js App Router, TypeScript estricto, Tailwind 4 con los tokens de v1 y la `palette.css` |
| Datos | Supabase Postgres. Migraciones versionadas en `supabase/migrations/`. Tipos generados con `pnpm db:types` |
| Auth | Supabase Auth para cuentas de clienta y Admin. Rol en tabla propia (`profiles.role`), no editable por el usuario |
| Invitadas | Sin sesión. Gestión mediante token propio de un solo propósito (ver Contratos y ADR-A) |
| Mutaciones | Server Actions o Route Handlers validados con Zod. La reserva se hace con una función de BD transaccional |
| Disponibilidad pública | Función `get_availability` (`security definer`) que devuelve solo franjas, nunca datos de personas |
| Tiempo real | Actualización de la disponibilidad al cambiar las citas: Supabase Realtime con *broadcast* o sondeo corto como alternativa. Elección y N segundos máximos en ADR-B |
| Email | `src/lib/email/` con interfaz `EmailSender`. Implementaciones: `mailpit` (desarrollo) y `resend`/`sendgrid` (producción). Se elige por `EMAIL_PROVIDER` |
| Chatbot | `src/components/chatbot/`. Árbol de decisiones como datos tipados; sin red, sin almacenamiento |
| Admin | Rutas bajo `/admin`, protegidas en servidor y por RLS |
| Zona horaria | UTC en BD; presentación y cálculo de franjas en `Europe/Madrid` |
| Keep-alive | `.github/workflows/keep-alive.yml`, cron semanal, petición ligera a la BD con secretos de GitHub |
| Entornos | Local con Supabase CLI (Docker, bandeja Mailpit/Inbucket). Producción en Supabase gratuito |

Estructura prevista (se concreta tarea a tarea):

```
src/app/(public)/...        web pública y reserva
src/app/(cuenta)/...        mis citas
src/app/admin/...           panel Admin
src/lib/{supabase,email,availability,whatsapp}/
src/components/...
supabase/migrations/        esquema, RLS, funciones
supabase/seed.sql           datos de prueba (VERIFICAR)
```

## 3. Modelo de datos

Todas las tablas con datos de usuarios tienen RLS con políticas explícitas de
select, insert, update y delete. Los tipos TypeScript se generan desde la BD.

| Tabla | Campos principales | Notas |
|---|---|---|
| `profiles` | `id` (= auth.users), `role` (`clienta`/`admin`), `full_name`, `phone` | Rol solo modificable por servicio |
| `stylists` | `id`, `name`, `specialty`, `bio`, `active` | 3 ficticias en semilla |
| `services` | `id`, `category`, `name`, `price_from_cents`, `duration_min`, `active` | Precio "desde" |
| `stylist_services` | `stylist_id`, `service_id` | Qué hace cada estilista |
| `salon_hours` | `weekday` (ISO 1–7), `opens`, `closes` | Horario del salón (T-002) |
| `stylist_schedule` | `stylist_id`, `weekday`, `starts`, `ends` | Horario semanal de cada estilista (T-002; antes `working_hours`) |
| `time_blocks` | `stylist_id`, `during` (tstzrange), `kind` (`vacation`/`break`/`block`), `note` | Vacaciones, descansos y bloqueos (T-002; antes `time_off`) |
| `appointments` | `id`, `stylist_id`, `service_id`, `during` (tstzrange), `status`, `customer_id` (nullable), `guest_name`, `guest_email`, `guest_phone`, `consent_at`, `consent_version`, `created_at` | Ver restricción |
| `appointment_tokens` | `appointment_id`, `token_hash`, `expires_at`, `used_at` | Solo hash |
| `gallery_items` | `id`, `technique`, `service_id`, `stylist_id`, `before_path`, `after_path`, `alt_before`, `alt_after`, `ai_generated` | Imágenes de IA marcadas como tales |
| `rate_limits` | `key_hash`, `window_start`, `count` | Límite por email/IP con TTL corto |

**Restricción clave (RF-03):** extensión `btree_gist` y
`EXCLUDE USING gist (stylist_id WITH =, during WITH &&) WHERE (status IN ('confirmada','completada','no_asistio'))`.
Las canceladas no bloquean.

**Modelo de estados:** `status` como enum `confirmada | completada | cancelada | no_asistio`
con las transiciones de la sección 7 de la spec aplicadas en una función de BD.

**RLS (resumen):**

| Tabla | Anónimo | Clienta | Admin |
|---|---|---|---|
| `services`, `stylists`, `gallery_items` (activos) | select | select | todo |
| `appointments` | nada (la reserva entra por función) | select/update de las suyas según reglas | todo |
| `appointment_tokens`, `rate_limits` | nada | nada | nada (solo funciones de servidor) |
| `working_hours`, `time_off` | nada | nada | todo |
| `profiles` | nada | la suya (sin cambiar `role`) | todo |

## 4. Contratos

Esquemas Zod en `src/lib/schemas/`; los tipos se derivan con `z.infer`.

| Contrato | Entrada | Salida | Errores |
|---|---|---|---|
| `getAvailability` | `serviceId`, `stylistId?`, `date` (Europe/Madrid) | Lista de inicios libres por estilista | `INVALID_INPUT` |
| `createAppointment` | `serviceId`, `stylistId`, `startsAt`, `guest{name,email,phone}` o sesión, `consent`, `honeypot` | `appointmentId` (+ aviso de email) | `SLOT_TAKEN` (con alternativas), `RATE_LIMITED`, `INVALID_INPUT`, `OUT_OF_WINDOW` |
| `manageAppointment` | `token` o sesión, `action` (`cancel`/`reschedule`), `newStart?` | cita actualizada | `INVALID_TOKEN`, `TOO_LATE` (< 24 h), `SLOT_TAKEN` |
| `adminAppointmentUpdate` | cita, cambios | cita actualizada | `FORBIDDEN`, `SLOT_TAKEN` |
| `adminServices`, `adminTimeOff` | CRUD validado | filas | `FORBIDDEN`, `CONFLICT` (citas afectadas) |
| `EmailSender.send` | destinatario, plantilla, datos | resultado | fallo registrado, no bloquea la cita |
| Chatbot | n/a | árbol `ChatNode[]` tipado, sin red | n/a |

**Gestión de la invitada (decisión provisional):** token aleatorio de ≥ 256 bits,
guardado como hash, con caducidad; el enlace es `/cita/<token>`. Alternativa:
Supabase Auth con enlace OTP. Se decide con ADR-A antes de implementar.
> Admin: acceso por el mismo enlace mágico con el rol en BD (ADR-0022, T-008a).
> Resuelto: la **cuenta de clienta** usa enlace mágico de Supabase Auth con SMTP propio (ADR-0021, T-007);
> la **invitada** conserva el token propio (ADR-0009).

## 5. UI

- Estilo `v1-soft-commerce` para toda la aplicación, incluido el panel Admin.
- Móvil primero. Breakpoints `--bp-sm 640`, `--bp-md 768`, `--bp-lg 1024`, `--bp-xl 1280`.
- Solo nombres de token. Sin hex, `rgb()`, `hsl()` ni valores arbitrarios en componentes.
- Cabecera sticky con logo que enlaza a `/`. Navegación sin numeraciones. Menú móvil con `text-2xl`/`text-3xl`, no `text-display`.
- Menú móvil con fallback sin JS: disparador `<a href="#menu-movil">` y `:target`, más un hook cliente que sincroniza el hash (ver notas técnicas).
- Enlaces sin subrayado del navegador; color `accent-text` y transición en hover.
- Menús y orden del DOM igual al visual (sin `flex-row-reverse` ni `order`).
- Navegación inicial: Inicio, Servicios, Galería, Equipo, Contacto y CTA Reservar. Cada elemento se añade cuando existe su página; **no hay enlaces `#` ni rutas sin destino**.
- Enlaces legales (privacidad, aviso legal) se añaden cuando exista texto revisado legalmente (VERIFICAR); no se inventan.
- Panel Admin: agenda semanal en cuadrícula por estilista y tablas limpias bajo los mismos tokens.
- Chatbot: botón flotante inferior derecha, diálogo con rol y nombre accesibles, cierre con Esc y clic fuera, foco devuelto al botón, 44×44 px, animación con alternativa bajo `prefers-reduced-motion`.

## 5a. Dirección visual

| Aspecto | Qué |
|---|---|
| Tipo de imágenes | Mixto: banco de imágenes (ambiente, equipo, hero) e imágenes generadas con IA (antes/después). Iconos SVG (lucide-react) |
| Origen | Gratis con atribución (Unsplash/Pexels) y generadas con IA. No hay imágenes propias |
| Dónde van | Hero, servicios (fotos de apoyo), galería antes/después, equipo, contacto |
| Estilo visual | Minimalista editorial suave: mucho aire, fotografía grande, luz natural, tonos cálidos que respetan el rosa malva. Titular serif de contraste frente a Geist (fuente concreta a decidir en T-001 o ADR; DECISIÓN PENDIENTE) |
| Presupuesto de peso | Hero ≤ 200 KB, imágenes de galería ≤ 120 KB cada una, miniaturas ≤ 40 KB (VERIFICAR contra Lighthouse) |
| Formatos | AVIF/WebP con fallback JPG para imágenes grandes; SVG para iconos |
| Alt obligatorio | Sí, siempre. En antes/después, un alt por imagen que describa técnica y resultado |
| Nombre de archivos | `hero-inicio.avif`, `equipo-<slug>-01.avif`, `galeria-<tecnica>-<n>-antes.avif` / `-despues.avif` |

Transparencia: las imágenes antes/después son generadas con IA y se declara
en el README y en la ficha del portfolio; no se presentan como clientas
reales.

### Imágenes responsive (RNF-13, ADR-0011)

Toda imagen de contenido cumple, sin excepciones:

| Regla | Detalle |
|---|---|
| Componente | `next/image`, que genera `srcset` y formatos AVIF/WebP. Nunca `<img>` suelto, salvo el `<img>` de la imagen LCP del hero (ver notas técnicas) |
| Dimensiones | `width` y `height`, o `fill` dentro de un contenedor con `aspect-ratio` reservado. Objetivo: CLS ≤ 0,1 |
| `sizes` | Siempre explícito y acorde con el layout (por ejemplo `100vw` en móvil y fracción del contenedor en escritorio). Sin `sizes`, el navegador descarga la más grande |
| Alt | Obligatorio. Decorativas: `alt=""` |
| Hero | Composición propia en móvil (imagen arriba y texto abajo, como indica v1) y recorte con `object-position` pensado para 320-1280 px. Solo la imagen LCP lleva `fetchPriority="high"` |
| Galería antes/después | Relación de aspecto fija por par; el par se apila en móvil y va en columnas desde `--bp-md` |
| Desborde | Ninguna imagen se sale del viewport entre 320 y 1280 px |
| Peso | Según el presupuesto de la tabla de arriba, medido en móvil |
| Evidencia | Test e2e `imagenes-responsive` (CA-36) y barrido de 18 anchos sobre todas las páginas (CA-37) |

### Verificación

- Todas las secciones que mencionan imagen tienen su entrada en esta tabla.
- Origen "gratis con atribución": se lleva un registro de autor, fuente y licencia por imagen (`docs/imagenes.md`, a crear en la primera tarea que añada imágenes). VERIFICAR licencia vigente en cada una.
- Origen "generamos con IA": el prompt base se guarda junto a la imagen o en `docs/imagenes.md`.
- Bloque de atribución visible en la web cuando la licencia lo requiera.

## 5b. Decisiones de UI

| Decisión | Convención del sector | Por qué nos apartamos | Qué gana el usuario |
|---|---|---|---|
| Un único estilo (v1) también para el panel Admin | Panel de administración con estilo denso tipo v4 (sidebar fija y filas tabulares) | Un portfolio de un solo producto: dos lenguajes visuales romperían la coherencia. El panel usa los mismos tokens con tablas y rejilla limpias | Producto coherente; el Admin no cambia de «mundo» visual. Reversible: v4 puede aplicarse al panel por ADR |
| Botón flotante del chat también en escritorio | Los FAB de llamar o reservar solo en móvil | No es un FAB de llamar ni de reservar: es la convención de chat de servicios. No tapa contenido esencial y su posición no cambia | Ayuda disponible en cualquier pantalla. Reversible |
| Reserva con servicio como primer paso (no elegir salón ni fecha) | Cadenas: buscar salón primero | Es un solo salón; el informe señala la fricción de elegir local o fecha antes del servicio | Menos pasos; la clienta que sabe qué quiere llega antes |
| Precios "desde" visibles | Las webs propias del sector no publican precios | Decisión de diferenciación del informe (hueco frente a marketplaces) | Quita la llamada previa |
| La reserva (`/reservar`) exige JavaScript | Un formulario de reserva debería degradar sin JS | La selección de hueco depende de disponibilidad en vivo (Realtime y sondeo) y de estado de cliente; un fallback estático mostraría huecos desactualizados. La spec (sección 5) ya lo admite y se avisa con `<noscript>` y enlace a contacto | Disponibilidad siempre actual y feedback inmediato. Reversible: una versión por formulario `GET` sería una tarea aparte |
| Tira de días con desplazamiento horizontal (carrusel) | Calendario mensual | Coincide con la convención de marketplaces (Fresha, Treatwell) y rinde mejor en 320 px; el desbordamiento es deliberado (`overflow-x-auto` y `data-allow-overflow`) | Menos pasos para elegir día; ventana de 60 días ampliable con «Más fechas» |
| Sin reseñas hasta que existan verificadas | Reseñas visibles en marketplaces | No se publican reseñas inventadas | Confianza real; se añaden cuando el flujo las genere |

## 6. Estrategia de tests

Nivel L: M más tests de integración con BD real, CI bloqueante y ADR por cada decisión nueva.

| Capa | Herramienta | Qué cubre |
|---|---|---|
| Unitarios | Vitest | Cálculo de disponibilidad, ventanas (2 h, 24 h, 60 días), cambios de hora, esquemas Zod, adaptador de email, honeypot |
| Componentes | Vitest + Testing Library | Chatbot (árbol, WhatsApp, foco, Esc), menú móvil, formularios |
| Integración con BD real | Vitest contra Supabase local | Restricción de exclusión, reserva concurrente, RLS de aislamiento (clienta A/B, anónimo, admin), borrado y retención, límites |
| e2e | Playwright | Flujo principal de reserva, gestión por enlace, panel Admin, chatbot, navegación móvil |
| Responsive | `tests/responsive.spec.ts` | 18 anchos entre 320 y 1280 px |
| Accesibilidad | axe (`pnpm test:a11y`) | Sin violaciones graves; foco, táctil, reduced-motion |
| Estilo | `check-palette` | 14 tokens, 20 pares; sin hex en componentes |
| Seguridad | gitleaks, `pnpm audit --audit-level=high` | Sin secretos ni vulnerabilidades altas |
| Rendimiento | Lighthouse | ≥ 90 en rendimiento y accesibilidad en home y reserva (VERIFICAR) |
| CI | GitHub Actions | Todo lo anterior, bloqueante |

## 7. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Supabase gratuito se pausa por inactividad | media | alto | Keep-alive semanal (RNF-10). VERIFICAR si cuenta como actividad |
| Supabase CLI y Docker en Windows | media | medio | Probar en T-002; documentar alternativa (proyecto de pruebas en la nube) |
| Doble reserva por concurrencia | media | alto | Restricción de exclusión y prueba de concurrencia |
| Invitada pierde el email | media | bajo | Riesgo aceptado; contacto con el salón |
| Enlace mágico filtrado o adivinado | baja | alto | Token de ≥ 256 bits, solo hash, caducidad |
| Spam de reservas | media | medio | Honeypot, límites por email e IP, rate limit |
| Cálculo de franjas incorrecto en cambio de hora | media | medio | Pruebas unitarias con fechas de cambio |
| Plazo de anonimización incorrecto o texto legal inventado | media | alto | Marcado VERIFICAR; no se publican textos legales sin revisión |
| Imágenes de IA confundidas con resultados reales | media | medio | Transparencia en README y portfolio |
| Fallo de email en producción | media | medio | La cita no depende del email; error registrado |
| Licencias de imágenes | media | medio | Registro por imagen en `docs/imagenes.md` |
| Alcance excesivo del portfolio | alta | medio | Tareas atómicas; DIF-02 y reseñas fuera |

## 8. ADRs relacionados

Se crean con `/decide` cuando se aborden, antes de implementar cada pieza:

- **Decididos en T-002:** ADR-A → `sdd/adrs/ADR-0009-reserva-invitada-y-rls.md`
  (token de 256 bits con hash y funciones `security definer`); ADR-E →
  `sdd/adrs/ADR-0010-estados-de-cita.md` (enum en inglés con `pending`).
- ~~ADR-A — Gestión de cita de invitada: token propio con hash vs Supabase OTP.~~
- ADR-B — Disponibilidad en tiempo real: Realtime/broadcast vs sondeo, y N segundos.
- ADR-C — Proveedor de email de producción (Resend vs SendGrid) y tope de envíos.
- ADR-D — Tipografía serif de titulares.
- ADR-E — Modelo de estados de cita (persistir `pendiente` o no).
- ADR-F — Retención y anonimización (plazo, mecanismo, texto legal).
- ADR-G — Keep-alive de Supabase (qué petición cuenta como actividad).

## 9. Tareas derivadas

Propuesta de orden (cada una es atómica y se crea con `/new-task`):

| Tarea | Contenido | CA principales |
|---|---|---|
| **T-001** | Base de la interfaz: tokens, layout, cabecera sticky, navegación y menú móvil, pie, chatbot no incluido | CA-31 a CA-34 |
| T-002 | Supabase local, esquema, RLS, semilla y tipos | base de CA-09, CA-12, CA-17 |
| T-003 | Servicios y home (hero, contacto) | CA-01, CA-03, CA-04 |
| T-004 | Disponibilidad: `stylist_services`, `get_availability` y señal en tiempo real (capa de datos y contrato de servidor). ADR-0013, ADR-0014 | CA-06; infraestructura de CA-07 |
| T-005a | Selección de hueco en `/reservar`: servicio → estilista → día y hora, suscripción al canal `availability` con sondeo de respaldo, y botón «Reservar» por servicio (UI) | CA-05, CA-07, cierre de CA-01 |
| T-005b | Reserva transaccional: `create_booking` (solo `service_role`, ADR-0015), formulario de invitada con consentimiento y honeypot (ADR-0016) y confirmación en `/reservar/confirmada` | CA-08, CA-10, CA-25, CA-28 (y CA-09 ya en T-002) |
| T-005c | Límite de citas activas por email e IP (`rate_limits`, IP en hash, ADR-0016) | CA-29 |

> Nota (2026-10-20): la antigua T-005 se divide en T-005a y T-005b, y la antigua «T-004 función y UI»
> se reparte entre T-004 (datos) y T-005a (interfaz), para no mezclar capas. Se conserva la
> numeración posterior para no romper las referencias de ADRs y reviews.
| T-006a | Adaptador `EmailSender` (Mailpit local y Resend por variable, ADR-0017), envío de la confirmación tras reservar con token y enlace `/cita/<token>` de solo lectura (ADR-0018) | CA-11, CA-30 |
| T-006b | Cancelar la cita desde el enlace (≥ 24 h) con `cancel_guest_appointment` | CA-13, CA-14 (parte cancelar) |
| T-006c | Cambiar la cita desde el enlace (día, hora, estilista; mismo servicio) con función de BD de reprogramación | CA-14 (parte cambiar) |
| T-006d | Email de aviso tras cancelar o cambiar (pendiente; requiere enmienda de spec) | — |
| T-007 | Cuenta de clienta con enlace mágico (ADR-0021) y «mis citas» de solo lectura. Reservar con cuenta queda para otra tarea | CA-12 |
| T-008a | Acceso del Admin (mismo enlace mágico, rol en BD, guardián de servidor y RLS, script de alta) y protección de `/admin`. ADR-0022 | CA-17 |
| T-008b | Agenda semanal por estilista, solo lectura: cuadrícula ≥ 1280 px y vista de un día en móvil, navegación por URL | CA-15 |
| T-008c | Modificar y cancelar citas desde el panel, sin ventana de 24 h: funciones de BD del Admin y pantalla por cita. ADR-0026 | CA-16 |
| T-017 | Datos de contacto de las clientas con cuenta en el panel (borrador) | — |
| T-018 | Aviso por email cuando el Admin mueve o cancela una cita (borrador) | — |
| T-009 | Admin: servicios, horarios, vacaciones, bloqueos | CA-18 a CA-20 |
| T-010 | Chatbot de reglas | CA-21 a CA-24 |
| T-011 | Galería antes/después | CA-02 |
| T-012 | Privacidad, antiabuso y retención | CA-25 a CA-29 |
| T-013a | CI bloqueante en GitHub Actions: Supabase local en el runner, audit con lista blanca (ADR-0008 y ADR-0023) y e2e en 4 fragmentos. ADR-0025 | RNF-09 |
| T-013b | Keep-alive semanal de Supabase (necesita el proyecto alojado y secretos de GitHub; borrador) | CA-35 |
| T-014 | Estabilizar los tests de tiempo-real (flaky bajo carga; anotada al cerrar T-005c) | — |
| T-015 | Deadlock de `create_booking` y la reprogramación bajo reservas simultáneas al mismo hueco (defecto; borrador) | CA-08 |
| T-016 | Mantenimiento: actualizar Vitest y Vite y cerrar la excepción de `pnpm audit` (ADR-0008 y ADR-0023); antes de publicar | — |

## 10. Notas técnicas

### Fallback sin JavaScript con hash

Menú móvil: el disparador es `<a href="#menu-movil">` y el panel se muestra
por CSS `:target`. Con JS, un hook cliente (`useHashOverlay`) sincroniza el
estado de React con el hash. El mismo hook se reutiliza en todo overlay del
proyecto. El hash es específico (`#menu-movil`, `#cerrar-menu`), nunca `#`.

### `loading.tsx` incompatible con no-JS

No se usa `loading.tsx` en la web pública; el feedback de carga se hace con
Suspense manual. La reserva exige JS y así se avisa; la navegación y el
contenido informativo no.

### `priority` de Next 16.4 obsoleto en `<Image>`

La imagen LCP del hero lleva `fetchPriority="high"` y `loading="eager"`
directamente en el `<img>` subyacente, solo en esa imagen.

### Datos de prueba (VERIFICAR, ficticios)

**Estilistas** (nombres ficticios; VERIFICAR que no coinciden con personas reales):

| Nombre | Especialidad |
|---|---|
| Lucía Marín | Color, mechas y balayage |
| Carmen Ortega | Corte y peinado |
| Irene Solís | Tratamientos y eventos |

**Servicios** (precios "desde" y duraciones estimadas, ficticios):

| Servicio | Categoría | Desde | Duración |
|---|---|---|---|
| Corte mujer | Corte y peinado | 25 € | 45 min |
| Peinado | Corte y peinado | 20 € | 30 min |
| Peinado de evento | Corte y peinado | 45 € | 60 min |
| Color | Color | 45 € | 90 min |
| Mechas | Color | 70 € | 150 min |
| Balayage | Color | 110 € | 180 min |
| Tratamiento de keratina | Tratamientos | 90 € | 150 min |
| Tratamiento hidratante | Tratamientos | 18 € | 30 min |

**Contacto y horario:** WhatsApp marcador `+34 600 000 000` (VERIFICAR,
sustituir al publicar). Horario de semilla: L–V 10:00–20:00, sábado
10:00–14:00 (VERIFICAR). Dirección y teléfono ficticios.
