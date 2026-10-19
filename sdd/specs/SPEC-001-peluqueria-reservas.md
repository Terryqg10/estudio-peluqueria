---
id: SPEC-001-peluqueria-reservas
title: Web de peluquería de mujer con reserva en tiempo real y chatbot de reglas
status: aprobada
rigor_level: L
created: 2026-10-19
updated: 2026-10-19
---

# SPEC-001 — Web de peluquería de mujer con reserva en tiempo real y chatbot de reglas

> Contexto: proyecto de portfolio (destino final: terryq.com). El salón es
> ficticio, con marca propia. Todos los datos de negocio (precios, horarios,
> teléfono, estilistas) son datos de semilla marcados **VERIFICAR**; se
> sustituyen cuando el negocio sea real. Fuente del análisis de sector:
> `sdd/explorations/EXP-001-informe-peluquerias/notes.md`.

## 1. Objetivos

1. Web pública de un único salón de peluquería de mujer que junta lo que hoy
   está separado: **precio claro y reserva directa** (marketplaces) con
   **resultados y equipo reales** (cadenas).
2. Reserva de cita eligiendo servicio, estilista, día y hora, con
   **disponibilidad en tiempo real** y sin dobles reservas garantizadas por la
   base de datos.
3. Reserva **como invitada** (sin contraseña) o con cuenta; gestión de la cita
   mediante enlace mágico por email.
4. Panel **Admin** privado: agenda de las 3 estilistas, gestión de citas,
   servicios, horarios, vacaciones y bloqueos.
5. **Chatbot de reglas** (sin IA, sin coste) como atención al cliente.
6. Demostrar ingeniería sólida (autenticación, RLS, concurrencia, CI
   bloqueante, accesibilidad) como proyecto estrella de portfolio.

## 2. Fuera de alcance

| # | Fuera de alcance | Motivo |
|---|---|---|
| 1 | Pagos online o señal de reserva | Pasarela, devoluciones y términos legales; la cita se reserva sin cobro |
| 2 | IA en el chatbot y diagnóstico con fotos | El chatbot es de reglas; las fotos añaden datos personales y almacenamiento. Futuro vía ADR |
| 3 | Varios salones, varios idiomas, app nativa | Un salón, español, web responsive |
| 4 | Tienda de producto, blog, newsletter, recordatorios automáticos por email/SMS | No son el núcleo; los recordatorios implican proveedor y coste |
| 5 | Diagnóstico online con duración y precio estimados (DIF-02) | Requiere motor de reglas complejo. Si se hace, será formulario aparte en `/reservar`, con su propia spec |
| 6 | Reseñas de clientas (DIF-05) | No se publican reseñas inventadas. Solo podrían existir reseñas verificadas de citas completadas; no entran en esta spec |
| 7 | Recordatorio de "tu próxima cita" (DIF-07) | Depende de envío automático de emails |

## 3. Requisitos funcionales

Roles: **Invitada** (sin sesión), **Clienta** (con cuenta; solo ve sus citas),
**Admin** (dueña o gerente).

