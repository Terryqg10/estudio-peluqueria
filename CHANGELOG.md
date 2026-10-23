# Changelog — peluqueria

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/)
y versionado [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Añadido
- T-012: borrado de datos a petición (CA-26) y retención a 24 meses (CA-27) por **anonimización** de las citas (ADR-0030): botón «Borrar mis datos» en la cita por enlace y «Borrar mi cuenta y mis datos» en «Mis citas», con confirmación; las citas futuras se cancelan y la cuenta de Auth se elimina. Función de BD `anonymize_expired_data` y script `pnpm run retention` (se programa en T-013). Columna `anonymized_at` y restricción que garantiza que una cita anonimizada no tiene datos personales. Migración nueva.
- T-011: galería antes/después en la home (CA-02): filtro por técnica con enlaces, estilista y enlace a reservar cada servicio, par apilado en móvil y en columnas en escritorio. Tabla `gallery_items` con RLS. Imágenes **provisionales** (a sustituir por las generadas con IA antes de publicar, ver `docs/imagenes.md`). Migración nueva.
- T-010: chatbot de reglas (CA-21 a CA-24): botón flotante abajo a la derecha en las páginas públicas (no en `/admin`) que abre un diálogo nativo con 4 opciones (Reservar cita, Ver precios, Horarios, Hablar con un humano por WhatsApp). Sin IA, sin red y sin guardar nada. Número de WhatsApp de marcador (VERIFICAR). Sin dependencias nuevas.
- T-009c: horarios semanales del salón y de cada estilista en `/admin/horarios` (CA-38, CA-39, por enmienda de la spec): varios tramos por día, función de BD atómica que rechaza el cambio si deja citas futuras fuera y las lista con enlace a «Mover cita». ADR-0029. Migración nueva. Con esto queda cerrada T-009 (RF-07).
- T-009b: bloqueos de franja y vacaciones del Admin en `/admin/bloqueos` (CA-19, CA-20): una estilista o todas, calendario mensual propio, función de BD atómica que rechaza el bloqueo si hay citas activas y las lista con enlace a «Mover cita». ADR-0028. Migración nueva.
- T-009a: gestión de servicios del Admin en `/admin/servicios` (CA-18): crear, editar y activar o desactivar con sus estilistas, mediante la función de BD atómica `admin_save_service`. Sin borrado (se desactiva). Migración nueva. T-009 queda dividida en T-009a, T-009b (bloqueos y vacaciones) y T-009c (horarios).
- T-019: selector de día y hora más limpio en la reserva, el cambio por enlace y «Mover cita»: semana de 7 días con flechas (hasta 60 días), horas en 3 columnas con bordes suaves, y títulos más grandes. Sin cambios de BD.
- T-008d: pantalla «Mover cita» rediseñada con carrusel de días, horas en píldora y barra inferior fija, y notas para la estilista en una tabla solo del Admin (`appointment_notes`, ADR-0027, enmienda de la spec). Migración nueva.
- T-008c: el Admin mueve y cancela citas desde `/admin/agenda/cita/<id>` (CA-16): tres funciones de BD que exigen `is_admin()`, reutilizan `availability_core` y el bloqueo por estilista y no aplican la ventana de 24 h. Cancelar pide confirmación. Sin aviso a la clienta (T-018) y sin contacto de las clientas con cuenta (T-017). ADR-0026. Migración nueva.
- T-008b: agenda semanal del Admin en `/admin/agenda` (solo lectura, con la RLS y sin `service_role`): cuadrícula por estilista en escritorio, vista de un día en móvil, navegación por semanas con enlaces y detalle con teléfono. Las clientas con cuenta aparecen sin datos de contacto (pendiente). Tests unitarios y e2e `admin-agenda`.
- T-001: base de la interfaz con cabecera sticky, navegación, menú móvil sin JavaScript
  (`:target` y `useHashOverlay`), pie y página `/contacto`. Paleta `#A8456A` validada.
- T-002: Supabase local con esquema de reservas, restricción anti-solape (`tstzrange`), RLS en
  todas las tablas, acceso de invitada por token de 256 bits guardado como hash, semilla
  ficticia, tipos generados y 39 tests de integración. ADR-0009 y ADR-0010.
- T-003: home con hero (imagen AVIF/WebP responsive), servicios con precio «desde» leídos de la
  BD, contacto y titulares en Fraunces. Barrido de anchos y axe sobre todas las páginas
  públicas, y test de imágenes responsive. ADR-0011 y ADR-0012.
- T-004: tabla `stylist_services`, función `get_availability` (huecos cada 15 min en
  `Europe/Madrid`, sin solapes ni bloqueos) y aviso de cambio de disponibilidad por Realtime sin
  datos personales; contrato Zod `getAvailability()` y 19 tests nuevos. ADR-0013 y ADR-0014.
- T-005a: página `/reservar` con selección de servicio, estilista, día (tira de 14 a 60 días) y hora,
  con disponibilidad en vivo (Realtime y sondeo de respaldo), aviso si otra persona ocupa tu hueco y
  búsqueda de próximos días. Botón «Reservar» en la cabecera y por servicio en la home. El flujo
  termina en el resumen; la confirmación llega con T-005b.
- T-005b: reserva de invitada de extremo a extremo. Función de BD `create_booking` (solo `service_role`,
  restricción anti-solape como árbitra), formulario «Tus datos» con consentimiento (fecha y versión) y
  honeypot, página `/reservar/confirmada` sin datos personales y cookie de confirmación `httpOnly`.
  Requiere `SUPABASE_SERVICE_ROLE_KEY` (solo servidor). ADR-0015 y ADR-0016. Aún sin email (T-006) ni
  límites de citas (T-005c).
- T-006a: email de confirmación tras reservar con un enlace personal `/cita/<token>` de solo lectura.
  Adaptador `EmailSender` sin dependencias nuevas (Mailpit local y Resend por variable de entorno), la
  cita se mantiene si falla el envío y la confirmación avisa. Enlace con un único mensaje de «no válido
  o caducado». ADR-0017 y ADR-0018. Aún sin cancelar ni cambiar la cita (T-006b).
- T-006b: cancelar la cita desde `/cita/<token>` con confirmación en línea, solo si faltan ≥ 24 h
  (la BD lo decide; antes, aviso de contactar con el salón). El hueco queda libre. Sin dependencias
  nuevas. La antigua T-006b se divide: cambiar la cita pasa a T-006c y el email de aviso a T-006d.
- T-013a: CI bloqueante en GitHub Actions (RNF-09): calidad (tipos, lint, paleta, audit, unitarios, build), gitleaks,
  integración con el Supabase local del runner y e2e en 4 fragmentos, más un job `CI OK` para usar como
  comprobación obligatoria. El audit aplica de verdad ADR-0008 y ADR-0023 (lista blanca por id y paquete; producción sin
  ningún hallazgo). Corrige la CI de la plantilla (fallaba por no tener `.node-version`) y dos fallos que solo
  aparecían en Linux: un token de prueba marcado por gitleaks 8.24 y una carrera en el e2e de cambio con menos de
  24 h. ADR-0025. Sin dependencias nuevas. Hay que marcar `CI OK` como obligatoria en la protección de `main`.
- T-015: `create_booking` y `reschedule_guest_appointment`
  toman un bloqueo por estilista (`pg_advisory_xact_lock`) antes de comprobar disponibilidad y escribir. Con 6
  peticiones simultáneas al mismo hueco ya no hay deadlock (`40P01`, antes en 8 de 50 rondas, de 4 a 5 s): una
  gana y las demás reciben `SLOT_TAKEN` en milisegundos. Migración nueva, permisos sin cambios, ADR-0024.
- T-014: los tests de tiempo real ya no esperan 1,5 s fijos tras `SUBSCRIBED`: una sonda confirma antes de cada
  test que el canal entrega y, si no, reabre la conexión (hasta 3 intentos) y falla con el historial del canal.
  Sin cambios en producción. La causa del fallo original no se reprodujo. Descubierto el defecto T-015
  (deadlock de `create_booking` bajo reservas simultáneas, ~15 % de las pasadas de integración). ADR-0023
  amplía la excepción de `pnpm audit` a 3 avisos nuevos de `vite` y se agenda T-016 (upgrade de Vitest y Vite).
- T-008a: acceso del Admin al panel `/admin` con el mismo enlace mágico y el rol en BD (`profiles.role`).
  Guardián de servidor (sin sesión → `/acceso`, sin rol → 404) además de la RLS, destino por rol tras entrar,
  panel con `noindex` y sin caché, y `pnpm admin:promote <email> [--revoke] [--local]` para dar o quitar el
  rol (Node, sin shell). ADR-0022. Sin dependencias nuevas. Aún sin herramientas en el panel (T-008b y
  T-008c) y sin segundo factor para el Admin (VERIFICAR antes de un salón real).
- T-007: cuenta de clienta con enlace mágico de Supabase Auth (sin contraseña) y página «Mis citas» de solo
  lectura, con la RLS como única barrera (CA-12). El enlace abre una página con un botón (un antivirus no lo
  gasta), caduca a los 15 min y la respuesta es idéntica exista o no la cuenta. Cupo de 3 envíos por email y
  10 por IP y hora, con hashes con sal. Dependencia nueva: `@supabase/ssr`. ADR-0021. Aún sin «reservar con
  cuenta»; hace falta SMTP de producción (Resend) en Supabase.
- T-006c: cambiar la cita desde `/cita/<token>/cambiar` (estilista, día y hora; mismo servicio), solo si
  faltan ≥ 24 h. Función de BD que mueve la misma cita y conserva el token (caducidad al nuevo inicio),
  con el cálculo de disponibilidad compartido (`availability_core`) y huecos que no cuentan la propia
  cita. ADR-0019. Sin dependencias nuevas; aún sin aviso por email (T-006d).
- T-005c: límites antiabuso de la reserva dentro de `create_booking`: máximo de citas activas por email (3,
  cancelar libera) y de reservas por hora por IP (10), con la IP solo como hash con sal de servidor y
  caducidad en horas (`rate_limits`). Mensajes claros en el formulario. ADR-0020 y enmienda de RF-10/CA-29.
  Sin dependencias nuevas; hace falta `RATE_LIMIT_SALT` en producción.
- Registro de imágenes en `docs/imagenes.md` y Lighthouse como devDependency.

### Cambiado
- Puertos del Supabase local movidos +100 (API 54421, BD 54422, Studio 54423, Mailpit 54424…, y `site_url`
  a `127.0.0.1:3100`) para poder tener a la vez otro proyecto con Supabase local. El Mailpit por defecto del
  código pasa a `54424`. Hay que actualizar `NEXT_PUBLIC_SUPABASE_URL` en `.env.local` a `http://127.0.0.1:54421`.
- Spec `SPEC-001` aprobada y enmendada (estados de cita, token de invitada, RNF-13, CA-36 y
  CA-37). Plan `PLAN-001` aprobado.

### Seguridad
- ADR-0008: excepción con caducidad de `pnpm audit` para devDependencies de la plantilla.

## [0.1.0] — YYYY-MM-DD

### Añadido
- Instanciado desde web-os.
- Constitución del OS.
- Estructura SDD.
- Estilos disponibles v1-v4.
- Plantilla de Next.js, TypeScript, Tailwind, Motion.
- CI mínima (typecheck, lint, tests, build, gitleaks, audit).
