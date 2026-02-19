# CLAUDE.md — Condor 360 · Sistema de Órdenes de Trabajo v2.0.0

## Qué es este proyecto

Sistema de digitalización de órdenes de trabajo para **Condor Alcantarillados** (marca comercial: **Condor 360**), empresa chilena de soluciones sanitarias, transporte de residuos e hidrojet.

Reemplaza formularios en papel que los técnicos llenan en terreno. El flujo es: técnico llega al sitio → abre la app en su celular → llena el formulario → marca trabajos realizados → captura firma del supervisor y fotos antes/después → envía → el sistema guarda en Airtable (con linked records), sube fotos y firma como attachments, y notifica vía webhook n8n. El técnico puede ver historial de órdenes, ver detalles, y reenviar órdenes con error.

Desarrollado por **NotStudio.cl** (https://notstudio.cl).

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

El logo es un archivo PNG en `client/public/condor-logo.png`.

### Fuentes (Tailwind)
- **Heading**: DM Sans (`font-heading`)
- **Body**: IBM Plex Sans (`font-body`)
- **Monospace**: JetBrains Mono (`font-mono`)

## Arquitectura

```
condor-sistema/
├── client/                # React + Vite (PWA mobile-first)
│   ├── src/
│   │   ├── components/    # SignaturePad, Summary, Header, AppFooter, OfflineIndicator
│   │   ├── pages/         # LoginPage, DashboardPage, OrdenWizardPage, DetalleOrdenPage, ConfirmacionPage
│   │   ├── utils/         # api.js, constants.js, helpers.js, offlineStorage.js, syncManager.js
│   │   └── version.js     # APP_VERSION = '2.0.0'
│   ├── public/            # condor-logo.png, manifest.json, sw.js
│   └── index.html         # Título: "Condor 360 - Ordenes de Trabajo"
├── server/                # Node.js + Express (API REST)
│   ├── src/
│   │   ├── middleware/     # auth.js (JWT), errorHandler.js
│   │   ├── routes/         # auth.js (login), tecnicos.js, clientes.js
│   │   ├── services/       # airtable.js (empleados, clientes, mock data)
│   │   └── index.js        # Main server: ordenes CRUD + servicios + webhook + upload PDF
│   └── uploads/            # Temp photo/PDF storage (auto-cleaned every 30min)
├── .github/workflows/
│   └── deploy.yml          # GitHub Actions: build client → deploy a GitHub Pages
├── CLAUDE.md               # Este archivo
└── package.json            # Scripts raíz del monorepo
```

**Stack:**
- Frontend: React 18, Vite 6, Tailwind CSS 3, React Router 6 (HashRouter), Lucide React icons
- Backend: Express, Airtable API, JWT auth simple, Multer (upload PDF)
- DB: Airtable (linked records)
- Automatización: n8n vía webhooks
- Deploy: GitHub Pages (frontend, auto-deploy via GitHub Actions) + EasyPanel/Docker (backend)
- Offline: IndexedDB via `idb` library + auto-sync con exponential backoff

## Versionado

La versión se gestiona en `client/src/version.js`:
```js
export const APP_VERSION = '2.0.0';
```

Se muestra en:
- **AppFooter** (Dashboard, DetalleOrden): "Condor 360 © 2026 · v2.0.0" + "Sistema integral desarrollado por NotStudio.cl"
- **LoginPage** (footer inline): mismo texto con colores grises
- **ConfirmacionPage** (footer inline): mismo texto con colores blancos translúcidos (para fondos de color)

## Login y Autenticación

### Campo "Usuario" (NO "Email")
- La tabla Empleados en Airtable usa el campo **"Usuario"** (antes era "Email")
- El login acepta un **input de texto libre** (type="text"), no restringido a email
- Backend (`routes/auth.js`) acepta tanto `email` como `usuario` en el body: `const rawInput = email || usuario || ''`
- Login acepta **Usuario O RUT** (con o sin puntos y guiones): `findTecnicoByCredencial` busca con `OR(LOWER({Usuario}), SUBSTITUTE({RUT}))` en Airtable
- El frontend (`api.js`) envía `{ email, pin }` (mantiene key `email` por compatibilidad)

### JWT Token
- Payload: `{ id, recordId, email, nombre }` (donde `email` = valor de campo Usuario)
- Expira en 12 horas
- `recordId` es el Airtable record ID del empleado (usado para linked record "Responsable Orden")
- Se guarda en `localStorage` como `condor_token`
- El usuario se guarda en `localStorage` como `condor_user`

### LoginPage (diseño actual)
- Fondo blanco con 3 burbujas animadas de blur azul (`animate-pulse` a 4s, 5s, 6s)
- Línea gradiente azul en la parte superior
- Logo con `h-20 object-contain`
- Inputs con `bg-gray-50 border-2 border-gray-100`, focus azul con `group-focus-within` en iconos
- Botón gradiente azul con `shadow-blue-200`, `active:scale-[0.98]`
- Footer inline (NO usa AppFooter) con colores grises

## Flujo de envío de órdenes

Al presionar "Enviar Orden":
0. Verificar idempotency key (prevenir duplicados por race condition o reconexión)
1. Si es cliente nuevo (no vino de búsqueda), crear cliente en Airtable tabla "Clientes"
2. Guardar orden en Airtable tabla "Ordenes de Trabajo" (con linked records + idempotency key)
3. Subir fotos + firma como attachments en Airtable (base64 → archivo → URL → Airtable attachment)
4. Enviar webhook a n8n con todos los datos + recordId de Airtable (sin fotos/firma base64)
5. Leer respuesta JSON del webhook (incluye pdfUrl, numeroOrden, etc.)
6. Responder al frontend con resultado de todo + webhookData

### Idempotency (prevención de duplicados)

Protección en 3 niveles:
1. **Frontend — useRef guard**: `sendingRef` bloquea instantáneamente (sin esperar re-render)
2. **Backend — Set en memoria** (`procesandoOrdenes`): Bloquea requests concurrentes con mismo key. Auto-limpia en 60s
3. **Backend — Airtable check**: Busca campo "Idempotency Key" como respaldo si el servidor se reinició

El `idempotencyKey` se genera una vez al montar el wizard (`useState(() => crypto.randomUUID())`). Se reutiliza en reintentos, y cada nueva orden genera un key nuevo.

### Crash fix
En el catch del POST `/api/ordenes`, se usa `req.body?.idempotencyKey` (optional chaining) para evitar crash si `req.body` es undefined.

### Linked Records (IMPORTANTE)

- **"Cliente RUT"** en Ordenes de Trabajo es un LINKED RECORD a tabla Clientes → se pasa como `[recordId]`
- **"Empleados"** en Ordenes de Trabajo es un LINKED RECORD a tabla Empleados → se pasa como `[recordId1, recordId2, ...]`
- **"Servicios"** en Ordenes de Trabajo es un LINKED RECORD a tabla Servicios → se pasa como `[recordId1, ...]` (campo `serviciosIds`)
- **"Responsable Orden"** en Ordenes de Trabajo es un LINKED RECORD a tabla Empleados → se pasa como `[req.user.recordId]` (el técnico logueado)
- Los record IDs de Airtable se obtienen al buscar clientes, listar técnicos, listar servicios, y al hacer login

### Mapeo Cliente / Supervisor (IMPORTANTE)

- **"Cliente / Empresa"** en Ordenes = nombre de la EMPRESA (ej: "Burger King")
- **"Supervisor"** en Ordenes = nombre de la PERSONA de contacto (ej: "Carla Curififil")
- Al buscar RUT y seleccionar cliente: `Clientes.Empresa` → clienteEmpresa, `Clientes.Nombre` → supervisor
- Al crear cliente nuevo: `supervisor` → Clientes.Nombre, `clienteEmpresa` → Clientes.Empresa

### Campos que NO se envían a Airtable

"Numero orden", "ID", "Creada" son campos computados/automáticos en Airtable. No incluirlos en el create.

## Campos de la Orden de Trabajo (según formulario PDF real)

### Encabezado
- Fecha de la orden (auto: hoy)

### Datos del cliente (Paso 1)
- RUT (formato chileno: 12.345.678-9, con búsqueda autocompletado desde Airtable) **obligatorio**
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
- Trabajos Realizados (checklist dinámica desde Airtable tabla "Servicios" + fallback offline) **al menos 1 obligatorio**
- Servicio personalizado (input + botón verde con Check icon para agregar)
- Descripción del Trabajo (textarea) **obligatorio**
- Observaciones (textarea, opcional)
- Total a Pagar (CLP, formato con separador de miles)
- Método de Pago: Efectivo / Transferencia / Débito / Crédito / Por pagar
- Garantía: Sin garantía / 3 meses / 6 meses / 1 año
- Requiere Factura: Sí / No

### Personal y vehículo (Paso 3)
- Patente vehículo **obligatorio** (sin validación de formato estricta, solo requerido)
- Personal asignado: solo técnicos de Airtable (con recordId), badge azul "Técnico"
- NO hay personas externas (eliminado)

### Evidencia fotográfica (Paso 4)
- Fotos ANTES (upload múltiple, **max 6**, compresión JPEG 70% max 1920px) **obligatorio al menos 1**
- Fotos DESPUÉS (upload múltiple, **max 6**, compresión JPEG 70% max 1920px) **obligatorio al menos 1**
- Fotos persisten entre pasos del wizard (via `useRef` para File objects)
- Fotos persisten al recargar página (via `sessionStorage` con base64)
- Compresión vía `compressImage()`: canvas → toBlob JPEG quality 0.7, max width 1920px

### Firma y cierre (Paso 5)
- Firma digital del supervisor (canvas touch, guardada como attachment en Airtable campo "Firma") **obligatorio**
- Checkbox obligatorio "Confirmo que los datos son correctos"

## Persistencia de fotos (IMPORTANTE)

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
- Las fotos se convierten a base64 en el momento del submit (`processImage()`)
- Se envían como arrays de strings base64 en el payload JSON

## Servicios dinámicos (desde Airtable)

Los servicios/trabajos se cargan dinámicamente desde la tabla "Servicios" en Airtable mediante `GET /api/servicios`.

- El frontend hace fetch al montar el wizard
- Si falla, usa `SERVICIOS_FALLBACK` (10 servicios hardcoded en `constants.js`) para funcionar offline
- Solo se muestran servicios con `Activo = TRUE()` en Airtable
- Cada servicio tiene `id` (Airtable record ID) y `nombre`
- Los `serviciosIds` (record IDs de servicios seleccionados, excluyendo fallback y custom) se envían como linked record

### Servicio personalizado
- Input de texto + botón verde (`bg-green-500`) con icono Check para agregar
- Se agrega a la lista como servicio custom (sin Airtable record ID)
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

## Flujo del Wizard (5 pasos)

1. **Cliente**: RUT (con búsqueda pública, sin auth), cliente/empresa, supervisor/encargado, email, teléfono, dirección, comuna, OC
2. **Trabajos**: Hora inicio/término (layout vertical), checklist dinámica de servicios con cantidad + servicio personalizado, descripción, observaciones, pago
3. **Personal**: Patente vehículo, personal asignado (solo técnicos de Airtable)
4. **Fotos**: Fotos antes y después (camera o galería, max 6 cada uno, compresión JPEG, obligatorias)
5. **Firma**: Resumen completo con "No especificado" en naranja para campos vacíos, firma digital, checkbox de confirmación, botón Enviar

## Pantallas de la app

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
- Botón rojo "Nueva Orden de Trabajo" en la parte superior
- **Buscador**: Input con lupa, busca en numeroOrden, clienteEmpresa, supervisor, direccion, comuna, clienteRut, descripcion, estado. Case-insensitive, debounce 300ms, botón X para limpiar. Muestra "N órdenes encontradas" o "No se encontraron órdenes para '...'"
- Lista de órdenes desde Airtable (`GET /api/ordenes`, ordenadas por Creada desc, max 50)
- Cards con: número de orden, badge estado (colores sólidos), cliente/empresa + fecha (formato DD/MM/YYYY Chile), dirección/comuna
- Badges: Completada=verde, Enviada=azul, Error=rojo, Pendiente=amarillo, Facturada=púrpura
- Click en card navega al detalle (`/orden/:recordId`)
- Botón de refresh, estados de carga y vacío
- AppFooter con versión + NotStudio.cl

### DetalleOrdenPage
- Header: "← Volver" + número orden + badge estado
- Secciones: Info cliente, Trabajo (con hora badges en formato DD/MM/YYYY HH:MM Chile), Equipo, Pago
- Fotos antes/después: grid de thumbnails, click abre PhotoViewer modal (fullscreen negro, navegación prev/next)
- Firma del supervisor
- Botón "Ver PDF de la Orden" → window.open (o gris "PDF pendiente de generar" si no hay)
- Botón "Reintentar Envío" para órdenes con estado Error/Pendiente o sin PDF (POST /api/ordenes/:recordId/reenviar)
- Botón "Volver al Inicio"
- NO tiene botón de editar (diferido para después)
- AppFooter con versión + NotStudio.cl

### OrdenWizardPage (modo edición)
- Acepta prop `editMode` y usa `useParams` para obtener `recordId`
- Carga datos existentes de la orden y los mapea al formato del formulario
- En submit usa `actualizarOrden` (PUT) en vez de `crearOrden` (POST)
- Título paso 5: "Editar y Reenviar" en vez de "Resumen y Firma"
- Botón: "Actualizar y Reenviar" en vez de "Enviar Orden de Trabajo"

### ConfirmacionPage
- Fondo coloreado según estado (verde/amarillo/rojo)
- Número de orden destacado en grande (de `webhookData.numeroOrden`)
- Card blanca con **4 checks**:
  - ✅/❌ Registro creado
  - ✅/❌ Fotos subidas correctamente
  - ✅/❌ PDF generado (de `webhookData.pdfGenerado`)
  - ✅/❌ Orden procesada correctamente
- Colores checks: verde #065F46 para OK, rojo #991B1B para errores
- **Botón "Ver PDF"**: aparece cuando `webhookData.pdfUrl` existe (estilo blanco con icono documento)
- Si es duplicado: pill "Esta orden ya fue registrada anteriormente"
- Botones: Reintentar (si error), Nueva Orden, Ir al Inicio
- Footer inline (NO usa AppFooter) con colores blancos translúcidos (`text-white/60`, `text-white/40`)

## API Endpoints

```
POST   /api/auth/login                 # Login con usuario + PIN (verifica Activo === true)
GET    /api/tecnicos-lista             # Listar técnicos activos (público, sin auth)
GET    /api/servicios                  # Listar servicios activos desde Airtable tabla "Servicios"
GET    /api/clientes/buscar?q=         # Buscar clientes por RUT/nombre (público, sin auth)
GET    /api/ordenes                    # Listar órdenes (sort by Creada desc, max 50)
POST   /api/ordenes                    # Crear orden (sin auth middleware, lee req.user si existe)
PUT    /api/ordenes/:recordId          # Actualizar orden (sin auth middleware, lee req.user si existe)
POST   /api/ordenes/:recordId/reenviar # Reenviar orden al webhook (lee datos de Airtable)
POST   /api/upload-pdf                 # Recibir PDF desde n8n (multipart, multer) y servir públicamente
GET    /api/health                     # Health check
GET    /api/test-webhook               # Diagnóstico: test webhook connectivity
POST   /api/test-envio                 # Diagnóstico: simula envío completo
```

**NOTA IMPORTANTE**: Los endpoints POST/PUT `/api/ordenes` NO usan `authMiddleware`. El token JWT se incluye en headers pero no se valida en estos endpoints. `req.user` puede ser undefined si no hay token — por eso se usa `if (req.user && req.user.recordId)` antes de asignar "Responsable Orden".

### GET /api/servicios
```json
{
  "success": true,
  "data": [
    { "id": "recXXX", "nombre": "Varillaje y destape de cámaras" },
    { "id": "recYYY", "nombre": "Hora Camión Hidrojet" }
  ]
}
```

### Respuesta de POST /api/ordenes
```json
{
  "success": true,
  "data": {
    "airtableOk": true,
    "recordId": "recXXX",
    "webhookOk": true,
    "webhookError": null,
    "webhookData": {
      "success": true,
      "message": "Orden procesada correctamente",
      "numeroOrden": "OT009",
      "pdfUrl": "https://clientes-condor-api.../uploads/xxx.pdf",
      "pdfGenerado": true,
      "airtableActualizado": true
    },
    "duplicate": false
  }
}
```

## Variables de entorno

### Server (.env)
```
PORT=3000
AIRTABLE_API_KEY=pat_xxxxx
AIRTABLE_BASE_ID=appXXXXXX
WEBHOOK_OT_N8N_URL=https://tu-n8n.com/webhook/ordenes-condor
JWT_SECRET=condor_secret_seguro
CORS_ORIGIN=https://tu-usuario.github.io
SERVER_URL=https://clientes-condor-api.f8ihph.easypanel.host
MOCK_MODE=false
```

### Client (.env)
```
VITE_API_URL=http://localhost:3001/api
```

En producción, el fallback hardcoded es `https://clientes-condor-api.f8ihph.easypanel.host/api`.

## Airtable — Estructura de tablas

### Tabla "Ordenes de Trabajo"
Campos: Fecha, Estado (Enviada/Completada/Facturada), Cliente / Empresa, Cliente RUT (LINKED RECORD → Clientes), Cliente email, Cliente telefono, Direccion, Comuna, Orden compra, Supervisor, Hora inicio, Hora termino, Trabajos realizados (JSON string), Descripcion trabajo, Observaciones, Empleados (LINKED RECORD → Empleados), Servicios (LINKED RECORD → Servicios), Responsable Orden (LINKED RECORD → Empleados), Patente vehiculo, Total, Metodo pago, Requiere factura, Garantia, Fotos Antes (attachment), Fotos Despues (attachment), Firma (attachment), PDF (attachment), Idempotency Key (single line text)

Campos automáticos (NO enviar): Numero orden, ID, Creada

### Tabla "Empleados"
Campos: ID, Nombre, **Usuario** (texto libre, antes era "Email"), **RUT** (single line text — RUT del empleado, se puede usar para login), Pin Acceso, Telefono, Activo (checkbox booleano — TRUE/FALSE, NO texto)

**IMPORTANTE**:
- El campo "Usuario" reemplazó al antiguo "Email". Se busca via `LOWER({Usuario})`.
- El campo "RUT" permite login alternativo con RUT (con o sin puntos y guiones). Se normaliza quitando puntos y guiones para comparar.
- Login acepta **Usuario O RUT** — la función `findTecnicoByCredencial` busca en ambos campos con `OR()` en Airtable.
- El campo "Especialidad" fue **eliminado** — ya no existe en la tabla ni en el código.
- El campo "Activo" es un checkbox (booleano), NO un campo de texto. Filtrar con `{Activo} = TRUE()` en Airtable y comparar con `=== true` en JavaScript.

### Tabla "Clientes"
Campos: RUT, Nombre (persona de contacto), Email, Telefono, Direccion, Comuna, Tipo, Empresa (nombre empresa)

### Tabla "Servicios"
Campos: Nombre (texto), Activo (checkbox booleano)

Los servicios se cargan dinámicamente en el wizard via `GET /api/servicios`. Fallback a `SERVICIOS_FALLBACK` si falla la carga.

## Webhook payload (n8n)

Al crear una orden se envía POST al webhook (sin fotos/firma base64 para no hacerlo pesado):
```json
{
  "fecha": "2026-02-17",
  "clienteEmpresa": "Burger King",
  "clienteRut": "12.345.678-9",
  "clienteEmail": "contacto@bk.cl",
  "clienteTelefono": "+56 9 1234 5678",
  "direccion": "Av. Los Leones 1234",
  "comuna": "Providencia",
  "ordenCompra": "OC-001",
  "supervisor": "Carla Curififil",
  "horaInicio": "2026-02-17T08:30",
  "horaTermino": "2026-02-17T12:00",
  "trabajos": [
    { "trabajo": "Hora Camión Hidrojet", "cantidad": 2 },
    { "trabajo": "Evacuación de fosas", "cantidad": 1 }
  ],
  "descripcion": "Se realizó hidrojet en cámaras...",
  "observaciones": "Cliente solicita visita de seguimiento",
  "personal": ["Carlos Méndez", "Diego Silva"],
  "patenteVehiculo": "AB-CD-12",
  "total": 350000,
  "metodoPago": "Transferencia",
  "garantia": "3 meses",
  "requiereFactura": "Sí",
  "serviciosIds": ["recAAA", "recBBB"],
  "idempotencyKey": "uuid-v4",
  "airtableRecordId": "recXXXXXX",
  "clienteRecordId": "recYYYYYY",
  "empleadosRecordIds": ["recAAA", "recBBB"]
}
```

## Pantalla de Confirmación

| Estado | Color fondo | Icono | Título | Botones |
|---|---|---|---|---|
| Airtable OK + Webhook OK | Verde `bg-emerald-500` | CheckCircle | "Orden Registrada" | Ver PDF + Nueva Orden + Ir al Inicio |
| Airtable OK + Webhook FALLÓ | Amarillo `bg-amber-500` | AlertTriangle | "Orden Guardada" | Reintentar + Nueva Orden + Ir al Inicio |
| Offline | Amarillo `bg-amber-500` | Clock | "Orden Guardada" | Nueva Orden + Ir al Inicio |
| Error total | Rojo `bg-red-600` | XCircle | "Error al Enviar" | Reintentar + Nueva Orden + Ir al Inicio |
| Duplicado detectado | Verde `bg-emerald-500` | CheckCircle | "Orden Registrada" + pill "ya registrada" | Nueva Orden + Ir al Inicio |

## Soporte offline

### Guardado en IndexedDB
- Si `!navigator.onLine` al enviar, la orden se guarda en IndexedDB via `savePendingOrder()` (`offlineStorage.js`)
- También como fallback si `fetch` falla con TypeError/network error
- Librería: `idb` (lightweight IndexedDB wrapper)

### Auto-sync al reconectar
- `App.jsx` escucha evento `online` y ejecuta `retryPendingOrders()`
- `syncManager.js`: reintentos con exponential backoff, máximo 5 reintentos
- Órdenes exitosas se marcan como `sent`, fallidas incrementan `retries`

### OfflineIndicator
- Componente que muestra banner cuando `!navigator.onLine`

### SERVICIOS_FALLBACK
- Si `GET /api/servicios` falla, el wizard usa 10 servicios hardcoded de `constants.js`
- Estos servicios NO tienen `id` de Airtable, por lo que no se envían como linked records

## Técnicos de prueba (modo mock)

| Usuario | PIN | Nombre |
|---|---|---|
| carlos.mendez@condor.cl | 1234 | Carlos Méndez |
| laura.torres@condor.cl | 1234 | Laura Torres |
| diego.silva@condor.cl | 1234 | Diego Silva |
| camila.rojas@condor.cl | 1234 | Camila Rojas |

## Utilidades (`client/src/utils/helpers.js`)

| Función | Descripción |
|---|---|
| `formatRut(value)` | Formatea RUT chileno: 12345678-9 → 12.345.678-9 |
| `formatCLP(amount)` | Formatea monto CLP: 350000 → $350.000 |
| `parseCLP(str)` | Parsea CLP a número: $350.000 → 350000 |
| `todayISO()` | Fecha hoy YYYY-MM-DD |
| `todayFormatted()` | Fecha hoy DD/MM/YYYY |
| `compressImage(file, maxWidth=1920, quality=0.7)` | Comprime imagen a JPEG vía canvas |
| `fileToBase64(file)` | File/Blob → data URL base64 |
| `base64ToFile(base64, filename)` | Data URL base64 → File |
| `formatFechaAmigable(isoString)` | ISO → DD/MM/YYYY (timezone Chile `America/Santiago`) |
| `formatHoraAmigable(isoString)` | ISO → HH:MM (timezone Chile) |
| `formatFechaHoraAmigable(isoString)` | ISO → DD/MM/YYYY HH:MM (timezone Chile) |

## Convenciones de código

- JavaScript/JSX (no TypeScript)
- ESM (`"type": "module"` en package.json)
- Tailwind CSS para estilos, NO CSS-in-JS
- Componentes funcionales con hooks
- Nombres: PascalCase para componentes, camelCase para utils
- API responses: `{ success: true, data: ... }` o `{ success: false, error: "mensaje" }`
- Mensajes de error en español
- Fechas: timezone `America/Santiago`, locale `es-CL`

## Consideraciones UX importantes

1. **Mobile-first**: Botones grandes (min 44px touch target), inputs generosos.
2. **Chile-specific**: RUT formatting, precios en CLP con separador de miles, teléfonos +56, timezone America/Santiago.
3. **Firmas digitales**: Canvas touch ancho con borde punteado, guardada como attachment en Airtable.
4. **Servicios dinámicos**: Se cargan desde Airtable tabla "Servicios". Checkbox + counter + servicio personalizado (botón verde). Fallback offline.
5. **Resumen antes de enviar**: Campos vacíos en naranja "No especificado". Checkbox obligatorio de confirmación.
6. **Login simple**: Usuario (texto libre) + PIN de 4 dígitos. Verifica campo `Activo` (checkbox booleano).
7. **Progreso de envío**: Mensajes de estado durante el envío (registrando cliente, guardando orden, subiendo fotos, procesando).
8. **Validación por paso**: Campos obligatorios con bordes rojos y mensajes de error. No avanza sin completar.
9. **Dashboard**: Historial de órdenes ordenado por fecha desc, cards clickeables, buscador con debounce, refresh manual, fechas en formato Chile.
10. **Detalle de orden**: Vista completa con fotos (visor fullscreen), firma, PDF, botón reenviar, fechas/horas en formato Chile.
11. **Edición de órdenes**: Carga datos existentes en el wizard, permite editar y reenviar.
12. **Anti-duplicados**: Idempotency key + ref guard + in-memory Set. El usuario nunca ve duplicados.
13. **Fotos obligatorias**: Mínimo 1 antes y 1 después, máximo 6 cada uno. Compresión JPEG 70% max 1920px.
14. **Fotos persistentes**: Sobreviven navegación entre pasos (refs) y recarga de página (sessionStorage base64).
15. **Solo técnicos de Airtable**: No hay opción de "persona externa" en el personal.
16. **Confirmación clara**: 4 checks visuales + botón Ver PDF + número de orden destacado.

## Deploy

- **Frontend**: GitHub Pages con `base: '/condor-sistema/'` en vite.config.js, usando HashRouter. Deploy automático via GitHub Actions al hacer push a main.
- **Backend**: EasyPanel con Docker, variable CORS_ORIGIN apuntando al dominio de GitHub Pages
- **Fotos/PDFs**: Se guardan en `/uploads/` del server, fotos se limpian cada 30 min (1 hora de vida)
- **Repo**: https://github.com/notstudiocl/condor-sistema
- **Deploy workflow**: `.github/workflows/deploy.yml` — trigger on push to main, build client, deploy to gh-pages