| ID | Requisito |
|---|---|
| RF-01 | **Web pública.** Home con hero (h1 y CTA), servicios agrupados por categoría con precio "desde" y duración, galería antes/después filtrable por técnica, equipo (3 estilistas con especialidad), y dirección, teléfono y horario visibles en la home |
| RF-02 | **Reserva en un solo flujo** cuyo primer paso es elegir servicio, después estilista, día y hora. Solo se ofrecen huecos libres en los que cabe la duración del servicio. Disponibilidad en tiempo real |
| RF-03 | **Sin doble reserva.** Dos citas activas de la misma estilista no pueden solaparse; la garantía vive en la base de datos, no en la interfaz |
| RF-04 | **Invitada o cuenta.** Se puede reservar como invitada (nombre, email y teléfono) o con cuenta. Al confirmar se envía un email con enlace mágico para gestionar la cita, sin contraseña. La clienta con cuenta solo ve sus propias citas |
| RF-05 | **Cancelar y cambiar.** La clienta puede cancelar o cambiar su cita hasta 24 h antes desde su enlace. Después, solo el Admin |
| RF-06 | **Agenda Admin.** El Admin ve la agenda completa (semanal, por estilista) con todas las citas, de invitadas y de cuentas, y puede modificarlas o cancelarlas |
| RF-07 | **Gestión Admin de servicios y horarios.** CRUD de servicios (nombre, categoría, precio "desde", duración, activo). Gestión de horarios de cada estilista, vacaciones (día completo o rango) y bloqueos de franja (p. ej. 14:00–16:00). La disponibilidad se calcula con ello |
| RF-08 | **Chatbot de reglas.** Botón flotante abajo a la derecha (también en escritorio) que abre una ventana de chat con árbol de decisiones: saludo con 4 botones (Reservar cita, Ver precios, Horarios, Hablar con un humano). Cada opción da una respuesta predefinida y ofrece volver al menú. "Hablar con un humano" abre WhatsApp. Sin IA, sin dependencias externas, sin guardar datos |
| RF-09 | **Privacidad.** Consentimiento explícito al reservar, enlace a la política de privacidad, borrado de datos a petición y anonimización automática de datos personales a los 24 meses de la última cita (plazo VERIFICAR) |
| RF-10 | **Antiabuso.** Campo trampa (honeypot) y límite de citas activas por email y por IP en la reserva de invitadas |
| RF-11 | **Email transaccional intercambiable.** Envío a través de un adaptador. En desarrollo usa la bandeja local (Mailpit/Inbucket); en producción, un proveedor real (Resend o SendGrid) seleccionable solo con variables de entorno |
| RF-12 | **Estructura base de la interfaz.** Cabecera sticky con logo que enlaza a `/`, navegación con comportamiento móvil declarado, pie de página, y uso exclusivo de tokens del estilo v1 y de la paleta del proyecto |

## 4. Requisitos no funcionales

| ID | Requisito |
|---|---|
| RNF-01 | **Stack:** Next.js (App Router), TypeScript estricto (sin `any`, `@ts-ignore`, `as unknown as`), Tailwind, Supabase (Postgres, Auth, RLS), pnpm, Vitest, Testing Library, Playwright. Despliegue en Vercel |
| RNF-02 | **Validación:** todo input externo se valida con Zod en el límite; los tipos salen de los esquemas. Tipos de BD generados, no escritos a mano |
| RNF-03 | **Seguridad de datos:** RLS definida antes de consumir datos, con políticas explícitas de select, insert, update y delete, y prueba de aislamiento entre clientas y rol Admin |
| RNF-04 | **Secretos:** ninguna clave en el repo. `.env*` fuera de git; la clave de servicio solo en servidor |
| RNF-05 | **Accesibilidad:** WCAG AA como suelo; foco visible; áreas táctiles ≥ 44×44 px; texto ≥ 12 px; `prefers-reduced-motion` con alternativa estática; axe sin violaciones graves |
| RNF-06 | **Responsive:** móvil primero; 320–1280 px sin scroll horizontal ni elementos cortados; verificado por `tests/responsive.spec.ts` (18 anchos) |
| RNF-07 | **Rendimiento:** Lighthouse de rendimiento y accesibilidad ≥ 90 en home y reserva (VERIFICAR el umbral exacto en el plan) |
| RNF-08 | **Zona horaria:** todas las horas se guardan en UTC y se muestran en `Europe/Madrid`, incluidos los cambios de hora de verano |
| RNF-09 | **CI bloqueante** en GitHub Actions: typecheck, lint, tests unitarios, tests de integración con BD real, build, gitleaks y audit. Un fallo bloquea la fusión |
| RNF-10 | **Keep-alive de Supabase:** un GitHub Action programado (cron semanal) hace una petición a la base de datos para evitar la pausa del proyecto gratuito. La URL y la clave pública viven en GitHub Secrets, nunca en el repo. Que una petición cuente como actividad para evitar la pausa es **VERIFICAR** |
| RNF-11 | **Scripts** cross-platform (Node/TS), sin sh/bash. Servicios locales con Supabase CLI (requiere Docker, VERIFICAR en Windows) |
| RNF-12 | **Idioma:** español de España. Sin numeraciones en menús, sin subrayado genérico en enlaces, sin FAB de llamar o reservar en escritorio |

## 5. Casos límite

