# Tasks

Rama `feat/postgres-migration` — versión NUEVA de Condor 360 (Postgres + R2 + admin), hosteada en EasyPanel (proyecto "condor"). La app antigua (`main`, GitHub Pages, Airtable) **no se toca** hasta el corte. Arquitectura completa en `CLAUDE.md`.

## Active

- [ ] **Unificación de usuarios (igual que H&A)** - una sola tabla de personas con `rol`; accesos por contexto (PIN = terreno, correo+contraseña = panel)
  - [x] Backend (migración 003, personasRepo, claim `aud`, bloqueo, invitaciones, redacción de secretos, notstudio 404)
  - [x] Admin UI: pantalla Usuarios unificada (lista + ficha), invitación pública, Configuración solo notstudio
  - [ ] Aplicar 003 en Postgres real y verificar ambos logins en vivo; `ADMIN_PANEL_URL` en condor-app
- [ ] **🔴 INCIDENTE PRODUCCIÓN (app antigua): desde 2026-09-20 las órdenes quedan sin fotos, sin PDF y sin correo** - reportado por el cliente por audio
  - Causa probable: Airtable rechaza los adjuntos (1,66 GB usados, límite Free 1 GB). Salidas: reactivar plan pago o hacer el corte al sistema nuevo. El cliente ya fue avisado de que la actualización lo resuelve.
- [ ] **Limpiar residuos del QA**: órdenes OT-00655/00657/00658, clientes "PRUEBA QA" (ids 316 y el de RUT 55.555.555-5) — hacerlo desde el admin (Eliminar) o SQL acotado a esos ids
- [ ] **Orden de prueba end-to-end en el entorno hosteado** - crear desde terreno → Postgres → fotos R2 → PDF Gotenberg → log de notificaciones
  - Hacerla después de que termine la migración (para no chocar con la secuencia) y borrarla al final.

## Waiting On

- [ ] **Desactivar el técnico de pruebas `matias` (NotStudio Pruebas, TCN039) al hacer el corte** - aparece en "Personal asignado" de todos los técnicos mientras esté activo
- [ ] **OK para mandar un mensaje de prueba al grupo de Telegram de Condor** - Matías, since 2026-09-21
  - Chat `-5133715111` con el bot "Hermes NotStudio"; falta confirmar que Hermes está en ese grupo.
- [ ] **Cambiar la contraseña temporal de `admin@notstudio.cl`** - Matías, since 2026-09-21
- [ ] **Subir logo de emails y crear usuarios de oficina de Condor desde el admin** - Matías

## Someday

- [ ] **Corte a producción** - última corrida de `migrate.mjs --finalize` con Airtable congelado, quitar `EMAIL_DEV_REDIRECT`, `AUTH_ENFORCE=enforce`, avisar a técnicos, reemplazar la app de GitHub Pages por un redirect a `condor.notstudio.cl` (cuidando el service worker viejo), apagar el n8n viejo
- [ ] **Cerrar el puerto externo de Postgres (54320)** - solo se necesita abierto para correr `migration/` desde fuera
- [ ] **Indicador de progreso al subir fotos en el wizard**

## Done

- [x] ~~QA completo de terreno (11 hallazgos) y admin (16 hallazgos) con corrección: validación server-side de órdenes, plantillas 100% dinámicas, enviar-prueba por el camino real, errores legibles, auditoría faltante, fecha en el admin, firma en la ficha, debounce, logo con cache-buster, etc.~~ (2026-09-22)
- [x] ~~Migración completa Airtable → Postgres con `--finalize`: 653 órdenes, 7.592 adjuntos, 0 fallos; secuencia en 654~~ (2026-09-21)
- [x] ~~Admin: pie del sidebar ("Ir a la app de terreno" + créditos + versión) y bloque de usuario del topbar al estilo H&A~~ (2026-09-21)
- [x] ~~Bug: el admin mostraba TODAS las fechas de órdenes un día antes (fecha pura parseada como UTC)~~ (2026-09-21)
- [x] ~~Switch Terreno | Oficina en el login de ambas apps (`components/AppSwitch.jsx`, copia gemela en cada app)~~ (2026-09-21)
- [x] ~~Dominio `condor.notstudio.cl` operativo: DNS, certificado Let's Encrypt, rutas `/`, `/admin`, `/api` verificadas; frontends apuntando a `https://condor.notstudio.cl/api`~~ (2026-09-21)
- [x] ~~Admin: botón "Eliminar orden" (solo rol admin, con confirmación)~~ (2026-09-21)
- [x] ~~Admin: "Enviar prueba" de plantillas oculto para rol oficina~~ (2026-09-21)
- [x] ~~Admin: versión sincronizada con el client (`admin/src/version.js`, 2.0.0)~~ (2026-09-21)
- [x] ~~Limpieza legacy: `airtable.js` + deps `airtable`/`multer` fuera, `.env.example` reescrito, import muerto~~ (2026-09-21)
- [x] ~~Hostear backend, app de terreno y admin en EasyPanel (servicios `condor-app`, `condor-terreno`, `condor-admin`)~~ (2026-09-21)
- [x] ~~Base path configurable: terreno en `/`, admin en `/admin/` de `condor.notstudio.cl`~~ (2026-09-21)
- [x] ~~Notificaciones híbridas vía n8n de infra, igual que H&A (workflow `xHDVroUIki70ilfa`) + modo desarrollo de correos~~ (2026-09-21)
- [x] ~~Reset de contraseña del admin y verificación de login~~ (2026-09-21)
