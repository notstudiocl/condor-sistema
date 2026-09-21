# Tasks

Rama `feat/postgres-migration` — versión NUEVA de Condor 360 (Postgres + R2 + admin), hosteada en EasyPanel (proyecto "condor"). La app antigua (`main`, GitHub Pages, Airtable) **no se toca** hasta el corte. Arquitectura completa en `CLAUDE.md`.

## Active

- [ ] **Migración de datos Airtable → Postgres (corrida completa con `--finalize`)** - en curso desde 2026-09-21
  - Partió en 410 órdenes; Airtable iba en la OT-00654. Verificar al terminar: conteos, adjuntos fallidos y `ordenes_numero_seq >= MAX(numero_orden)`.
- [ ] **Orden de prueba end-to-end en el entorno hosteado** - crear desde terreno → Postgres → fotos R2 → PDF Gotenberg → log de notificaciones
  - Hacerla después de que termine la migración (para no chocar con la secuencia) y borrarla al final.
- [ ] **Admin: botón "Eliminar orden"** - el backend ya expone `DELETE /api/admin/ordenes/:id` (solo rol admin), falta `eliminarOrden` en `admin/src/utils/api.js` y el botón con confirmación
- [ ] **Admin: ocultar "Enviar prueba" de plantillas para rol `oficina`** - hoy se ve y da 403
- [ ] **Admin: versión sincronizada** - `LoginPage.jsx` tiene `APP_VERSION='1.0.0'` hardcodeado, desalineado del client (2.0.0)
- [ ] **Limpieza legacy del backend** - `server/.env.example` documenta Airtable/n8n viejo; `services/airtable.js` y la dependencia npm `airtable` son código muerto; import sin usar en `ConfiguracionPage.jsx`
- [ ] **Apuntar los frontends a `https://condor.notstudio.cl/api`** - hoy llaman a `condor-condor-app.f8ihph.easypanel.host` (funciona, pero el dominio propio debe quedar horneado en la PWA antes de que los técnicos la instalen)
  - Depende del registro DNS.

## Waiting On

- [ ] **Registro DNS en Cloudflare** - Matías, since 2026-09-21
  - `A condor → 31.97.241.33`, DNS only (nube gris). Rutas `/`, `/admin`, `/api` ya creadas en EasyPanel.
- [ ] **OK para mandar un mensaje de prueba al grupo de Telegram de Condor** - Matías, since 2026-09-21
  - Chat `-5133715111` con el bot "Hermes NotStudio"; falta confirmar que Hermes está en ese grupo.
- [ ] **Cambiar la contraseña temporal de `admin@notstudio.cl`** - Matías, since 2026-09-21
- [ ] **Subir logo de emails y crear usuarios de oficina de Condor desde el admin** - Matías

## Someday

- [ ] **Corte a producción** - última corrida de `migrate.mjs --finalize` con Airtable congelado, quitar `EMAIL_DEV_REDIRECT`, `AUTH_ENFORCE=enforce`, avisar a técnicos, reemplazar la app de GitHub Pages por un redirect a `condor.notstudio.cl` (cuidando el service worker viejo), apagar el n8n viejo
- [ ] **Cerrar el puerto externo de Postgres (54320)** - solo se necesita abierto para correr `migration/` desde fuera
- [ ] **Indicador de progreso al subir fotos en el wizard**

## Done

- [x] ~~Hostear backend, app de terreno y admin en EasyPanel (servicios `condor-app`, `condor-terreno`, `condor-admin`)~~ (2026-09-21)
- [x] ~~Base path configurable: terreno en `/`, admin en `/admin/` de `condor.notstudio.cl`~~ (2026-09-21)
- [x] ~~Notificaciones híbridas vía n8n de infra, igual que H&A (workflow `xHDVroUIki70ilfa`) + modo desarrollo de correos~~ (2026-09-21)
- [x] ~~Reset de contraseña del admin y verificación de login~~ (2026-09-21)
