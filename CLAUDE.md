# CLAUDE.md — Condor 360 · Sistema de Órdenes de Trabajo v2.0.0

## Qué es este proyecto

Sistema de digitalización de órdenes de trabajo para **Condor Alcantarillados** (marca comercial: **Condor 360**), empresa chilena de soluciones sanitarias, transporte de residuos e hidrojet.

Reemplaza formularios en papel que los técnicos llenan en terreno. El flujo es: técnico llega al sitio → abre la app en su celular → llena el formulario → marca trabajos realizados → captura firma del supervisor y fotos antes/después → envía → el sistema guarda la orden en Postgres (con relaciones reales), sube fotos/firma/PDF a Cloudflare R2, genera el PDF con Gotenberg y notifica por email (Resend) y Telegram. El técnico puede ver historial de órdenes, ver detalles, y reenviar órdenes con error. La oficina de Condor y NotStudio gestionan todo (clientes, técnicos, servicios, órdenes, notificaciones) desde un **admin panel** propio — ya no se opera nada tocando planillas de Airtable directamente.

Desarrollado por **NotStudio.cl** (https://notstudio.cl).

## Estado (leer esto primero)

**Corte a producción ejecutado el 2026-09-22.** `main` es el código real (Postgres + R2 + admin) y los tres servicios de EasyPanel (proyecto "condor": `condor-app`, `condor-terreno`, `condor-admin`) despliegan automáticamente desde `main`. `feat/postgres-migration` quedó como rama histórica; no volver a usarla.

- **URLs**: `https://condor.notstudio.cl` (terreno), `https://condor.notstudio.cl/admin/` (panel), `https://condor.notstudio.cl/api`. La URL antigua de GitHub Pages (`notstudiocl.github.io/condor-sistema/`) sigue publicándose vía `.github/workflows/deploy.yml` pero sirve la MISMA app nueva contra el backend nuevo (`client/.env.production`, commiteado a la fuerza pese al `.gitignore`), igual que en H&A: los técnicos no reinstalan la PWA y funcionan las dos URLs. `VITE_ADMIN_APP_URL` hace que el switch Terreno/Oficina apunte al panel real desde Pages.
- **Datos**: 656 órdenes migradas desde Airtable (hasta la OT-00657 del 22/09; 652–657 sin fotos/PDF por el incidente de Airtable). Secuencia en 660 → la primera orden nueva es OT-00661. Airtable queda congelado como respaldo. El backend viejo (`clientes/condor-api`) está DETENIDO en EasyPanel y los 2 workflows de Condor del n8n viejo (`n8n.virtualkeys.store`, instancia compartida con H&A y Virtual Keys — no apagar entera) están desactivados.
- **Config de producción**: `AUTH_ENFORCE=enforce`, sin `EMAIL_DEV_REDIRECT` (la redirección se controla desde Configuración → General), `WEBHOOK_NOTIFICACIONES_URL` apuntando al n8n de infra. Los usuarios de prueba (técnico `matias`, `matias@notstudio.cl`, `oficina@notstudio.cl`) fueron eliminados; la única cuenta de NotStudio es `admin@notstudio.cl` (rol notstudio).
- **Postgres**: puerto externo 54320 sigue expuesto (solo para `migration/`); cerrar cuando se cancele Airtable.
- Gotchas de EasyPanel: `updateSourceGithub` NO activa el auto-deploy (llamar `services.app.enableGithubDeploy`); si un dominio se crea antes de que exista el DNS, Traefik no reintenta el certificado solo (borrar y recrear una ruta).

## Datos de la empresa

| Propiedad | Valor |
|---|---|
| Nombre comercial | Condor Alcantarillados |
| Marca del sistema | Condor 360 |
| Tagline | Soluciones Sanitarias · Transportes de Residuos · Hidrojet |
| Web | www.condoralcantarillados.cl |
| Email | alcantarilladoscondor@gmail.com |
| Teléfono | +56 9 9743 9183 |
| Dirección | Amunategui N°232 Oficina 1904, Santiago |

## Branding y colores

| Propiedad | Valor |
|---|---|
| Color primario | `#1E3A8A` (azul oscuro / condor-900) |
| Color acento | `#DC2626` (rojo / accent-600) |
| Color secundario | `#3B82F6` (azul medio / condor-500) |
| Fondo login | Blanco con burbujas animadas azules |
| Botón principal login | Gradiente azul (`from-condor-600 to-condor-800`) |
| Botón acción importante (enviar, nueva orden) | Rojo `#DC2626` (accent-600) |
| Header | Azul oscuro `#1E3A8A` (condor-900) |
| Servicio personalizado (check) | Verde `#22C55E` (green-500) |

El logo es un archivo PNG en `client/public/condor-logo.png` (también se copia a `server/assets/condor-logo.png` en el Dockerfile — se usa embebido en base64 dentro de los PDFs). El **admin panel usa la misma paleta y las mismas 3 fuentes** (`admin/tailwind.config.js` es prácticamente idéntico al de `client/`).

### Fuentes (Tailwind)
- **Heading**: DM Sans (`font-heading`)
- **Body**: IBM Plex Sans (`font-body`)
- **Monospace**: JetBrains Mono (`font-mono`)

## Arquitectura

```
condor-sistema/
├── client/                      # React + Vite — PWA mobile-first de los técnicos
│   ├── src/
│   │   ├── components/          # SignaturePad, Summary, Header, AppFooter, OfflineIndicator, SubscriptionBanner, ClienteSearch
│   │   ├── pages/                # LoginPage, DashboardPage, OrdenWizardPage, DetalleOrdenPage, ConfirmacionPage
│   │   ├── utils/                # api.js, constants.js, helpers.js, offlineStorage.js, syncManager.js
│   │   └── version.js            # APP_VERSION = '2.0.0'
│   ├── public/                   # condor-logo.png, manifest.json, sw.js
│   └── index.html                # Título: "Condor 360 - Ordenes de Trabajo"
├── admin/                        # React + Vite — Panel de oficina (Condor + NotStudio), app SEPARADA de client/
│   ├── src/
│   │   ├── components/           # DataTable, Modal, ConfirmDialog, Toast, KpiCard, Sidebar/Topbar/Layout, NotificationBell, etc.
│   │   ├── pages/                 # Dashboard, OrdenesList, OrdenDetalle, Clientes, Personal, Servicios, Notificaciones, Configuracion, UsuariosAdmin, Auditoria, Login
│   │   └── utils/                 # api.js, auth.js, constants.js, format.js, images.js
│   └── public/                   # condor-logo.png, favicon-32.png
├── server/                       # Node.js + Express (API REST) — backend único para client/ y admin/
│   ├── src/
│   │   ├── db/                    # pool.js (pg.Pool), migrate.js (runner), migrations/*.sql, smoke-test.js
│   │   ├── repositories/          # ordenesRepo, clientesRepo, empleadosRepo, serviciosRepo, adminUsersRepo, notificacionesRepo, auditRepo, dashboardRepo
│   │   ├── services/               # ordenService.js (orquestador), pdf/ (gotenberg.js, template.js), storage/r2.js, notifications/ (resend, telegram, dispatch, defaultTemplates)
│   │   ├── routes/                 # auth.js, tecnicos.js, clientes.js, servicios.js, ordenes.js (técnico) + admin/*.js (10 routers)
│   │   ├── middleware/             # auth.js (JWT técnico), adminAuth.js (JWT admin), requireRole.js, subscriptionGate.js, rateLimiter.js, errorHandler.js
│   │   └── index.js                # Monta todo, ~340 líneas
│   └── scripts/test-pdf-manual.mjs
├── migration/                    # Paquete standalone — migración histórica ÚNICA Airtable → Postgres+R2 (fuera del Dockerfile)
│   ├── migrate.mjs               # Servicios→Empleados→Clientes→Órdenes+adjuntos, upsert idempotente por airtable_record_id
│   └── r2-manifest.json          # Manifiesto de progreso de subida a R2 (commiteado, ~28k líneas)
├── .github/workflows/
│   └── deploy.yml                 # Build+deploy SOLO de client/ a GitHub Pages — admin/ todavía no está integrado (ver gaps)
├── Dockerfile                     # Construye SOLO server/ (para EasyPanel)
├── CLAUDE.md                      # Este archivo
└── package.json                   # Scripts raíz del monorepo (client/server — admin/ no está en los scripts raíz)
```

**Stack:**
- Frontend técnico (`client/`): React 18, Vite 6, Tailwind CSS 3, React Router 6 (HashRouter), Lucide React icons, `idb` (IndexedDB offline)
- Frontend admin (`admin/`): React 18, Vite 6, Tailwind CSS 3, React Router 6 (HashRouter), Lucide React icons, `exceljs` (export). App Vite separada, sin soporte offline.
- Backend (`server/`): Express, `pg` (SQL parametrizado, sin ORM), JWT (`jsonwebtoken`), bcrypt (PINs/passwords), `@aws-sdk/client-s3` (R2), `express-rate-limit`
- DB: PostgreSQL self-hosted (EasyPanel), sin ORM — migraciones `.sql` numeradas + runner casero
- Adjuntos: Cloudflare R2 (S3-compatible), un solo bucket
- PDF: Gotenberg (headless Chromium, self-hosted) llamado directo desde el backend
- Notificaciones: Resend (email) + Telegram Bot API, llamados directo desde el backend — **ya no hay n8n**
- Deploy: GitHub Pages (frontend `client/`, auto-deploy vía GitHub Actions) + EasyPanel/Docker (backend `server/`, deploy manual — `autoDeploy:false`)
- Offline (solo `client/`): IndexedDB vía `idb` + auto-sync con backoff exponencial

## Versionado

La versión del **client** se gestiona en `client/src/version.js`:
```js
export const APP_VERSION = '2.0.0';
```
Se muestra en AppFooter (Dashboard, DetalleOrden), LoginPage (footer inline, gris) y ConfirmacionPage (footer inline, blanco translúcido).

El **admin** tiene su propio `admin/src/version.js` con la misma versión — subirlas juntas.

## Autenticación — una tabla de personas, dos accesos

Tras `003_unify_usuarios.sql` (mismo diseño que `hya-sistema`), **`empleados` es la única tabla de personas**: técnicos, oficina, administradores y soporte NotStudio. `admin_users` ya no existe. Una persona = un perfil, con accesos por contexto:

- **Acceso terreno** (`client/`): tiene `pin_hash` → entra con usuario/RUT + PIN de 4 dígitos.
- **Acceso panel** (`admin/`): `email` + `password_hash` + `rol` con panel. Condición única reutilizada en todo el backend (`personasRepo.SQL_TIENE_PANEL`): `email IS NOT NULL AND password_hash IS NOT NULL AND rol IN ('notstudio','admin','oficina')`.
- `rol` ∈ `tecnico | oficina | admin | notstudio` es la autoridad de permisos del panel. `notstudio` = soporte de NotStudio: puede todo lo de `admin`, es **invisible** para los demás roles (no sale en listados, su ficha da 404) y las secciones exclusivas (credenciales Resend/Telegram, webhook n8n — `requireNotstudio`) responden **404, no 403**, para no revelar que existen.
- **Dos JWT con el mismo secreto, separados por el claim `aud`**: el token del panel se firma con `aud:'admin'` (12 h); el de terreno NO lleva `aud` (30 d, compatible con tokens ya emitidos). `middleware/auth.js` rechaza `aud==='admin'`; `adminAuth.js` exige `aud==='admin'`.
- **Ambos middlewares releen el estado desde la DB en cada request** (`personasRepo.obtenerEstadoAcceso`): activo, PIN, rol, contraseña. Desactivar, degradar o quitar un acceso corta la sesión en la siguiente request, no cuando venza el token.
- **Bloqueo por intentos fallidos, compartido** entre ambos logins: 5 fallos seguidos → 15 min (`failed_attempts`/`locked_until`), 429. Se levanta desde la ficha ("Desbloquear ahora").
- **Invitaciones**: `POST /api/admin/usuarios/:id/invitar` genera `invite_token` (72 h) y manda un correo (vía el mismo camino híbrido de n8n, `services/notifications/correoSistema.js`, sin `email_dev_redirect`) con el enlace `{APP_ENCRYPTION_KEY           # obligatoria — cifra/descifra credenciales Resend/Telegram (pgcrypto)
ADMIN_PANEL_URL              # opcional, default https://condor.notstudio.cl/admin/ — base de los enlaces de invitación}#/invitacion/:token`; la página pública `InvitacionPage.jsx` valida el token y define la contraseña (`/api/admin/auth/invitacion/:token`). El enlace también se devuelve en la respuesta por si el correo falla.
- **Auditoría con redacción de secretos** (`auditRepo.redactarSecretos`): cualquier clave tipo password/pin/token/secret/apiKey en `detalle` se guarda como `[oculto]`, recursivo.
- **Única vía de escritura sobre personas**: `routes/admin/usuarios.js` (rol admin/notstudio). `routes/admin/empleados.js` quedó de **solo lectura** (listado/ficha/stats). Las listas del wizard (`/api/tecnicos*`) solo muestran personas activas **con PIN**.
- `AUTH_ENFORCE` (`warn`/`enforce`) y el kill switch siguen igual.

### Pantalla Usuarios (`admin/src/pages/UsuariosPage.jsx`)
Reemplaza a "Personal" y "Usuarios" antiguas (`/personal` redirige a `/usuarios`). Lista con filtros Todos / Terreno / Oficina-Admin / Inactivos, y ficha `/usuarios/:id` con tres tarjetas: Datos, Acceso a terreno (dar acceso = generar PIN, resetear, quitar) y Acceso al panel (invitar, contraseña temporal, quitar), más actividad en terreno. Las credenciales generadas (PIN, contraseña temporal, enlace de invitación) se muestran **una sola vez**.

### Kill switch de suscripción

- (Actualizado 2026-09-22, igual que H&A) Fuente de verdad: **`app_settings.subscription_active` / `subscription_message`**, editables desde Configuración → General (solo rol notstudio); las env vars `SUBSCRIPTION_ACTIVE`/`SUBSCRIPTION_MESSAGE` quedan como respaldo mientras no exista fila. `subscriptionGate` bloquea **solo** las escrituras de la app de terreno (`POST/PUT /api/ordenes`, `reenviar`); el panel sigue accesible para que NotStudio pueda reactivarlo. Lo de abajo describe el diseño anterior.
- (Anterior) Fuente de verdad: solo env vars de EasyPanel — `SUBSCRIPTION_ACTIVE` (`'true'`/`'false'`, default activo si falta) y `SUBSCRIPTION_MESSAGE`. Ninguna app (ni admin ni client) puede leerlas ni editarlas — decisión deliberada para no exponer un control tan sensible dentro del producto.
- `server/src/middleware/subscriptionGate.js` bloquea con 403 (`code: 'SUBSCRIPTION_INACTIVE'`) **todo** `/api/admin/*` (incluido el login del admin) y, vía `checkSubscriptionOrReject`, los endpoints de escritura del técnico (`POST/PUT /api/ordenes`, `POST /api/ordenes/:id/reenviar`).
- `GET /api/subscription-status` (público) expone el estado para que `client/` muestre `SubscriptionBanner.jsx` y deshabilite "Nueva Orden".

### LoginPage técnico (diseño actual)
- Fondo blanco con 3 burbujas animadas de blur azul (`animate-pulse` a 4s, 5s, 6s)
- Línea gradiente azul en la parte superior
- Logo con `h-20 object-contain`
- Inputs con `bg-gray-50 border-2 border-gray-100`, focus azul con `group-focus-within` en iconos
- Botón gradiente azul con `shadow-blue-200`, `active:scale-[0.98]`
- Footer inline (NO usa AppFooter) con colores grises

### LoginPage admin
Form simple email+password (sin PIN, sin burbujas animadas). Sin registro público — solo se accede vía invitación desde "Usuarios" del propio panel (`crearUsuario` genera password temporal, se intenta enviar por Resend).

## Flujo de envío de órdenes

Al presionar "Enviar Orden" (`ordenService.createOrdenCompleta`, `server/src/services/ordenService.js`):
0. Idempotencia: Set en memoria (`procesandoOrdenes`, TTL 60s) bloquea requests concurrentes con el mismo `idempotencyKey`; si ya existe en Postgres, devuelve la respuesta de la orden existente sin reprocesar (`duplicate: true`).
1. Si es cliente nuevo (no vino de búsqueda), crea el cliente en Postgres tabla `clientes` (tipo forzado `'Particular'`).
2. Guarda la orden + `orden_trabajos` + `orden_empleados` en **una transacción** Postgres (`ordenesRepo.createOrdenCompleta`).
3. Sube fotos antes/después + firma a **Cloudflare R2** en paralelo (presupuesto ~10s, `Promise.allSettled` — nunca finge éxito total si alguna falla; ver `fotosOk` en la respuesta).
4. Genera el HTML de la orden (`pdf/template.js`) → **Gotenberg** (`pdf/gotenberg.js`, timeout ~15s) → sube el PDF a R2 (timeout 5s). Si cualquier paso del PDF falla, degrada en silencio: la orden queda `'Enviada'` sin PDF, nunca lanza ni responde 500.
5. Si el PDF se generó OK: marca la orden `'Completada'` y dispara `dispatchNotificaciones()` (Resend + Telegram) **fire-and-forget**, después de responder al cliente.
6. Responde al frontend con el contrato JSON congelado (ver más abajo).

### Idempotencia (prevención de duplicados)

Protección en 3 niveles (igual estructura que antes, ahora sobre Postgres):
1. **Frontend — useRef guard**: `sendingRef` bloquea instantáneamente (sin esperar re-render).
2. **Backend — Set en memoria** (`procesandoOrdenes`): bloquea requests concurrentes con el mismo key. Auto-limpia en 60s.
3. **Backend — `ordenes.idempotency_key UNIQUE NULL`** en Postgres: respaldo real si el servidor se reinició entre requests (antes era un `find` sobre un campo de texto en Airtable).

El `idempotencyKey` se genera una vez al montar el wizard (`useState(() => crypto.randomUUID())`). Se reutiliza en reintentos, y cada nueva orden genera un key nuevo.

### Contrato de respuesta — CONGELADO deliberadamente

`ordenService.js` responde con las mismas claves de la era Airtable+n8n aunque su significado cambió — **no renombrar**, PWAs viejas cacheadas en celulares de técnicos siguen esperando este shape exacto durante la transición:
```
data.{ airtableOk, recordId, webhookOk, webhookError, duplicate, fotosOk,
  webhookData: { success, numeroOrden, pdfUrl, pdfGenerado, airtableActualizado } }
```
- `airtableOk` hoy significa "la escritura en Postgres fue OK" (no hay llamada a Airtable).
- `webhookOk` / `webhookData` hoy significan "PDF vía Gotenberg + notificaciones OK" (no hay llamada a n8n).
- `recordId` es el `id` bigint de Postgres (ya no un `rec*` de Airtable).

### Relaciones (antes "Linked Records" de Airtable, ahora FKs reales de Postgres)

- `ordenes.cliente_id` → FK a `clientes.id` (antes: linked record "Cliente RUT")
- `orden_empleados` → tabla de unión `(orden_id, empleado_id)` (antes: linked record array "Empleados")
- `orden_trabajos.servicio_id` → FK opcional a `servicios.id`, o `nombre_personalizado` si es un servicio custom (antes: JSON string + linked record "Servicios")
- `ordenes.responsable_orden_id` → FK a `empleados.id`, se asigna con `req.user.recordId` (el técnico logueado) — antes: linked record "Responsable Orden"
- **Compatibilidad hacia atrás**: `ordenesRepo.resolverClienteId/resolverEmpleadoIds/resolverServicioIds/resolverResponsableId` aceptan tanto un id numérico de Postgres como un `'rec*'` de Airtable (para órdenes que quedaron encoladas offline en un PWA viejo pre-corte) — lo resuelven vía la columna `airtable_record_id` (presente en `clientes`, `empleados`, `servicios`, `ordenes` como `UNIQUE NULL`, puente histórico).

### Mapeo Cliente / Supervisor (IMPORTANTE, sin cambios)

- **`cliente_empresa`** en `ordenes` = nombre de la EMPRESA (ej: "Burger King")
- **`supervisor`** en `ordenes` = nombre de la PERSONA de contacto (ej: "Carla Curififil")
- Al buscar RUT y seleccionar cliente: `clientes.empresa` → clienteEmpresa, `clientes.nombre` → supervisor
- Al crear cliente nuevo: `supervisor` → `clientes.nombre`, `clienteEmpresa` → `clientes.empresa`

### Campos que NO se envían al crear una orden

`numero_orden` (viene de la secuencia `ordenes_numero_seq`), `numero_orden_display` (GENERATED), `id`, `created_at`, `updated_at` son automáticos en Postgres. No incluirlos en el create/update.

## Cola de trabajos (`jobs`, mismo diseño que hya-sistema)

Tabla `jobs` (004) + worker in-process (`services/jobs/worker.js`, polling 5 s, un job a la vez, backoff 1/5/25 min, 3 intentos, `FOR UPDATE SKIP LOCKED`). El PDF y las notificaciones se siguen intentando **en línea** al crear/editar (el técnico ve "Ver PDF" al instante cuando todo anda); si el PDF falla, `finalizarOrdenYResponder` encola `completar_orden {ordenId}` (índice único parcial: no se duplica mientras haya uno activo) y el worker lo termina vía `ordenService.completarOrdenPendiente` (regenera PDF + notifica; lanza si el PDF falla para que reintente; no hace nada si la orden ya tiene PDF). Al agotar reintentos, o la primera vez en 30 min que un PDF falla en línea, se encola `alerta_notstudio {mensaje}` → Telegram al canal interno de NotStudio: sale por el MISMO webhook de n8n con `alerta:true` y el workflow lo desvía al chat `-1003548492046` (bot `notificacionesvk_bot`, el mismo del handler global de errores), nunca al grupo del cliente (`services/notifications/alertas.js`; respaldo opcional por env `ALERTAS_TELEGRAM_*`). Visible y reintentable desde Configuración → General (solo notstudio, `GET/POST /api/admin/settings/jobs`).

## PDF y notificaciones (n8n quedó solo como cartero opcional)

El trabajo pesado (guardar, subir a R2, generar PDF con Gotenberg, renderizar plantillas) vive en `server/src/services/`. n8n ya NO orquesta nada: en **modo híbrido** solo entrega los mensajes que el backend le manda listos (mismo patrón que `hya-sistema`).

### Modo híbrido vía n8n (`notifications/webhookN8n.js`)

- Con URL de webhook (`app_settings.webhook_notificaciones_url`, editable en Configuración → "Envío vía n8n"; fallback env `WEBHOOK_NOTIFICACIONES_URL`, hoy seteada en `condor-app`), `dispatchNotificaciones` hace UN POST con `{ evento, emails:[{plantilla,to,cc,from,replyTo,subject,html}], telegram:{texto}, pdfs:[{nombre,url}], orden }`. Se sigue registrando una fila de `notificacion_log` por mensaje.
- Workflow: **"Condor 360 — Notificaciones (híbrido motor)"** (id `xHDVroUIki70ilfa`) en el n8n NUEVO y compartido `infra-n8n.f8ihph.easypanel.host` (proyecto EasyPanel "infra", donde también vive Gotenberg), path `/webhook/condor-notificaciones`. Usa la credencial Resend "Resend HYA" (es la cuenta Resend de NotStudio, dominio verificado `noreply.notstudio.cl` — por eso el remitente default es `notificaciones@noreply.notstudio.cl`) y el bot "Hermes NotStudio" al chat `-5133715111`. Las credenciales de API de ese n8n están en `hya-sistema/.env` (`N8N_NUEVO_API_*`). El n8n VIEJO (`n8n.virtualkeys.store`) solo atiende a la app antigua y se apaga tras el corte.
- Sin URL: envío in-process con las credenciales de `notification_channels` (lo descrito abajo).
- **Modo desarrollo**: `app_settings.email_dev_redirect` o env `EMAIL_DEV_REDIRECT` (hoy `admin@notstudio.cl` en `condor-app`) redirige TODOS los correos a esa casilla con `[DEV → real]` en el asunto. Telegram no se redirige. **Quitarlo al pasar a producción.**

- **`pdf/gotenberg.js`**: `renderPdf(html)` — POST multipart a `${GOTENBERG_URL}/forms/chromium/convert/html` (mismos parámetros que el nodo n8n original: márgenes 0in, `preferCssPageSize=true`, `pdfFormat=PDF/A-3b`), timeout 15s, lanza si falla (el caller decide degradar).
- **`pdf/template.js`**: `buildHtml(orden)` es un puerto fiel del Code node "Generar HTML" de n8n — header/footer fijos, tabla de trabajos, grid de fotos antes/después, firma, logo embebido en base64. También arma el nombre de archivo: `OT-{numero}_{cliente}_{supervisor}_{fecha}.pdf`.
- **`notifications/dispatch.js`**: `dispatchNotificaciones(orden, {pdfUrl, pdfBuffer})` dispara las 3 notificaciones de una orden completada (email al cliente, email interno a `alcantarilladoscondor@gmail.com`, Telegram) en paralelo (`Promise.allSettled`, ningún canal tumba a otro), cada intento se loguea en `notificacion_log`. Variables disponibles para las plantillas: `numero_orden, cliente_empresa, cliente_nombre, fecha, total, direccion, comuna, pdf_url, tecnicos, estado`.
- **`notifications/defaultTemplates.js`**: defaults de código, puerto fiel de los 3 nodos n8n originales (Gmail cliente, Gmail interno, Telegram) — único cambio real: el link "Ver en Airtable" pasó a ser "Ver PDF de la Orden" apuntando a R2. Si la oficina no personalizó nada desde el admin, los mensajes salen igual que con n8n.
- **`notification_templates`** (Postgres): overrides editables por bloques desde el admin (`NotificacionesPage.jsx` → tab Plantillas); sin fila = se usa el default de código. Nunca queda "vacío" en el editor.
- **`notifications/resend.js`** / **`notifications/telegram.js`**: fetch nativo (sin SDKs), credenciales leídas descifradas desde `notification_channels` (ver más abajo), timeout 15s cada uno.
- `POST /api/ordenes/:id/reenviar` (técnico) y `POST /api/admin/ordenes/:id/reenviar` (admin) regeneran el PDF y reenvían las 3 notificaciones **síncronamente**. `POST /api/admin/ordenes/:id/regenerar-pdf` regenera **solo** el PDF, sin notificar (para no re-avisar al cliente tras una edición administrativa).

### Credenciales de notificaciones — NO son env vars

A diferencia de Airtable/n8n, las claves de Resend y el token/chatId de Telegram viven **cifradas en Postgres** (`notification_channels.secret_encrypted`, `pgp_sym_encrypt`/`pgp_sym_decrypt` con `APP_ENCRYPTION_KEY`), gestionadas 100% desde `admin/src/pages/ConfiguracionPage.jsx` (rol admin). La API nunca devuelve el secreto completo, solo `secret_last4` enmascarado (`re_••••3kFa`); dejar el campo vacío al guardar conserva el secreto existente.

## Almacenamiento de adjuntos (Cloudflare R2)

- Un solo bucket, cliente S3-compatible (`services/storage/r2.js`, `@aws-sdk/client-s3`).
- `orden_fotos.r2_key` guarda **solo la key**, nunca la URL completa — la URL pública se arma en runtime con `R2_PUBLIC_URL` + key (`ordenesRepo.buildFotoUrl` / `storage/r2.js buildPublicUrl`). Cambiar a un dominio propio después es una sola env var.
- Tipos de foto: `antes`, `despues`, `firma` (1:1 por orden, se reemplaza al editar), `pdf` (1:1 por orden, se reemplaza al regenerar).
- `ordenesRepo.siguienteIndiceFoto()` calcula el próximo índice libre antes de subir — evita pisar keys existentes al editar/re-enviar una orden (bug real corregido: antes reiniciaba el índice en 0 y sobrescribía fotos en R2 silenciosamente).
- Eliminar una foto (`DELETE /api/admin/ordenes/:id/fotos/:fotoId`) borra el objeto en R2 en modo best-effort; eliminar una orden completa (`DELETE /api/admin/ordenes/:id`) **deja los objetos R2 huérfanos deliberadamente** (no hay borrado en cascada del bucket).

## Schema Postgres

Sin ORM — SQL parametrizado vía `pg`. Migraciones numeradas en `server/src/db/migrations/`, aplicadas por `node src/db/migrate.js` (runner casero, tabla `schema_migrations`, no hay script npm que lo invoque, se corre a mano). Decisiones de schema **deliberadamente permisivas** frente a datos reales sucios de Airtable (ver `/Users/matias/.claude/plans/dynamic-splashing-heron.md` para la auditoría completa que las justifica) — no "corregir" estos constraints sin discutirlo primero.

```
servicios              id, nombre UNIQUE, activo, airtable_record_id UNIQUE NULL, created_at

empleados              id, rut NULL, nombre, activo, telefono, usuario UNIQUE NOT NULL,
                       pin_hash (bcrypt), fecha_ingreso, especialidades text[] NULL,
                       numero_secuencial, codigo GENERATED ('TCN'||lpad(numero_secuencial,3,'0')),
                       airtable_record_id UNIQUE NULL

clientes               id, rut NULL (SIN UNIQUE, sin CHECK de dígito verificador — a propósito,
                       7 grupos de RUT compartido reales), rut_normalizado GENERATED (índice NO único),
                       nombre, tipo CHECK(Particular/Empresa) NULL, empresa, email, telefono,
                       direccion, comuna, merged_into bigint REFERENCES clientes(id) NULL (soft merge),
                       airtable_record_id UNIQUE NULL

ordenes                id, numero_orden UNIQUE DEFAULT nextval('ordenes_numero_seq'),
                       numero_orden_display GENERATED (lpad 5), fecha,
                       estado DEFAULT 'Enviada' CHECK(Pendiente/Enviada/Completada/Facturacion pendiente/Facturada),
                       cliente_id FK NULL, cliente_empresa/email/telefono (snapshot texto),
                       direccion, orden_compra, comuna, supervisor,
                       hora_inicio/termino timestamptz (SIN check de rango — 59 órdenes reales cruzan medianoche),
                       descripcion_trabajo, observaciones, garantia CHECK(4 opciones UI) NULL,
                       patente_vehiculo, total numeric(12,0) DEFAULT 0,
                       metodo_pago CHECK(5 opciones UI) NULL, requiere_factura bool,
                       idempotency_key uuid UNIQUE NULL, responsable_orden_id FK empleados NULL,
                       airtable_record_id UNIQUE NULL, created_at, updated_at

orden_empleados        (orden_id, empleado_id) PK — reemplaza el linked array "Empleados"

orden_trabajos         id, orden_id, servicio_id FK NULL, nombre_personalizado NULL,
                       cantidad CHECK(>0), orden_index, CHECK(servicio_id IS NOT NULL OR nombre_personalizado<>'')

orden_fotos            id, orden_id, tipo CHECK(antes/despues/firma/pdf), r2_key (solo key),
                       filename, content_type, size_bytes, orden_index, created_at

(admin_users)          ELIMINADA en 003 — fusionada en empleados (columnas email, password_hash NULL,
                       rol CHECK(tecnico/oficina/admin/notstudio) DEFAULT 'tecnico', last_login_at,
                       last_login_terreno_at, failed_attempts, locked_until, invite_token UNIQUE NULL,
                       invite_expires_at; pin_hash y usuario pasan a NULL-able). Las FKs updated_by /
                       admin_user_id / revisado_por apuntan ahora a empleados(id) ON DELETE SET NULL.

notification_channels  canal UNIQUE CHECK(resend/telegram), activo, config jsonb,
                       secret_encrypted bytea (pgcrypto), secret_last4, updated_by, updated_at

notification_templates template_key UNIQUE CHECK(email_cliente/email_interno/telegram_ot), asunto,
                       bloques jsonb, activo, updated_by, updated_at — sin fila = default de código

notificacion_log       id, orden_id, canal, plantilla, destinatario, ok, error, sent_at

app_settings            key PK, value jsonb, updated_by, updated_at — ej. logo_email_url
                       (el kill switch NO vive aquí, vive solo en env vars de EasyPanel)

audit_log               id, admin_user_id NULL, accion, entidad, entidad_id, detalle jsonb, created_at

rut_grupos_revisados    rut_normalizado PK, revisado_por FK admin_users NULL, revisado_at
                       — marca un grupo de RUT compartido como "revisado, no son duplicados"
                       (nunca fuerza fusión de clientes.rut)
```

Índices relevantes: `ordenes(estado)`, `ordenes(cliente_id)` parcial, `ordenes(fecha)`, `ordenes(created_at DESC)`, `clientes(rut_normalizado)`, `clientes(merged_into)` parcial, `orden_trabajos(orden_id)`, `orden_fotos(orden_id, tipo)`, `notificacion_log(orden_id)`, `audit_log(entidad, entidad_id)`.

## Campos de la Orden de Trabajo (según formulario PDF real)

Sin cambios respecto al formulario que ve el técnico — el schema Postgres modela exactamente estos mismos campos.

### Encabezado
- Fecha de la orden (auto: hoy)

### Datos del cliente (Paso 1)
- RUT (formato chileno: 12.345.678-9, con búsqueda autocompletado contra Postgres vía `GET /api/clientes/buscar`) **obligatorio**
- Cliente / Empresa (nombre de la empresa) **obligatorio**
- Supervisor / Encargado (nombre de la persona de contacto) **obligatorio**
- Email **obligatorio** (validación de formato)
- Teléfono **obligatorio**
- Dirección **obligatorio**
- Comuna **obligatorio**
- Orden de Compra (opcional, para clientes empresa)

### Horarios y Trabajos (Paso 2)
- Hora Inicio (datetime-local, layout vertical `flex-col`) **obligatorio**
- Hora Término (datetime-local, layout vertical `flex-col`) **obligatorio**
- Trabajos Realizados (checklist dinámica desde Postgres tabla `servicios` + fallback offline) **al menos 1 obligatorio**
- Servicio personalizado (input + botón verde con Check icon para agregar)
- Descripción del Trabajo (textarea) **obligatorio**
- Observaciones (textarea, opcional)
- Total a Pagar (CLP, formato con separador de miles)
- Método de Pago: Efectivo / Transferencia / Débito / Crédito / Por pagar
- Garantía: Sin garantía / 3 meses / 6 meses / 1 año
- Requiere Factura: Sí / No

### Personal y vehículo (Paso 3)
- Patente vehículo **obligatorio** (sin validación de formato estricta, solo requerido)
- Personal asignado: solo técnicos activos de Postgres, badge azul "Técnico"
- NO hay personas externas (eliminado)

### Evidencia fotográfica (Paso 4)
- Fotos ANTES (upload múltiple, **max 6**, compresión JPEG 55% max 1280x1280px) **obligatorio al menos 1**
- Fotos DESPUÉS (upload múltiple, **max 6**, compresión JPEG 55% max 1280x1280px) **obligatorio al menos 1**
- Fotos persisten entre pasos del wizard (via `useRef` para File objects)
- Fotos persisten al recargar página (via `sessionStorage` con base64)
- Compresión vía `compressImage()`: canvas → toBlob JPEG quality 0.55, max 1280x1280px

### Firma y cierre (Paso 5)
- Firma digital del supervisor (canvas touch, sube como objeto a R2, tipo `firma`) **obligatorio**
- Checkbox obligatorio "Confirmo que los datos son correctos"

## Persistencia de fotos (IMPORTANTE — sin cambios respecto a antes)

Sistema de dos niveles para que las fotos no se pierdan:

### Nivel 1: Entre pasos del wizard (useRef)
- `fotosAntesFilesRef` / `fotosDespuesFilesRef`: refs que guardan arrays de File objects
- `fotosAntesPreview` / `fotosDespuesPreview`: state con arrays de `{ id, url }` (ObjectURLs para mostrar)
- Los refs sobreviven re-renders y cambios de paso, pero NO sobreviven F5

### Nivel 2: Recarga de página (sessionStorage)
- `saveFotosToSession()`: convierte cada File a base64 via `fileToBase64()` y guarda en sessionStorage
- Se ejecuta en cada `handleFotoUpload` y `removeFoto`
- Al montar el wizard: `useEffect` lee sessionStorage, convierte base64 a Files via `base64ToFile()`, y restaura refs + previews
- `clearWizardSession()` limpia sessionStorage (SESSION_KEY + fotosAntes + fotosDespues)

### Al enviar (submit)
- Las fotos se convierten a base64 en el momento del submit (`fileToBase64()`)
- Se envían como arrays de strings base64 en el payload JSON — el backend las sube a R2 (ya no a Airtable attachments)

## Servicios dinámicos (desde Postgres)

Los servicios/trabajos se cargan dinámicamente desde la tabla `servicios` mediante `GET /api/servicios`.

- El frontend hace fetch al montar el wizard
- Si falla, usa `SERVICIOS_FALLBACK` (10 servicios hardcoded en `constants.js`) para funcionar offline
- Solo se muestran servicios con `activo = true`
- Cada servicio tiene `id` (bigint Postgres) y `nombre`
- Los `serviciosIds` (ids de servicios seleccionados, excluyendo fallback y custom) se resuelven server-side a `orden_trabajos.servicio_id`

### Servicio personalizado
- Input de texto + botón verde (`bg-green-500`) con icono Check para agregar
- Se agrega a la lista como servicio custom (sin id de catálogo — guarda `nombre_personalizado`)
- Input con `min-w-0` para evitar overflow en mobile

### SERVICIOS_FALLBACK (offline)
```js
['Destape de alcantarillado', 'Destape de cañería', 'Inspección con cámara CCTV',
 'Limpieza de fosa séptica', 'Mantención preventiva', 'Reparación de cañería',
 'Instalación de cañería nueva', 'Hidro-jet alta presión', 'Excavación y reparación', 'Otro']
```

## Validación de campos obligatorios

Validación por paso del wizard. Al presionar "Siguiente" se validan los campos del paso actual. Si hay errores:
- No avanza al siguiente paso
- Campos con error tienen borde rojo + mensaje de error debajo
- Auto-scroll al primer campo con error
- Errores se limpian al corregir el campo

### Paso 1 (Cliente)
- RUT, Cliente/Empresa, Supervisor, Email (formato), Teléfono, Dirección, Comuna

### Paso 2 (Trabajos)
- Hora Inicio, Hora Término, al menos 1 trabajo seleccionado, Descripción

### Paso 3 (Personal)
- Patente (solo requerido, sin validación de formato estricta)

### Paso 4 (Fotos)
- **Al menos 1 foto ANTES y 1 foto DESPUÉS** (obligatorio, valida contra `fotosAntesFilesRef.current.length`)

### Paso 5 (Firma)
- Firma obligatoria para enviar

## Flujo del Wizard (5 pasos, `client/`)

1. **Cliente**: RUT (con búsqueda pública, sin auth), cliente/empresa, supervisor/encargado, email, teléfono, dirección, comuna, OC
2. **Trabajos**: Hora inicio/término (layout vertical), checklist dinámica de servicios con cantidad + servicio personalizado, descripción, observaciones, pago
3. **Personal**: Patente vehículo, personal asignado (solo técnicos activos de Postgres)
4. **Fotos**: Fotos antes y después (camera o galería, max 6 cada uno, compresión JPEG, obligatorias)
5. **Firma**: Resumen completo con "No especificado" en naranja para campos vacíos, firma digital, checkbox de confirmación, botón Enviar

## Pantallas de la app técnica (`client/`)

| Ruta | Componente | Descripción |
|---|---|---|
| `/` | DashboardPage | Pantalla principal: botón "Nueva Orden" + buscador + historial de órdenes con cards |
| `/orden/nueva` | OrdenWizardPage | Wizard de 5 pasos para crear nueva orden |
| `/orden/:recordId` | DetalleOrdenPage | Detalle completo de una orden (fotos, firma, PDF, reenviar) |
| `/orden/:recordId/editar` | OrdenWizardPage (editMode) | Editar y reenviar una orden existente |
| `/confirmacion` | ConfirmacionPage | Resultado del envío con checks detallados |

### Navegación
- **Header** (`bg-condor-900`): Logo "Condor 360" (link al dashboard) + botón contextual (Dashboard: "+ Nueva Orden" rojo / Otras: "← Inicio") + nombre usuario + cerrar sesión
- **ConfirmacionPage**: Botón "Nueva Orden" (→ /orden/nueva) + botón "Ir al Inicio" (→ /)

### DashboardPage
- Botón rojo "Nueva Orden de Trabajo" en la parte superior (deshabilitado si el kill switch está inactivo)
- **Buscador**: client-side sobre las órdenes ya cargadas — numeroOrden, clienteEmpresa, supervisor, direccion, comuna, clienteRut, descripcion, estado. Case-insensitive, debounce 300ms, botón X para limpiar.
- Lista de órdenes desde Postgres (`GET /api/ordenes`, últimas 50, ya ordenadas por el backend)
- Cards con: número de orden, badge estado (colores sólidos), cliente/empresa + fecha (formato DD/MM/YYYY Chile), dirección/comuna
- Badges: Completada=verde, Enviada=azul, Pendiente=amarillo, Facturacion pendiente=naranja, Facturada=púrpura (+ `Error` vestigial gris, no es un valor real del CHECK de `ordenes.estado`)
- Banner naranja de "N órdenes pendientes" si hay cola offline
- `SubscriptionBanner` si el kill switch está inactivo
- Click en card navega al detalle (`/orden/:recordId`)
- Botón de refresh, estados de carga y vacío, AppFooter con versión + NotStudio.cl

### DetalleOrdenPage
- Header: "← Volver" + número orden + badge estado
- Carga `GET /api/ordenes/:id` (endpoint real por id, ya no filtra client-side sobre 50 — acepta tanto id numérico Postgres como `rec*` legacy de Airtable para links viejos cacheados)
- Secciones: Info cliente, Trabajo (con hora badges en formato DD/MM/YYYY HH:MM Chile), Equipo, Pago
- Fotos antes/después: grid de thumbnails (URLs públicas de R2), click abre PhotoViewer modal (fullscreen negro, navegación prev/next)
- Firma del supervisor
- Botón "Ver PDF de la Orden" → window.open (o gris "PDF pendiente de generar" si no hay)
- Botón "Reintentar Envío" (deshabilitado si el kill switch está inactivo) para órdenes con estado Error/Pendiente o sin PDF (`POST /api/ordenes/:id/reenviar`)
- Botón "Volver al Inicio"
- NO tiene botón de editar en sí (existe `/orden/:recordId/editar`, ver abajo)
- AppFooter con versión + NotStudio.cl

### OrdenWizardPage (modo edición)
- Acepta prop `editMode` y usa `useParams` para obtener `recordId`
- Carga datos existentes de la orden y los mapea al formato del formulario (`personal` se resetea siempre al usuario logueado, no restaura el personal original)
- En submit usa `actualizarOrden` (PUT `/api/ordenes/:id`) en vez de `crearOrden` (POST)
- Título paso 5: "Editar y Reenviar" en vez de "Resumen y Firma"
- Botón: "Actualizar y Reenviar" en vez de "Enviar Orden de Trabajo"

### ConfirmacionPage
- Fondo coloreado según estado (verde/amarillo/rojo)
- Número de orden destacado en grande (de `webhookData.numeroOrden`)
- Card blanca con **4 checks**: Registro creado / Fotos subidas correctamente / PDF generado / Orden procesada correctamente
- Colores checks: verde #065F46 para OK, rojo #991B1B para errores
- **Botón "Ver PDF"**: aparece cuando `webhookData.pdfUrl` existe
- Si es duplicado: pill "Esta orden ya fue registrada anteriormente"
- Botones: Reintentar (si error), Nueva Orden, Ir al Inicio
- Footer inline (NO usa AppFooter) con colores blancos translúcidos (`text-white/60`, `text-white/40`)

## Admin panel (`admin/`)

App Vite+React+Tailwind **separada** de `client/` (sin workspace compartido, `admin/package.json` propio), pensada para escritorio, HashRouter, `base: '/condor-sistema/admin/'` (subpath bajo el mismo dominio de GitHub Pages que `client/` — pero el pipeline que realmente lo publique ahí todavía no existe, ver "Estado de la migración"). Dev server en puerto 5174 (vs 5173 de `client/`), proxy `/api → http://localhost:3001` en dev.

### Roles

`admin` y `oficina` (tabla `admin_users`). El frontend oculta menú/rutas por rol (`hasRole()`, `Sidebar.jsx`, `ProtectedRoute.jsx` con fallback a tarjeta "Acceso restringido", nunca un loop de redirect) **solo por UX** — el enforcement real vive en el backend (`requireRole`), verificado independientemente. Rutas/endpoints solo-admin: Configuración, Usuarios, Auditoría (routers completos), más puntualmente `DELETE /api/admin/ordenes/:id`, `POST /api/admin/plantillas/enviar-prueba`, y toda `routes/admin/notificaciones.js` salvo `/log`.

### Rutas

| Path | Página | Rol |
|---|---|---|
| `/login` | LoginPage | — |
| `/` | DashboardPage | cualquier logueado |
| `/ordenes` | OrdenesListPage | cualquier logueado |
| `/ordenes/nueva` | OrdenDetallePage (modo `esNuevaOrden`) | cualquier logueado |
| `/ordenes/:id` | OrdenDetallePage | cualquier logueado |
| `/clientes`, `/clientes/:id` | ClientesPage | cualquier logueado |
| `/servicios` | ServiciosPage | cualquier logueado |
| `/correos` | CorreosPage (correos de la empresa: `email_reply_to` = Responder-a de TODO correo del sistema y `email_interno` = copia de cada orden, en app_settings; logo + historial; plantillas solo notstudio) | **admin** |
| `/integraciones` | IntegracionesPage (Resend/Telegram/webhook n8n) | **notstudio** (404 para el resto) |
| `/notificaciones` | redirige a `/correos` | — |
| `/configuracion` | ConfiguracionPage = General (kill switch, redirección de correos) | **notstudio** |
| `/usuarios`, `/usuarios/:id` | UsuariosPage (todas las personas) | **admin** |
| `/invitacion/:token` | InvitacionPage (pública) | — |
| `/personal` | redirige a `/usuarios` | — |
| `/auditoria` | AuditoriaPage | **admin** |

### Pantallas — qué permiten

- **Dashboard** (rediseñado 2026-09-22 — Condor registra el trabajo, no la plata: de 653 órdenes ninguna trae monto y los estados de facturación no se usan): KPIs de operación agregados en SQL con corte `America/Santiago` (`dashboardRepo.getKpis`): órdenes de la semana y del mes con comparación "a la misma altura" del período anterior y ritmo proyectado, horas de hidrojet del mes, duración mediana/promedio (90 d); órdenes por técnico (30 d), clientes con más órdenes agrupados por RUT (90 d, con % del total), día de la semana acumulado 6 meses, top servicios del mes (cantidad + nº de órdenes), "Órdenes con problemas" (sin PDF / sin fotos, más contadores de avisos fallidos y jobs en error) y últimas órdenes. Sin KPIs en pesos ni "pendientes de facturar".
- **Órdenes** (lista): columna de PDF al inicio (ícono → modal con el PDF embebido + Descargar, `components/PdfPreview.jsx`, como H&A; `listOrdenesAdmin` devuelve `pdf_url`), paginación real server-side, filtros por estado (chips con contadores reales), búsqueda, selección múltiple + "Marcar como Facturada" en lote, cambio de estado inline por fila, export a Excel (solo la página cargada, no el dataset completo), botón "Nueva orden".
- **Órdenes** (detalle/edición, la pantalla más grande — también sirve `/ordenes/nueva`): distribución estilo H&A (2026-09-22): cabecera con volver, "Orden 00650" + subtítulo, selector de estado, Ver PDF, Regenerar PDF y menú ⋯ (Reenviar / Eliminar admin); debajo tarjetas Cliente / Trabajo / Pago / Equipo / Fotos / Notificaciones / Historial, cada una con su propio Editar y guardado independiente (`buildFormFromOrden(orden)` + campos de esa sección, `components/SectionCard.jsx`). Modo creación = todas editables. Antes: edición completa (horas, patente, trabajos+cantidad, descripción/observaciones, cliente vía buscador con link/unlink, pago, equipo, fotos con agregar/marcar-eliminar), botón "Reenviar" (regenera PDF + reintenta notificaciones, lee el resultado real por canal en vez de asumir éxito), botón "Cambiar estado", botón "Ver PDF", historial de auditoría expandible por orden. Al crear manualmente, la orden nace `'Enviada'` **sin fotos/PDF/notificaciones** — se completan después desde la ficha. Botón "Eliminar" visible solo para rol admin (con confirmación; los objetos de R2 quedan huérfanos a propósito).
- **Clientes**: ficha como PÁGINA propia `/clientes/:id` (2026-09-22, ya no es modal): cabecera, Datos en 3 columnas, Estadísticas, Otros locales con este RUT, Historial completo de órdenes; alta/edición completa, detección de duplicados por `rut_normalizado` con acciones "Fusionar" (soft merge, `merged_into`, elige un registro "ganador") y "No son duplicados" (marca `rut_grupos_revisados`, para casos como una misma empresa con varios locales que comparten RUT), "Otros locales con este RUT" en la ficha.
- **Personal**: (fusionada en Usuarios, ver Autenticación) — antes: layout de tabla (`DataTable`), técnicos con stats reales (total órdenes, monto generado), alta con **PIN aleatorio mostrado una sola vez**, ficha editable completa (nombre/RUT/teléfono/usuario/fecha ingreso/especialidades/activo), "Resetear PIN" (idem, una sola vez), activar/desactivar (soft toggle, sin eliminación real). Distinta de "Usuarios" — aclarado textualmente en la propia página.
- **Servicios**: CRUD con rename inline, activar/desactivar (Deshacer), eliminar **solo si `usos === 0`** (si tiene usos, el botón se convierte en "desactivar" automáticamente — protección explícita contra huérfanos).
- **Notificaciones**: tab Plantillas (editor de bloques reordenables, preview contra una orden real, "Enviar prueba" real) + tab Historial (log filtrable por canal/fallidas, "Reenviar" por fila).
- **Configuración** (admin): logo para emails (sube a R2, referenciado en `app_settings`), tarjetas Resend/Telegram con secreto enmascarado y "Probar conexión". El kill switch de suscripción **no está aquí ni en ningún lado del admin** — vive solo en EasyPanel.
- **Usuarios** (admin): CRUD de `admin_users` con invitación por email, cambio de rol inline, reset de password, guards (no auto-desactivarse/degradarse, no dejar el sistema sin ningún admin activo).
- **Auditoría** (admin): log global de `audit_log` con filtros por entidad/usuario/fecha.

## API Endpoints

### Públicos / técnico (montados directo en `index.js`)

```
GET    /api/subscription-status         # Estado del kill switch (público)
GET    /api/health                      # Health check
POST   /api/auth/login                  # Login técnico: usuario/RUT + PIN (rate-limited)
GET    /api/tecnicos-lista              # Técnicos activos, pre-login (público)
GET    /api/tecnicos                    # Técnicos activos con más detalle (auth)
GET    /api/servicios                   # Servicios activos (público)
GET    /api/clientes/buscar?q=          # Buscar clientes por RUT/nombre/empresa/email/tel/comuna (público)
GET    /api/ordenes                     # Últimas 50 órdenes hidratadas (público)
GET    /api/ordenes/:id                 # Detalle por id (numérico o rec* legacy) (público)
POST   /api/ordenes                     # Crear orden completa (auth + subscriptionGate)
PUT    /api/ordenes/:id                 # Editar y reenviar (auth + subscriptionGate)
POST   /api/ordenes/:id/reenviar        # Regenerar PDF + reenviar notificaciones (auth + subscriptionGate)
```

`authMiddleware` en modo `warn` (default) acepta requests sin token — no bloquea de verdad salvo `AUTH_ENFORCE=enforce`.

### Admin (`/api/admin/*`, JWT admin, todas detrás de `subscriptionGate`)

```
POST   /api/admin/auth/login                       # público (rate-limited), bloqueado si kill switch inactivo

GET    /api/admin/dashboard/kpis                    # todos

GET    /api/admin/ordenes                            # todos — lista paginada real
GET    /api/admin/ordenes/:id                         # todos
POST   /api/admin/ordenes                             # todos — alta manual de oficina
PUT    /api/admin/ordenes/:id                          # todos — edición completa
PATCH  /api/admin/ordenes/:id/estado                   # todos
PATCH  /api/admin/ordenes/estado-masivo                # todos
POST   /api/admin/ordenes/:id/fotos                    # todos
DELETE /api/admin/ordenes/:id/fotos/:fotoId             # todos
POST   /api/admin/ordenes/:id/regenerar-pdf              # todos
POST   /api/admin/ordenes/:id/reenviar                   # todos
GET    /api/admin/ordenes/:id/notificaciones              # todos
GET    /api/admin/ordenes/:id/auditoria                    # todos
DELETE /api/admin/ordenes/:id                                # SOLO admin

GET    /api/admin/clientes                          # todos
GET    /api/admin/clientes/buscar?q=                  # todos
GET    /api/admin/clientes/duplicados                  # todos
POST   /api/admin/clientes/duplicados/:rut/descartar     # todos
POST   /api/admin/clientes/fusionar                        # todos
GET    /api/admin/clientes/:id                       # todos
GET    /api/admin/clientes/:id/ordenes                 # todos
GET    /api/admin/clientes/:id/mismo-rut                 # todos
GET    /api/admin/clientes/:id/stats                       # todos
POST   /api/admin/clientes                           # todos
PUT    /api/admin/clientes/:id                         # todos

GET    /api/admin/empleados                          # todos
GET    /api/admin/empleados/:id                        # todos
GET    /api/admin/empleados/:id/stats                    # todos
POST   /api/admin/empleados                           # todos
PUT    /api/admin/empleados/:id                          # todos
POST   /api/admin/empleados/:id/reset-pin                  # todos

GET    /api/admin/servicios                          # todos
POST   /api/admin/servicios                            # todos
PUT    /api/admin/servicios/:id                          # todos
DELETE /api/admin/servicios/:id                            # todos (409 si usos>0)

GET    /api/admin/notificaciones/log                  # todos
GET    /api/admin/notificaciones                       # SOLO admin
GET    /api/admin/notificaciones/:canal                  # SOLO admin
PUT    /api/admin/notificaciones/:canal                    # SOLO admin
POST   /api/admin/notificaciones/:canal/test                 # SOLO admin

GET    /api/admin/plantillas                          # todos
GET    /api/admin/plantillas/:key                        # todos
PUT    /api/admin/plantillas/:key                           # todos
DELETE /api/admin/plantillas/:key                              # todos (vuelve al default)
POST   /api/admin/plantillas/preview                    # todos
POST   /api/admin/plantillas/enviar-prueba                    # SOLO admin

GET    /api/admin/settings/logo                          # SOLO admin
POST   /api/admin/settings/logo                             # SOLO admin

GET    /api/admin/usuarios                              # SOLO admin
POST   /api/admin/usuarios                                 # SOLO admin
PUT    /api/admin/usuarios/:id                                # SOLO admin
POST   /api/admin/usuarios/:id/reset-password                    # SOLO admin
DELETE /api/admin/usuarios/:id                                      # SOLO admin

GET    /api/admin/auditoria                              # SOLO admin
```

**Endpoints eliminados respecto a la era Airtable/n8n**: `POST /api/upload-pdf`, `GET /api/diagnostico-webhook`, `GET /api/test-webhook`, `POST /api/test-envio` ya no existen — no hay `multer` montado, no hay `/uploads/`.

### `GET /api/servicios`
```json
{ "success": true, "data": [ { "id": 7, "nombre": "Varillaje y destape de cámaras" } ] }
```
(`id` es ahora un bigint de Postgres, ya no un `recXXX` de Airtable.)

### Respuesta de POST /api/ordenes (contrato congelado, ver sección arriba)
```json
{
  "success": true,
  "data": {
    "airtableOk": true,
    "recordId": 412,
    "webhookOk": true,
    "webhookError": null,
    "fotosOk": true,
    "webhookData": {
      "success": true,
      "numeroOrden": "00412",
      "pdfUrl": "https://<r2-public>/ordenes/00412/pdf/....pdf",
      "pdfGenerado": true,
      "airtableActualizado": true
    },
    "duplicate": false
  }
}
```

## Variables de entorno

### `server/.env.staging` (staging real, gitignored) / equivalente en producción

```
NODE_ENV
PORT                        # opcional, default 3001 (Docker fija 3000)
DATABASE_URL                # obligatoria — throw al arrancar si falta
CORS_ORIGIN                 # opcional, default '*'
JWT_SECRET                  # obligatoria — throw al arrancar si falta (compartida por ambos JWT)
JWT_TECNICO_EXPIRES_IN       # opcional, default '30d'
JWT_ADMIN_EXPIRES_IN         # opcional, default '12h'
AUTH_ENFORCE                 # opcional, 'enforce' o 'warn' (default)
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID             # obligatoria para operar R2
R2_SECRET_ACCESS_KEY         # obligatoria para operar R2
R2_BUCKET_NAME               # obligatoria para operar R2
R2_ENDPOINT                  # obligatoria para operar R2
R2_PUBLIC_URL                # obligatoria — arma URLs públicas de fotos/PDF
GOTENBERG_URL                 # obligatoria para generar PDF
APP_ENCRYPTION_KEY           # obligatoria — cifra/descifra credenciales Resend/Telegram (pgcrypto)
```

`SUBSCRIPTION_ACTIVE` / `SUBSCRIPTION_MESSAGE` **no van en `.env.staging`** — solo se setean directamente en las env vars del servicio EasyPanel de producción (ver Autenticación → Kill switch).

Credenciales de Resend/Telegram **no son env vars** — viven cifradas en Postgres, se configuran desde el admin.

`server/.env.example` (el único `.env*` trackeado en git) documenta estas mismas variables, más `WEBHOOK_NOTIFICACIONES_URL` y `EMAIL_DEV_REDIRECT`.

### `client/.env` / `client/.env.local`
```
VITE_API_URL=http://localhost:3001/api
```
Fallback hardcodeado en producción: `https://clientes-condor-api.f8ihph.easypanel.host/api` (dominio del backend de **producción** — hoy corre el código viejo de `main`, no Postgres/R2, hasta que se haga el corte).

### `admin/.env.local`
```
VITE_API_URL=http://localhost:3097/api
```
Mismo fallback hardcodeado que `client/` si no se define.

## Migración histórica (`migration/`)

Paquete standalone (`migration/package.json`, deps propias: `@aws-sdk/client-s3`, `airtable`, `pg`, `p-limit`, `bcrypt`), **fuera del Dockerfile**, corrida única (re-ejecutable) Airtable → Postgres + R2.

- `migrate.mjs`: migra en orden por FK — Servicios → Empleados (PIN bcrypt) → Clientes (TRIM, teléfonos placeholder→NULL, RUTs duplicados se migran tal cual, la fusión es post-migración vía admin) → Órdenes + adjuntos (throttle sobre el rate limit de Airtable, adjuntos descargados y subidos a R2 de inmediato porque las URLs de Airtable expiran en ~2h).
- Todo `upsert` por `airtable_record_id` — re-ejecutable indefinidamente contra staging sin duplicar.
- **Gotcha al correrlo desde un Mac**: el `.env` raíz trae el `DATABASE_URL` INTERNO (`condor_condor-postgres`, no resuelve fuera de EasyPanel) y se carga primero. Hay que hacer `set -a; . server/.env.staging; set +a` ANTES de `node migrate.mjs` para que gane el host externo.
- Flags: `--limit=N` (default 5 órdenes por corrida) y `--finalize` (ejecuta `setval()` real sobre `ordenes_numero_seq` — se omite en corridas parciales para no atrasar la secuencia).
- `migration/r2-manifest.json` (commiteado, ~28k líneas): manifiesto de progreso para idempotencia de subida de adjuntos.
- Al final reporta conteos migrados, grupos de RUT duplicado detectados, y un diccionario de "casos raros" (huérfanos, JSON inválido, valores fuera de whitelist, adjuntos fallidos).
- Estado real ya ejecutado contra staging: 410/410 órdenes, 58 clientes, 9 empleados, 12 servicios, 4.732/4.732 adjuntos.

## Pantalla de Confirmación (`client/`)

| Estado | Color fondo | Icono | Título | Botones |
|---|---|---|---|---|
| Postgres OK + PDF/notif OK | Verde `bg-emerald-500` | CheckCircle | "Orden Registrada" | Ver PDF + Nueva Orden + Ir al Inicio |
| Postgres OK + PDF/notif FALLÓ | Amarillo `bg-amber-500` | AlertTriangle | "Orden Guardada" | Reintentar + Nueva Orden + Ir al Inicio |
| Offline | Amarillo `bg-amber-500` | Clock | "Orden Guardada" | Nueva Orden + Ir al Inicio |
| Error total | Rojo `bg-red-600` | XCircle | "Error al Enviar" | Reintentar + Nueva Orden + Ir al Inicio |
| Duplicado detectado | Verde `bg-emerald-500` | CheckCircle | "Orden Registrada" + pill "ya registrada" | Nueva Orden + Ir al Inicio |

(Los nombres `airtableOk`/`webhookOk` en el código son el contrato congelado descrito arriba — ya no implican una llamada real a Airtable/n8n.)

## Soporte offline (`client/`)

### Guardado en IndexedDB
- Si `!navigator.onLine` al enviar, la orden se guarda directo en IndexedDB vía `savePendingOrder()` sin intentar `fetch`.
- También como fallback si el `fetch` falla con `TypeError` de red, o si la respuesta es `>=500`.
- Librería: `idb`, DB `condor-offline-db`, store `pending-orders`. Estados posibles: `pending`, `sending`, `error`, `auth-required`, `sent`.

### Auto-sync al reconectar (`syncManager.js`)
- Único dueño de los listeners `online`/`offline` (registrados una vez desde `OfflineIndicator.jsx`, guard a nivel de módulo evita duplicados). `App.jsx` explícitamente no tiene su propio listener de red.
- Antes de sincronizar, `resetStuckSendingOrders()` limpia zombies `sending` con más de 2 minutos.
- **401/403 nunca consume reintentos**: la orden pasa a `auth-required` (no cuenta contra `MAX_RETRIES=5`) y dispara el evento `auth-error` — salvo que sea `code: 'SUBSCRIPTION_INACTIVE'` (kill switch), que tiene su propio banner y no implica sesión vencida.
- `resumeAfterReauth()` (llamado tras un login exitoso) mueve las `auth-required` de vuelta a `pending` y sincroniza de inmediato — el login **no borra** IndexedDB ni el sessionStorage del wizard, así que se retoma exactamente donde quedó.
- Reintentos con backoff exponencial (`2^retries * 1000` ms) sobre errores reales (5xx/red); un `400` (dato inválido) se propaga visible, sin reintentar.

### OfflineIndicator
- Componente que muestra banner cuando `!navigator.onLine` y cuenta de pendientes.

### SERVICIOS_FALLBACK
- Si `GET /api/servicios` falla, el wizard usa 10 servicios hardcoded de `constants.js`.
- Estos servicios no tienen id de catálogo, se guardan como `nombre_personalizado`.

## Utilidades (`client/src/utils/helpers.js`)

| Función | Descripción |
|---|---|
| `formatRut(value)` | Formatea RUT chileno: 12345678-9 → 12.345.678-9 |
| `formatCLP(amount)` | Formatea monto CLP: 350000 → $350.000 |
| `parseCLP(str)` | Parsea CLP a número: $350.000 → 350000 |
| `todayISO()` | Fecha hoy YYYY-MM-DD |
| `todayFormatted()` | Fecha hoy DD/MM/YYYY |
| `compressImage(file, maxWidth=1280, quality=0.55, maxHeight=1280)` | Comprime imagen a JPEG vía canvas |
| `fileToBase64(file)` | File/Blob → data URL base64 |
| `base64ToFile(base64, filename)` | Data URL base64 → File |
| `formatFechaAmigable(isoString)` | ISO → DD/MM/YYYY (timezone Chile `America/Santiago`) |
| `formatHoraAmigable(isoString)` | ISO → HH:MM (timezone Chile) |
| `formatFechaHoraAmigable(isoString)` | ISO → DD/MM/YYYY HH:MM (timezone Chile) |

El admin tiene su propio `admin/src/utils/format.js` equivalente (RUT/CLP/fechas Chile) — no comparte código con `client/` (apps separadas).

## Convenciones de código

- JavaScript/JSX (no TypeScript), en `client/`, `admin/` y `server/`
- ESM (`"type": "module"` en los 3 `package.json`)
- Tailwind CSS para estilos, NO CSS-in-JS
- Componentes funcionales con hooks
- Nombres: PascalCase para componentes, camelCase para utils
- API responses: `{ success: true, data: ... }` o `{ success: false, error: "mensaje" }`
- Mensajes de error en español
- Fechas: timezone `America/Santiago`, locale `es-CL`
- Backend: SQL parametrizado directo (`pg`), sin ORM — no introducir uno
- Secretos sensibles (Resend/Telegram) nunca en texto plano en DB ni en respuestas HTTP — siempre vía `notificacionesRepo.getDecryptedSecret`, nunca expuestos a rutas que no sean el propio envío

## Consideraciones UX importantes

1. **Mobile-first** (client): Botones grandes (min 44px touch target), inputs generosos.
2. **Desktop-first** (admin): tablas densas, atajos, sin optimización táctil.
3. **Chile-specific**: RUT formatting, precios en CLP con separador de miles, teléfonos +56, timezone America/Santiago — en ambas apps.
4. **Firmas digitales**: Canvas touch ancho con borde punteado, sube como objeto R2.
5. **Servicios dinámicos**: Se cargan desde Postgres tabla `servicios`. Checkbox + counter + servicio personalizado (botón verde). Fallback offline.
6. **Resumen antes de enviar**: Campos vacíos en naranja "No especificado". Checkbox obligatorio de confirmación.
7. **Login técnico**: Usuario o RUT (texto libre) + PIN de 4 dígitos. Login admin: email + password. Sistemas y JWT completamente separados.
8. **Progreso de envío**: Mensajes de estado durante el envío (registrando cliente, guardando orden, subiendo fotos, procesando).
9. **Validación por paso**: Campos obligatorios con bordes rojos y mensajes de error. No avanza sin completar.
10. **Dashboard técnico**: Historial ordenado por fecha desc, cards clickeables, buscador con debounce, refresh manual, fechas en formato Chile.
11. **Detalle de orden**: Vista completa con fotos (visor fullscreen), firma, PDF, botón reenviar, fechas/horas en formato Chile.
12. **Edición de órdenes**: técnico (wizard) y admin (formulario de una página con fotos/cliente/audit log) son flujos distintos, ambos terminan regenerando PDF.
13. **Anti-duplicados**: Idempotency key + ref guard + `UNIQUE` en Postgres. El usuario nunca ve duplicados.
14. **Fotos obligatorias**: Mínimo 1 antes y 1 después, máximo 6 cada uno. Compresión JPEG 55% max 1280x1280px.
15. **Fotos persistentes**: Sobreviven navegación entre pasos (refs) y recarga de página (sessionStorage base64).
16. **Solo técnicos activos de Postgres**: No hay opción de "persona externa" en el personal.
17. **Confirmación clara**: 4 checks visuales + botón Ver PDF + número de orden destacado.
18. **Sesión larga en terreno, corta en oficina**: 30 días técnico vs 12h admin — la revocación real es siempre por estado en DB, no por expiración del token.
19. **Kill switch invisible al producto**: nunca mostrar ni permitir editar `SUBSCRIPTION_ACTIVE` desde ninguna UI — es exclusivo de EasyPanel.
20. **RUT compartido no es error**: varios clientes con el mismo RUT (ej. locales distintos de una misma empresa) es un caso válido — nunca forzar fusión automática, solo sugerirla.

## Deploy

- **Frontend técnico (`client/`)**: en EasyPanel (`Dockerfile.client`, nginx, `VITE_BASE=/`) bajo `condor.notstudio.cl`; además GitHub Pages (`base: '/condor-sistema/'`, `client/.env.production`) sirve la misma app en la URL antigua.
- **Admin (`admin/`)**: en EasyPanel (`Dockerfile.admin`, nginx, `VITE_BASE=/admin/`) bajo `condor.notstudio.cl/admin/`. No se publica en Pages.
- **Backend (`server/`)**: EasyPanel + Docker. El `Dockerfile` (raíz) construye **solo `server/`** (copia también el logo PNG de `client/public/` para los PDFs). Los tres servicios del proyecto "condor" tienen auto-deploy desde `main`.
- **Adjuntos**: Cloudflare R2 (bucket único), ya no `/uploads/` local ni limpieza cada 30 min — eso desapareció con la migración.
- **Infraestructura EasyPanel relevante** (según el plan de migración): proyecto **"clientes"** corre el backend de producción (`clientes-condor-api.f8ihph.easypanel.host`, hoy todavía en modo Airtable porque no se ha hecho el corte); proyecto **"condor"** aloja el Postgres/backend de **staging** usados durante todo este trabajo; Gotenberg self-hosted confirmado alcanzable en `infra-gotenberg.f8ihph.easypanel.host`.
- **Repo**: https://github.com/notstudiocl/condor-sistema
- **Rama de trabajo**: `main`.
