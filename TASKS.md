# Tasks

Rama `feat/postgres-migration` — versión NUEVA de Condor 360 (Postgres + R2 + admin), hosteada en EasyPanel (proyecto "condor"). La app antigua (`main`, GitHub Pages, Airtable) **no se toca** hasta el corte. Arquitectura completa en `CLAUDE.md`.

## Active

- [ ] **🔴 INCIDENTE PRODUCCIÓN (app antigua): desde 2026-09-20 las órdenes quedan sin fotos, sin PDF y sin correo** - reportado por el cliente por audio
  - Causa: Airtable rechaza los adjuntos ("The operation cannot be processed") — la base usa 1,66 GB de adjuntos y el límite del plan Free es 1 GB; funcionó hasta el 17/09, así que el workspace habría bajado de plan (pago fallido / suscripción vencida). El registro se crea, el update de adjuntos revienta y nunca se llama a n8n.
  - Afectadas: OT-00652, 00653, 00654 (sin fotos: se perdieron, `/uploads` se limpia cada 30 min).
  - Salidas: (a) reactivar el plan pago de Airtable = arreglo inmediato; (b) adelantar el corte al sistema nuevo, que no depende de Airtable.
- [ ] **Unificación de usuarios (igual que H&A)** - una sola tabla de personas (`empleados`) con `rol`, accesos por contexto (PIN = terreno, email+password = panel)
  - [ ] Migración `003_unify_usuarios.sql`: columnas nuevas, `admin_users` → `empleados`, re-apuntar FKs, drop de la tabla vieja
  - [ ] Backend: claim `aud:'admin'` en el JWT del panel, estado releído de la DB en cada request, bloqueo compartido 5 fallos/15 min, invitaciones 72 h, redacción de secretos en auditoría
  - [ ] Roles `tecnico/oficina/admin/notstudio`; `notstudio` invisible y con 404 (credenciales e integraciones solo para NotStudio)
  - [ ] Una sola vía de escritura: `/api/admin/usuarios` (las mutaciones de `/api/admin/empleados` desaparecen)
  - [ ] Admin UI: dar/quitar acceso al panel a un técnico existente, PIN desde el mismo perfil, pantalla de aceptar invitación
  - [ ] Aplicar la migración en Postgres DESPUÉS de que termine la migración de datos, y probar ambos logins
- [ ] **Migración de datos Airtable → Postgres (corrida completa con `--finalize`)** - en curso desde 2026-09-21
  - Partió en 410 órdenes; Airtable iba en la OT-00654. Verificar al terminar: conteos, adjuntos fallidos y `ordenes_numero_seq >= MAX(numero_orden)`.
- [ ] **Orden de prueba end-to-end en el entorno hosteado** - crear desde terreno → Postgres → fotos R2 → PDF Gotenberg → log de notificaciones
  - Hacerla después de que termine la migración (para no chocar con la secuencia) y borrarla al final.

## Waiting On

- [ ] **OK para mandar un mensaje de prueba al grupo de Telegram de Condor** - Matías, since 2026-09-21
  - Chat `-5133715111` con el bot "Hermes NotStudio"; falta confirmar que Hermes está en ese grupo.
- [ ] **Cambiar la contraseña temporal de `admin@notstudio.cl`** - Matías, since 2026-09-21
- [ ] **Subir logo de emails y crear usuarios de oficina de Condor desde el admin** - Matías

## Someday

- [ ] **Corte a producción** - última corrida de `migrate.mjs --finalize` con Airtable congelado, quitar `EMAIL_DEV_REDIRECT`, `AUTH_ENFORCE=enforce`, avisar a técnicos, reemplazar la app de GitHub Pages por un redirect a `condor.notstudio.cl` (cuidando el service worker viejo), apagar el n8n viejo
- [ ] **Cerrar el puerto externo de Postgres (54320)** - solo se necesita abierto para correr `migration/` desde fuera
- [ ] **Indicador de progreso al subir fotos en el wizard**

## Done

- [x] ~~Dominio `condor.notstudio.cl` operativo: DNS, certificado Let's Encrypt, rutas `/`, `/admin`, `/api` verificadas; frontends apuntando a `https://condor.notstudio.cl/api`~~ (2026-09-21)
- [x] ~~Admin: botón "Eliminar orden" (solo rol admin, con confirmación)~~ (2026-09-21)
- [x] ~~Admin: "Enviar prueba" de plantillas oculto para rol oficina~~ (2026-09-21)
- [x] ~~Admin: versión sincronizada con el client (`admin/src/version.js`, 2.0.0)~~ (2026-09-21)
- [x] ~~Limpieza legacy: `airtable.js` + deps `airtable`/`multer` fuera, `.env.example` reescrito, import muerto~~ (2026-09-21)
- [x] ~~Hostear backend, app de terreno y admin en EasyPanel (servicios `condor-app`, `condor-terreno`, `condor-admin`)~~ (2026-09-21)
- [x] ~~Base path configurable: terreno en `/`, admin en `/admin/` de `condor.notstudio.cl`~~ (2026-09-21)
- [x] ~~Notificaciones híbridas vía n8n de infra, igual que H&A (workflow `xHDVroUIki70ilfa`) + modo desarrollo de correos~~ (2026-09-21)
- [x] ~~Reset de contraseña del admin y verificación de login~~ (2026-09-21)