| Caso | Comportamiento esperado |
|---|---|
| Dos personas reservan el mismo hueco a la vez | Una confirma; la otra recibe "ese hueco ya no está disponible" y se le ofrecen los siguientes libres. Sin cita duplicada |
| Servicio de 150 min con solo 90 min libres antes de un bloqueo | El hueco no se ofrece |
| Hueco ocupado por una cita cancelada | Vuelve a estar disponible |
| Reserva con menos de 2 h de antelación o a más de 60 días (VERIFICAR) | No se ofrece |
| Cambio de hora (último domingo de marzo y octubre) | Las franjas se calculan en `Europe/Madrid` sin saltos ni duplicados |
| Admin bloquea una franja donde ya hay una cita | El sistema avisa del conflicto y exige resolver la cita (mover o cancelar) antes de aplicar el bloqueo |
| Admin desactiva un servicio con citas futuras | Las citas existentes se mantienen; el servicio deja de ofrecerse |
| Estilista de vacaciones | No aparece con huecos esos días; las citas previas en esos días obligan a resolución como arriba |
| Email o teléfono con formato inválido | Error de validación con mensaje, sin crear cita |
| Honeypot relleno | Se rechaza sin pista visible para el bot |
| Misma persona intenta superar el máximo de citas activas | Se rechaza con mensaje claro |
| Invitada pierde el email | No puede gestionar su cita por sí misma; puede contactar con el salón (riesgo aceptado, ver sección 8) |
| Enlace mágico caducado, usado o manipulado | Mensaje de enlace no válido; no revela si la cita existe |
| Cancelación con menos de 24 h por la clienta | Rechazada; se indica contactar con el salón |
| Falla el envío de email | La cita se crea igualmente; el error se registra y se informa a la clienta en pantalla de confirmación |
| Supabase no disponible | Pantalla de error con reintento; el chatbot y las páginas informativas siguen funcionando |
| JavaScript desactivado | La web pública, el menú y la navegación funcionan; la reserva exige JS (se avisa) |

## 6. Estados de error y vacío en la UI

| Pantalla / flujo | Vacío | Cargando | Error |
|---|---|---|---|
| Servicios | "Aún no hay servicios disponibles" con contacto | Esqueleto de tarjetas | Mensaje con reintento; contacto visible |
| Galería | "Pronto añadiremos trabajos" | Esqueleto con proporción fija | Imagen rota: se mantiene el hueco con texto alternativo |
| Selección de hueco | "Sin huecos libres este día", con próximos días disponibles | Indicador en el calendario | Mensaje con reintento; no se muestran huecos desactualizados |
| Confirmación de reserva | n/a | Botón en estado de envío, deshabilitado | Hueco ocupado, validación por campo, error de servidor |
| Gestión de cita (enlace) | Enlace no válido o caducado | Esqueleto | Mensaje genérico sin revelar datos |
| Mis citas (clienta) | "No tienes citas" con CTA Reservar | Esqueleto | Mensaje con reintento |
| Agenda Admin | "Sin citas esta semana" | Esqueleto de cuadrícula | Mensaje con reintento; datos previos no se muestran como actuales |
| Gestión de servicios/horarios | "Aún no hay servicios" con CTA Añadir | Esqueleto | Error de validación por campo y de servidor |
| Chatbot | n/a | n/a | Si falta el número de WhatsApp: botón deshabilitado con el teléfono del salón |

## 7. Máquina de estados

Entidad: **cita**.

| Estado | Significado | Ocupa hueco |
|---|---|---|
| `confirmada` | Reservada; confirmación automática, sin aprobación manual | Sí |
| `completada` | Servicio realizado (la marca el Admin o pasa a ser completada tras su hora, VERIFICAR en el plan) | Sí |
| `cancelada` | Cancelada por la clienta o por el Admin | No |
| `no_asistio` | La clienta no acudió (la marca el Admin) | Sí |

`pendiente` existe solo como estado transitorio dentro de la transacción de
reserva y no se persiste como estado de espera (VERIFICAR en el plan; si se
quita, este estado desaparece).

Transiciones permitidas:

| Desde | Hacia | Quién | Condición |
|---|---|---|---|
| (nueva) | `confirmada` | Invitada, Clienta | Hueco libre, datos válidos, consentimiento, antiabuso superado |
| `confirmada` | `cancelada` | Clienta | Faltan ≥ 24 h |
| `confirmada` | `cancelada` | Admin | Siempre |
| `confirmada` | `confirmada` (cambio de hora o estilista) | Clienta | Faltan ≥ 24 h y el nuevo hueco está libre |
| `confirmada` | `confirmada` (cambio de hora o estilista) | Admin | Siempre, hueco libre |
| `confirmada` | `completada` | Admin | Pasada la hora de inicio |
| `confirmada` | `no_asistio` | Admin | Pasada la hora de inicio |

