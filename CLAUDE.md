# CLAUDE.md — Condor Alcantarillados · Sistema de Órdenes de Trabajo

## Qué es este proyecto

Sistema de digitalización de órdenes de trabajo para **Condor Alcantarillados**, empresa chilena de soluciones sanitarias, transporte de residuos e hidrojet.

Reemplaza formularios en papel que los técnicos llenan en terreno. El flujo es: técnico llega al sitio → abre la app en su celular → llena el formulario → marca trabajos realizados → captura firma del supervisor y fotos antes/después → envía → el sistema guarda en Airtable (con linked records), sube fotos y firma como attachments, y notifica vía webhook n8n. El técnico puede ver historial de órdenes, ver detalles, y editar/reenviar órdenes existentes.

## Datos de la empresa

| Propiedad | Valor |
|---|---|
| Nombre comercial | Condor Alcantarillados |
| Tagline | Soluciones Sanitarias · Transportes de Residuos · Hidrojet |
| Web | www.condoralcantarillados.cl |
| Email | alcantarilladoscondor@gmail.com |
| Teléfono | +56 9 9743 9183 |
| Dirección | Amunategui N°232 Oficina 1904, Santiago |

## Branding y colores

| Propiedad | Valor |
|---|---|
| Color primario | `#1E3A8A` (azul oscuro / condor-900) |
| Color acento | `#DC2626` (rojo) |
| Color secundario | `#3B82F6` (azul medio) |
| Fondo login | Gradiente azul oscuro |
| Botón principal | Azul oscuro `#1E3A8A` |
| Botón acción importante (enviar, nueva orden) | Rojo `#DC2626` |
| Estados activos / checks | Azul `#2563EB` |

El logo es un archivo PNG en `client/public/condor-logo.png`.

## Arquitectura

```
condor-sistema/
├── client/          # React + Vite (PWA mobile-first)
│   ├── src/
│   │   ├── components/   # SignaturePad, Summary, Header, OfflineIndicator
│   │   ├── pages/        # LoginPage, DashboardPage, OrdenWizardPage, DetalleOrdenPage, ConfirmacionPage
│   │   └── utils/        # api.js, constants.js, helpers.js, offlineStorage.js, syncManager.js
│   └── ...
├── server/          # Node.js + Express (API REST)
│   ├── src/
│   │   ├── middleware/    # auth.js, errorHandler.js
│   │   ├── routes/        # auth.js, tecnicos.js, clientes.js
│   │   ├── services/      # airtable.js (read-only: clientes, empleados, login)
│   │   └── index.js       # Main server + ordenes endpoint + public endpoints
│   └── uploads/           # Temp photo/PDF storage (auto-cleaned every 30min)
├── CLAUDE.md        # Este archivo
└── package.json     # Scripts raíz del monorepo
```

**Stack:**
- Frontend: React 18, Vite, Tailwind CSS 3, React Router (HashRouter), Lucide React icons
- Backend: Express, Airtable API, JWT auth simple, Multer (upload PDF)
- DB: Airtable (linked records)
- Automatización: n8n vía webhooks
- Deploy: GitHub Pages (frontend) + EasyPanel/Docker (backend)

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

### Linked Records (IMPORTANTE)

- **"Cliente RUT"** en Ordenes de Trabajo es un LINKED RECORD a tabla Clientes → se pasa como `[recordId]`
- **"Empleados"** en Ordenes de Trabajo es un LINKED RECORD a tabla Empleados → se pasa como `[recordId1, recordId2, ...]`
- Los record IDs de Airtable se obtienen al buscar clientes, listar técnicos, y al hacer login

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

### Datos del cliente
- Cliente / Empresa (nombre de la empresa)
- Supervisor / Encargado (nombre de la persona de contacto)
- RUT (formato chileno: 12.345.678-9, con búsqueda autocompletado desde Airtable)
- Correo electrónico
- Teléfono
- Dirección
- Comuna
- Orden de Compra (opcional, para clientes empresa)

