# Tasks

Rama `feat/postgres-migration` — versión NUEVA de Condor 360 (Postgres + R2 + admin), hosteada en EasyPanel (proyecto "condor"). La app antigua (`main`, GitHub Pages, Airtable) **no se toca** hasta el corte. Arquitectura completa en `CLAUDE.md`.

## Active

- [ ] **Orden de prueba end-to-end en producción** - crear desde terreno con un técnico real (ya sin redirección de correos: le llega al cliente) o esperar la primera orden real y revisar PDF + correos + Telegram - crear desde terreno → Postgres → fotos R2 → PDF Gotenberg → log de notificaciones
  - Hacerla después de que termine la migración (para no chocar con la secuencia) y borrarla al final.

## Waiting On

- [ ] **OK para mandar un mensaje de prueba al grupo de Telegram de Condor** - Matías, since 2026-09-21
  - Chat `-5133715111` con el bot "Hermes NotStudio"; falta confirmar que Hermes está en ese grupo.
- [ ] **Cambiar la contraseña temporal de `admin@notstudio.cl`** - Matías, since 2026-09-21
- [ ] **Subir logo de emails y crear usuarios de oficina de Condor desde el admin** - Matías

## Someday

- [ ] **Apagar el backend viejo (`clientes/condor-api`) y el n8n viejo** cuando se confirme que nadie usa la app antigua (2–3 semanas)
- [ ] **Cancelar Airtable** tras el período de respaldo
- [ ] **Cerrar el puerto externo de Postgres (54320)** - solo se necesita abierto para correr `migration/` desde fuera
- [ ] **Indicador de progreso al subir fotos en el wizard**

## Done

- [x] ~~CORTE A PRODUCCIÓN: main = código nuevo, EasyPanel despliega desde main, la URL vieja de Pages sirve la app nueva, migración final (656 órdenes), redirección de correos apagada, AUTH_ENFORCE=enforce, técnico de pruebas desactivado~~ (2026-09-22)
- [x] ~~Correo de respuesta (Reply-To) e interno de Condor configurables desde Correos, aplicados a todo correo del sistema; botón Ver PDF en la lista de órdenes (modal, como H&A)~~ (2026-09-22)
- [x] ~~Dashboard rediseñado con KPIs de operación (sin plata): semana/mes con comparación, hidrojet, duración, por técnico, por cliente (RUT), día de la semana 6 meses, órdenes con problemas~~ (2026-09-22)
- [x] ~~Ficha de orden por secciones (Cliente/Trabajo/Pago/Equipo/Fotos) con edición por tarjeta y acciones en la cabecera; ficha de cliente como página propia — distribución de H&A con estilo Condor~~ (2026-09-22)
- [x] ~~Cola de trabajos en Postgres (PDF/notificaciones con reintentos) + alertas a NotStudio por Telegram, con tarjeta en Configuración → General~~ (2026-09-22)
- [x] ~~Admin reestructurado como H&A: sidebar plano + grupo Configuración desplegable (General y Integraciones solo NotStudio; Usuarios, Correos y Auditoría para admin); kill switch y redirección de correos editables desde General; Correos = logo + historial (plantillas solo NotStudio)~~ (2026-09-22)
- [x] ~~Unificación de usuarios desplegada (migración 003 aplicada en producción; admin@notstudio.cl es rol notstudio)~~ (2026-09-22)
- [x] ~~Admin adaptado a celular (vertical y horizontal)~~ (2026-09-22)
- [x] ~~Residuos del QA eliminados (órdenes 00655/00657/00658, clientes de prueba)~~ (2026-09-22)
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