Cualquier otra transición se rechaza.

## 8. Riesgos de seguridad

| Riesgo | Mitigación |
|---|---|
| Acceso a citas ajenas | RLS por usuario; invitadas acceden solo con token de gestión; prueba de aislamiento |
| Escalada a Admin | Rol en tabla propia no editable por el usuario; comprobación en servidor y RLS; prueba de acceso denegado |
| Enlace mágico adivinable o reutilizable | Token aleatorio de ≥ 256 bits, guardado solo como hash, con caducidad y uso acotado; comparación en tiempo constante |
| Invitada que pierde el email | Sin recuperación automática. Riesgo aceptado por no obligar a registrarse; puede contactar con el salón |
| Doble reserva por concurrencia | Restricción de exclusión en BD; prueba de concurrencia |
| Enumeración de citas o emails | Respuestas genéricas ante token inválido; mismo mensaje exista o no el dato |
| Spam de reservas | Honeypot, límites por email e IP, límite de peticiones |
| Fuga de datos personales vía disponibilidad pública | La consulta pública devuelve solo franjas ocupadas, nunca datos de personas |
| Secretos expuestos | Clave de servicio solo en servidor; `.env*` fuera del repo; gitleaks en CI y pre-commit; el cron usa GitHub Secrets |
| XSS en entradas (nombre) | Escape por defecto de React; validación Zod; sin `dangerouslySetInnerHTML` |
| Pausa del proyecto gratuito de Supabase | Keep-alive semanal (RNF-10) |
| Imágenes generadas con IA presentadas como resultados reales | Transparencia en README y en la ficha del portfolio; no se presentan como clientas reales |
| Enlace de WhatsApp envía a un número real | Se usa el marcador `+34 600 000 000` (VERIFICAR); se sustituye al publicar |

## 9. Datos y privacidad

| Dato | Para qué | Dónde | Cuánto tiempo | Cómo se borra |
|---|---|---|---|---|
| Nombre, email, teléfono | Gestionar la cita y contactar | Supabase (Postgres) | Mientras haya citas y hasta 24 meses tras la última (VERIFICAR) | Borrado a petición; anonimización automática a los 24 meses |
| Cuenta de clienta (email, id de auth) | Ver sus citas | Supabase Auth | Hasta que la clienta lo pida | Baja de cuenta |
| Hash del token de gestión | Acceso a la cita de invitada | Supabase | Hasta caducidad o fin de la cita | Se elimina con la cita o al caducar |
| IP (para límites) | Antiabuso | Solo como hash y con TTL corto (VERIFICAR) | Horas | Caducidad automática |
| Consentimiento (fecha y versión) | Prueba de consentimiento | Supabase | Mientras exista el dato asociado | Con el dato asociado |
| Mensajes del chatbot | No se guardan | n/a | n/a | n/a |

- No se usan cookies de analítica ni de terceros. Si se añadiera analítica,
  requeriría su propia enmienda.
- Textos legales (política de privacidad, aviso legal): **VERIFICAR** con
  asesoría legal; no se inventan términos. Mientras no estén redactados, las
  páginas legales no se enlazan desde la navegación.
- Esta sección se actualiza si se tocan datos personales.

## 10. APIs externas

| Servicio | Uso | Datos que se envían | Coste y tope | Términos |
|---|---|---|---|---|
| Supabase | BD, Auth, Realtime | Datos de reserva y cuentas | Plan gratuito (VERIFICAR límites); sin tope de pago porque no se activa plan de pago | VERIFICAR ToS y pausa por inactividad |
| Proveedor de email (Resend o SendGrid) | Producción únicamente, intercambiable por variable de entorno | Email, nombre, datos de la cita | Plan gratuito si se activa (VERIFICAR); tope de envíos declarado antes de activarlo (`docs/costs.md`) | VERIFICAR antes de activar |
| WhatsApp (`wa.me`) | Enlace de contacto | Ninguno desde la web | Ninguno | Enlace público, sin API |
| Unsplash / Pexels | Fuente de imágenes (se descargan, no se consumen en tiempo real) | Ninguno | Ninguno | VERIFICAR licencia y atribución por imagen |
| GitHub Actions | CI y keep-alive | Secretos del repo | Plan gratuito (VERIFICAR minutos) | n/a |
| Vercel | Despliegue | n/a | Plan gratuito (VERIFICAR) | n/a |