### Horarios
- Hora Inicio (datetime-local)
- Hora Término (datetime-local)

### Trabajos Realizados (checklist con cantidad)

| Trabajo | Ejemplo cantidad |
|---|---|
| Varillaje y destape de cámaras | 3 |
| Horizontal – Vertical Descarga General | 1 |
| Limpieza Manual de fosas | 0 |
| Hora Camión Hidrojet | 2 |
| Visita en Terreno | 1 |
| Varillaje Restaurant Operativo | 0 |
| Trasvasije | 0 |
| Evacuación de fosas | 1 |
| Mantención aguas servidas | 0 |
| Mantención aguas grasas | 0 |

### Descripción del Trabajo (textarea)
### Observaciones (textarea, opcional)

### Personal y vehículo
- Patente vehículo (formato: "AB-CD-12")
- Personal asignado: lista con técnicos de Airtable (con recordId) + externos manuales
- Badge azul "Técnico" para empleados de Airtable, badge gris "Externo" para manuales

### Pago
- Total a pagar (CLP, formateado con separador de miles)
- Método de Pago: Efectivo / Transferencia / Débito / Crédito / Por pagar
- Garantía: Sin garantía / 3 meses / 6 meses / 1 año
- Requiere Factura: Sí / No

### Evidencia fotográfica
- Fotos ANTES (upload múltiple, max 5, resize a 1200px, PNG base64)
- Fotos DESPUÉS (upload múltiple, max 5, resize a 1200px, PNG base64)

### Firma y cierre
- Firma digital del supervisor (canvas touch, guardada como attachment en Airtable campo "Firma")
- Checkbox obligatorio "Confirmo que los datos son correctos"

## Flujo del Wizard (5 pasos)

1. **Cliente**: RUT (con búsqueda pública, sin auth), cliente/empresa, supervisor/encargado, email, teléfono, dirección, comuna, OC, horarios
2. **Trabajos**: Checklist de trabajos con cantidad, descripción, observaciones, pago
3. **Personal**: Patente vehículo, personal asignado, chips de técnicos de Airtable, agregar persona externa
4. **Fotos**: Fotos antes y después (camera o galería)
5. **Firma**: Resumen completo con "No especificado" en naranja para campos vacíos, firma digital, checkbox de confirmación, botón Enviar

## Pantallas de la app

| Ruta | Componente | Descripción |
|---|---|---|
| `/` | DashboardPage | Pantalla principal: botón "Nueva Orden" + historial de órdenes con cards |
| `/orden/nueva` | OrdenWizardPage | Wizard de 5 pasos para crear nueva orden |
| `/orden/:recordId` | DetalleOrdenPage | Detalle completo de una orden (fotos, firma, personal, etc.) |
| `/orden/:recordId/editar` | OrdenWizardPage (editMode) | Editar y reenviar una orden existente |
| `/confirmacion` | ConfirmacionPage | Resultado del envío con colores según estado |

### Navegación
- **Header**: Logo (link al dashboard) + botón "← Inicio" + nombre usuario + cerrar sesión
- **ConfirmacionPage**: Botón "Nueva Orden" (→ /orden/nueva) + botón "Ir al Inicio" (→ /)

### DashboardPage
- Botón rojo "Nueva Orden de Trabajo" en la parte superior
- Lista de órdenes desde Airtable (`GET /api/ordenes`)
- Cards con: número de orden, fecha, estado (badge de color), cliente/empresa, trabajos, total
- Click en card navega al detalle (`/orden/:recordId`)
- Botón de refresh, estados de carga y vacío

### DetalleOrdenPage
- Vista completa de todos los campos de la orden
- Labels: "Cliente / Empresa", "Supervisor / Encargado"
- Fotos antes/después como thumbnails (URLs de Airtable)
- Firma del supervisor (URL de Airtable)
- Botón "Reintentar Envío" para órdenes con estado Error/Pendiente (PUT request)
- Botón "Editar y Reenviar" navega a `/orden/:recordId/editar`
- Botón volver al dashboard

