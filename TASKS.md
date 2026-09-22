# Tasks

Condor 360 en producción desde el 2026-09-22 (rama `main`, EasyPanel proyecto "condor", `condor.notstudio.cl`). Arquitectura completa en `CLAUDE.md`.

## Active

- [ ] **OT-00661 (Colegio Tomás Moro, 26/03, "limpieza ducto con hidrojet")** - entró hoy desde la cola offline del teléfono de Marcelo Moncada junto a dos duplicadas (662 y 663, ya eliminadas). No tiene par exacto en el historial: preguntar a Marcelo si es un trabajo real distinto o un intento de la misma orden 00014; si es duplicado, eliminarla. Los clientes (Tomás Moro y Rentokil) recibieron hoy los correos de esas órdenes viejas.
- [ ] **Vigilar órdenes con fecha antigua estos días** - cualquier técnico con órdenes atrapadas en el teléfono las soltará al actualizar la app; revisar en el dashboard si son reales o duplicadas
- [ ] **Primera orden nueva real en producción** - revisar cuando llegue (será la OT-00662): PDF en R2, correo al cliente con Responder-a de Condor, copia interna, Telegram al grupo, fila en el historial de Correos
- [ ] **Crear las cuentas de oficina de Condor** - desde Usuarios, cuando Francisco pase los correos (les llega invitación de 72 h). Hasta entonces el cliente no tiene acceso al panel.
- [ ] **Órdenes 652 a 657 sin fotos ni PDF** (incidente Airtable) - las completan los técnicos desde la app (editar y reenviar) o la oficina desde el panel (agregar fotos + Regenerar PDF + Reenviar). Aparecen en "Órdenes con problemas" del dashboard hasta entonces.

## Waiting On

- [ ] **Correos de Francisco y de la oficina** - Matías, since 2026-09-22 (para crear las cuentas)
- [ ] **Cambiar la contraseña temporal de `admin@notstudio.cl`** - Matías, since 2026-09-21
- [ ] **Subir el logo para los correos** (Correos → Logo) - Matías
- [ ] **CNAME `www.condor` → `condor.notstudio.cl` en Cloudflare** - Matías, opcional (las rutas `www` ya están en EasyPanel)
- [ ] **Respuestas de Francisco a dos preguntas del análisis del dashboard**: ¿registrar montos/facturación en la app o va aparte? ¿Rentokil necesita reporte mensual por local (es el 62 % de la operación)?

## Someday

- [ ] **Cancelar Airtable** tras el período de respaldo (2–3 semanas sin necesitar rescatar nada)
- [ ] **Cerrar el puerto externo de Postgres (54320)** - solo hace falta para correr `migration/` desde fuera
- [ ] **Indicador de progreso al subir fotos en el wizard de terreno** - hoy solo hay textos por etapa; la barra real requiere XMLHttpRequest con `upload.onprogress`
- [ ] **Tablas del admin en celular como tarjetas** (hoy scroll lateral) y timeline de estados en la ficha de orden (se quitó al adoptar el layout de H&A)
- [ ] **Borrar `feat/postgres-migration` en GitHub** cuando ya no haga falta como referencia

## Done

- [x] ~~Backend viejo `clientes/condor-api` detenido (junto con gotenberg, hya-api y simyt-api del mismo proyecto, todos sin uso) y los 2 workflows de Condor desactivados en el n8n viejo~~ (2026-09-22)
- [x] ~~Usuarios de prueba eliminados (técnico matias, matias@notstudio.cl, oficina@notstudio.cl)~~ (2026-09-22)
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