No hay API de pago activa en esta spec. Toda llamada a un proveedor externo
pasa por un módulo en `src/lib/<proveedor>/`; nunca desde un componente.

## 11. Criterios de aceptación

| ID | RF | Dado | Cuando | Entonces | Verificación |
|---|---|---|---|---|---|
| CA-01 | RF-01 | Servicios cargados | Se abre la lista de servicios | Cada servicio muestra categoría, precio "desde", duración y un botón Reservar que abre la reserva con ese servicio elegido | e2e `servicios-reservar` |
| CA-02 | RF-01 | Galería con trabajos de varias técnicas | Se filtra por una técnica | Solo se muestran trabajos de esa técnica; cada uno indica técnica y estilista y enlaza a reservar ese servicio | e2e `galeria-filtro` |
| CA-03 | RF-01 | Home abierta | Se carga a 390 y 1440 px | Hay un único h1 y un CTA visibles sin hacer scroll | e2e `home-hero` |
| CA-04 | RF-01 | Home abierta | Se mira la página sin salir de ella | Dirección, teléfono y horario son visibles | e2e `home-contacto` |
| CA-05 | RF-02 | Reserva abierta | Se entra en el flujo | El primer paso es elegir servicio, y estilista, día y hora vienen después | e2e `reserva-orden` |
| CA-06 | RF-02 | Servicio de duración D y una estilista con huecos | Se piden huecos de un día | Solo se ofrecen inicios donde caben D minutos consecutivos libres | test unitario `disponibilidad-duracion` |
| CA-07 | RF-02 | Dos sesiones viendo el mismo día | Una reserva un hueco | La otra deja de ofrecerlo sin recargar en un máximo de N s (N se fija en el plan) | e2e `disponibilidad-tiempo-real` |
| CA-08 | RF-03 | Un único hueco libre y dos peticiones simultáneas | Ambas intentan reservarlo | Exactamente una confirma; la otra recibe error de hueco ocupado con alternativas | test de integración `reserva-concurrente` |
| CA-09 | RF-03 | Una cita activa existente | Se inserta otra solapada para la misma estilista directamente en BD | La BD la rechaza; las citas canceladas no bloquean | test de integración `restriccion-solape` |
| CA-10 | RF-04 | Formulario de reserva | Una invitada envía nombre, email, teléfono y consentimiento válidos | Se crea la cita confirmada. Con datos inválidos o sin consentimiento, no se crea y se muestran errores por campo | test unitario Zod + e2e `reserva-invitada` |
| CA-11 | RF-04 | Cita de invitada creada | Se revisa la bandeja local | Hay un email con enlace de gestión; el enlace abre solo esa cita; uno manipulado, caducado o ya invalidado muestra "enlace no válido" | e2e `enlace-gestion` + test de integración |
| CA-12 | RF-04 | Dos clientas con cuenta y citas | Cada una consulta sus citas | Solo ve las suyas; la consulta directa a las de la otra devuelve vacío | test de integración RLS `aislamiento-clientas` |
| CA-13 | RF-05 | Cita con ≥ 24 h de margen | La clienta la cancela | La cita pasa a `cancelada` y el hueco vuelve a estar libre | e2e `cancelar` |
| CA-14 | RF-05 | Cita con < 24 h | La clienta intenta cancelar o cambiar | Se rechaza con mensaje de contactar con el salón; el Admin sí puede | test de integración `ventana-24h` |
| CA-15 | RF-06 | Citas de invitadas y de cuentas | El Admin abre la agenda | Ve la semana por estilista con todas las citas | e2e `admin-agenda` |
| CA-16 | RF-06 | Cita existente | El Admin la modifica o cancela | El cambio se refleja en la agenda y en la disponibilidad pública | e2e `admin-editar-cita` |
| CA-17 | RF-06 | Clienta o invitada | Intenta abrir `/admin` o llamar a sus endpoints | Acceso denegado; la RLS impide leer o escribir datos de Admin | test de integración RLS `acceso-admin` + e2e |
| CA-18 | RF-07 | Sesión Admin | Crea, edita, desactiva un servicio | Se refleja en la web pública; un servicio inactivo no se ofrece | e2e `admin-servicios` |
| CA-19 | RF-07 | Estilista con huecos de 14:00 a 16:00 | El Admin bloquea esa franja | Esos huecos desaparecen de la disponibilidad pública | test de integración `bloqueo-franja` |
| CA-20 | RF-07 | Estilista con citas libres un día | El Admin marca vacaciones ese día o rango | No se ofrecen huecos; si hay citas, el sistema exige resolverlas antes | test de integración `vacaciones` |
| CA-21 | RF-08 | Cualquier página, 320–1280 px | Se carga | El botón flotante del chat está visible en esquina inferior derecha, sin tapar contenido esencial, y abre un diálogo | e2e `chat-abrir` |
| CA-22 | RF-08 | Chat abierto | Se pulsa cada una de las 4 opciones | Aparece la respuesta predefinida y siempre hay "Volver al menú" | test de componente + e2e `chat-arbol` |
| CA-23 | RF-08 | Chat abierto | Se elige "Hablar con un humano" | Se abre un enlace `wa.me` válido en pestaña nueva con `rel="noopener noreferrer"` | test de componente `chat-whatsapp` |
| CA-24 | RF-08 | Chat abierto | Se pulsa Esc o el botón cerrar | Se cierra y el foco vuelve al botón flotante; el diálogo tiene rol y nombre accesibles; no hay almacenamiento ni envío de datos | e2e `chat-a11y` |
| CA-25 | RF-09 | Formulario de reserva | Se envía sin consentimiento | Se rechaza; con consentimiento se guarda fecha y versión | test unitario + integración |
| CA-26 | RF-09 | Cita de una persona | Pide el borrado | Sus datos personales se eliminan o anonimizan y las citas dejan de ser identificables | test de integración `borrado` |
| CA-27 | RF-09 | Datos con última cita de hace más de 24 meses | Se ejecuta la tarea de retención | Se anonimizan; los más recientes no se tocan (plazo VERIFICAR) | test de integración `retencion` |
| CA-28 | RF-10 | Formulario con el honeypot relleno | Se envía | Se rechaza sin crear cita ni mensaje que lo delate | test unitario `honeypot` |
| CA-29 | RF-10 | Una persona con el máximo de citas activas | Intenta otra por el mismo email o IP | Se rechaza con mensaje claro; tras cancelar una, puede reservar | test de integración `limite-citas` |
| CA-30 | RF-11 | Entorno de desarrollo | Se crea una cita | El email llega a la bandeja local. Cambiando solo variables de entorno se selecciona otro proveedor, sin cambios de código y sin claves en el repo | test unitario del adaptador + revisión gitleaks |
| CA-31 | RF-12 | Cualquier página | Se pulsa el logo | Navega a `/` | e2e `logo-home` |
| CA-32 | RF-12 | Anchos de 320 a 1280 px | Se recorre cada página | No hay scroll horizontal, ningún elemento de header, nav, main o footer se sale ni se recorta, y la navegación móvil funciona (se abre, se cierra con Esc y clic fuera, y todo enlace tiene destino) | `tests/responsive.spec.ts` (18 anchos) + e2e `nav-movil` |
| CA-33 | RF-12 | Código de componentes | Se pasan las puertas de estilo | `check-palette` pasa; no hay hex, `rgb()`, `hsl()` ni valores arbitrarios en componentes | `pnpm check-palette` + búsqueda en lint |
| CA-34 | RF-12 | Cualquier página | Se navega con teclado y se ejecuta axe | Foco visible, objetivos táctiles ≥ 44×44 px, cabecera sticky, y axe sin violaciones graves | `pnpm test:a11y` + e2e |
| CA-35 | RNF-10 | Repositorio | Se revisa la CI | Existe un workflow semanal que consulta la BD usando GitHub Secrets, sin valores en el repo | revisión documentada en la review + gitleaks |

## 12. Enmiendas

| Fecha | ADR | Enmienda |
|---|---|---|
| 2026-10-19 | ADR-0010 | Sección 7: los estados se almacenan en inglés (`confirmed`, `completed`, `cancelled`, `no_show`) y se añade `pending` al enum, persistido pero sin uso actual (la reserva nace en `confirmed`). La interfaz muestra las etiquetas en español. Los CA no cambian |
| 2026-10-19 | ADR-0009 | Sección 8: se concreta el mecanismo del token de gestión (256 bits, solo hash, acceso por funciones `security definer`). No cambia ningún requisito ni CA |