### OrdenWizardPage (modo edición)
- Acepta prop `editMode` y usa `useParams` para obtener `recordId`
- Carga datos existentes de la orden y los mapea al formato del formulario
- En submit usa `actualizarOrden` (PUT) en vez de `crearOrden` (POST)
- Título paso 5: "Editar y Reenviar" en vez de "Resumen y Firma"
- Botón: "Actualizar y Reenviar" en vez de "Enviar Orden de Trabajo"

### ConfirmacionPage (detallada)
- Fondo coloreado según estado (verde/amarillo/rojo)
- Número de orden destacado en grande (de webhookData.numeroOrden)
- Card blanca con checks detallados de cada paso:
  - ✅/❌ Registro creado en Airtable
  - ✅/❌ Fotos subidas correctamente
  - ✅/❌ Firma guardada
  - ✅/❌ PDF generado (de webhookData.pdfGenerado)
  - ✅/❌ Orden procesada por n8n
  - 📄 Número de orden (azul #1E3A8A)
- Colores checks: verde #065F46 para OK, rojo #991B1B para errores
- Si es duplicado: pill "Esta orden ya fue registrada anteriormente"
- Botones: Reintentar (si error), Nueva Orden, Ir al Inicio

## API Endpoints

```
POST   /api/auth/login          # Login con email + PIN (devuelve recordId del empleado)
GET    /api/tecnicos-lista       # Listar técnicos activos (público, sin auth, incluye recordId)
GET    /api/clientes/buscar?q=   # Buscar clientes por RUT/nombre (público, sin auth, incluye recordId, nombre, empresa)
GET    /api/ordenes              # Listar todas las órdenes (público, con attachments URLs, campo clienteEmpresa)
POST   /api/ordenes              # Crear orden → idempotency check → Airtable + fotos + firma + webhook n8n
PUT    /api/ordenes/:recordId    # Actualizar orden → Airtable + re-upload attachments + webhook con accion:'actualizar'
POST   /api/upload-pdf           # Recibir PDF desde n8n (multipart, multer) y servir públicamente
GET    /api/health               # Health check
GET    /api/test-webhook         # Diagnóstico: test webhook connectivity
POST   /api/test-envio           # Diagnóstico: simula envío completo
GET    /api/clientes/test        # Diagnóstico: test Airtable clientes
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

## Airtable — Estructura de tablas

### Tabla "Ordenes de Trabajo"
Campos: Fecha, Estado (Enviada/Completada/Facturada), Cliente / Empresa, Cliente RUT (LINKED RECORD → Clientes), Cliente email, Cliente telefono, Direccion, Comuna, Orden compra, Supervisor, Hora inicio, Hora termino, Trabajos realizados (JSON string), Descripcion trabajo, Observaciones, Empleados (LINKED RECORD → Empleados), Patente vehiculo, Total, Metodo pago, Requiere factura, Garantia, Fotos Antes (attachment), Fotos Despues (attachment), Firma (attachment), Idempotency Key (single line text)

Campos automáticos (NO enviar): Numero orden, ID, Creada

### Tabla "Empleados"
Campos: ID, Nombre, Email, Pin Acceso, Telefono, Especialidad, Estado (Activo/Inactivo)

### Tabla "Clientes"
Campos: RUT, Nombre (persona de contacto), Email, Telefono, Direccion, Comuna, Tipo, Empresa (nombre empresa)

## Webhook payload (n8n)

Al crear una orden se envía POST al webhook (sin fotos/firma base64 para no hacerlo pesado):
```json
{
  "fecha": "2026-02-16",
  "clienteEmpresa": "Burger King",
  "clienteRut": "12.345.678-9",
  "clienteEmail": "contacto@bk.cl",
  "clienteTelefono": "+56 9 1234 5678",
  "direccion": "Av. Los Leones 1234",
  "comuna": "Providencia",
  "ordenCompra": "OC-001",
  "supervisor": "Carla Curififil",
  "horaInicio": "2026-02-16T08:30",
  "horaTermino": "2026-02-16T12:00",
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
  "idempotencyKey": "uuid-v4",
  "airtableRecordId": "recXXXXXX",
  "clienteRecordId": "recYYYYYY",
  "empleadosRecordIds": ["recAAA", "recBBB"]
}
```

## Pantalla de Confirmación

| Estado | Color fondo | Icono | Título | Botones |
|---|---|---|---|---|
| Airtable OK + Webhook OK | Verde `#10B981` | CheckCircle | "Orden Registrada" | Nueva Orden + Ir al Inicio |
| Airtable OK + Webhook FALLÓ | Amarillo `#F59E0B` | AlertTriangle | "Orden Guardada" | Reintentar + Nueva Orden + Ir al Inicio |
| Offline | Amarillo `#F59E0B` | Clock | "Orden Guardada" | Nueva Orden + Ir al Inicio |
| Error total | Rojo `#DC2626` | XCircle | "Error al Enviar" | Reintentar + Nueva Orden + Ir al Inicio |
| Duplicado detectado | Verde `#10B981` | CheckCircle | "Orden Registrada" + pill "ya registrada" | Nueva Orden + Ir al Inicio |

## Técnicos de prueba (modo mock)

| Email | PIN | Nombre |
|---|---|---|
| carlos.mendez@condor.cl | 1234 | Carlos Méndez |
| laura.torres@condor.cl | 1234 | Laura Torres |
| diego.silva@condor.cl | 1234 | Diego Silva |
| camila.rojas@condor.cl | 1234 | Camila Rojas |

## Convenciones de código

- JavaScript/JSX (no TypeScript)
- ESM (`"type": "module"` en package.json)
- Tailwind CSS para estilos, NO CSS-in-JS
- Componentes funcionales con hooks
- Nombres: PascalCase para componentes, camelCase para utils
- API responses: `{ success: true, data: ... }` o `{ success: false, error: "mensaje" }`
- Mensajes de error en español

## Consideraciones UX importantes

1. **Mobile-first**: Botones grandes (min 44px touch target), inputs generosos.
2. **Chile-specific**: RUT formatting, precios en CLP, teléfonos +56.
3. **Firmas digitales**: Canvas touch ancho con borde punteado, guardada como attachment en Airtable.
4. **Checklist de trabajos**: Checkbox + counter. Visual claro.
5. **Resumen antes de enviar**: Campos vacíos en naranja "No especificado". Checkbox obligatorio de confirmación.
6. **Login simple**: Email + PIN de 4 dígitos.
7. **Progreso de envío**: Mensajes de estado durante el envío (registrando cliente, guardando orden, subiendo fotos, procesando).
8. **Sin validaciones bloqueantes**: Libre para probar, sin campos required que bloqueen.
9. **Dashboard**: Historial de órdenes con cards clickeables, refresh manual, estados de carga/vacío.
10. **Detalle de orden**: Vista completa con fotos, firma, botones de editar y reintentar.
11. **Edición de órdenes**: Carga datos existentes en el wizard, permite editar y reenviar.
12. **Anti-duplicados**: Idempotency key + ref guard + in-memory Set. El usuario nunca ve duplicados.

## Deploy

- **Frontend**: GitHub Pages con `base: '/condor-sistema/'` en vite.config.js, usando HashRouter
- **Backend**: EasyPanel con Docker, variable CORS_ORIGIN apuntando al dominio de GitHub Pages
- **Fotos/PDFs**: Se guardan en `/uploads/` del server, fotos se limpian cada 30 min (1 hora de vida)
- **Repo**: https://github.com/notstudiocl/condor-sistema
