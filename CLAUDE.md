# CLAUDE.md — Condor Alcantarillados · Sistema de Órdenes de Trabajo

## Qué es este proyecto

Sistema de digitalización de órdenes de trabajo para **Condor Alcantarillados**, empresa chilena de soluciones sanitarias, transporte de residuos e hidrojet.

Reemplaza formularios en papel que los técnicos llenan en terreno. El flujo es: técnico llega al sitio → abre la app en su celular → llena el formulario → marca trabajos realizados → captura firma del supervisor y fotos antes/después → envía → el sistema guarda en Airtable, y notifica al administrador vía webhook n8n.

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

El logo es textual: "CONDOR" grande con línea roja debajo y "Alcantarillados" debajo. No hay archivo de imagen de logo — generar un SVG inline en el componente de Login.

## Arquitectura

```
condor-sistema/
├── client/          # React + Vite (PWA mobile-first)
│   ├── src/
│   │   ├── components/   # SignaturePad, Summary, CondorLogo
│   │   ├── pages/        # LoginPage, OrdenWizardPage, ConfirmacionPage
│   │   └── utils/        # api.js, constants.js, helpers.js
│   └── ...
├── server/          # Node.js + Express (API REST)
│   └── src/
│       ├── middleware/    # auth.js, errorHandler.js
│       ├── routes/        # auth.js, ordenes.js, tecnicos.js, clientes.js
│       └── services/      # airtable.js, webhook.js
├── CLAUDE.md        # Este archivo
└── package.json     # Scripts raíz del monorepo
```

**Stack:**
- Frontend: React 18, Vite, Tailwind CSS 3, React Router, Lucide React icons
- Backend: Express, Airtable API, JWT auth simple
- DB: Airtable (no SQL)
- Automatización: n8n vía webhooks
- Deploy: GitHub Pages (frontend) + Railway o Render (backend)

## Campos de la Orden de Trabajo (según formulario PDF real)

### Encabezado
- Número de orden (auto-generado o correlativo)
- Fecha de la orden (auto: hoy)

### Datos del cliente
- Correo electrónico
- Teléfono
- Dirección (required)
- Cliente / Nombre (required)
- RUT (formato chileno: 12.345.678-9, con búsqueda autocompletado desde Airtable)
- Comuna
- Orden de Compra (opcional, para clientes empresa)
- Supervisor / Encargado (required — persona que recibe el trabajo en terreno)

### Horarios
- Hora Inicio (input type="time")
- Hora Término (input type="time")

### Trabajos Realizados (checklist con cantidad)

Esto es una tabla con checkbox + cantidad numérica para cada tipo de trabajo:

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

UI: cada fila tiene un checkbox. Al activar aparece un counter +/- para cantidad. Si cantidad > 0 la fila se resalta en azul claro.

### Descripción del Trabajo (textarea, required)
Texto libre donde el técnico detalla lo que hizo.

### Observaciones (textarea, opcional)

### Personal y vehículo
- Personal que ejecuta el trabajo: lista dinámica de nombres (mínimo 1, el técnico logueado va primero)
- Patente vehículo (ej: "ABCD-12")

### Pago
- Total a pagar (CLP, formateado con separador de miles)
- Método de Pago: Efectivo / Transferencia / Débito / Crédito / Por pagar
- Garantía: Sin garantía / 3 meses / 6 meses / 1 año
- Requiere Factura: Sí / No

### Firma y cierre
- Nombre supervisor o encargado (prellenado del paso 1)
- Fecha (auto: hoy)
- Firma digital del supervisor (canvas touch)

### Evidencia fotográfica (Fase 2)
- Fotos ANTES (upload múltiple)
- Fotos DESPUÉS (upload múltiple)

## Flujo del Wizard (4 pasos)

1. **Cliente**: RUT (con búsqueda), nombre, email, teléfono, dirección, comuna, OC, supervisor, horarios
2. **Trabajos**: Checklist de trabajos con cantidad, descripción del trabajo, observaciones, pago
3. **Personal**: Lista de técnicos que ejecutaron, patente vehículo
4. **Firma**: Firma digital del supervisor, resumen completo de la OT con opción de editar cada sección, checkbox de confirmación, botón Enviar

## API Endpoints

```
POST   /api/auth/login          # Login con email + PIN
GET    /api/tecnicos             # Listar técnicos activos
GET    /api/clientes/buscar?q=   # Buscar clientes por RUT (autocompletado)
POST   /api/ordenes              # Crear orden → envía a webhook n8n
GET    /api/health               # Health check
```

## Variables de entorno

### Server (.env)
```
PORT=3001
AIRTABLE_API_KEY=pat_xxxxx
AIRTABLE_BASE_ID=appXXXXXX
WEBHOOK_OT_N8N_URL=https://tu-n8n.com/webhook/ordenes-condor
JWT_SECRET=condor_secret_seguro
CORS_ORIGIN=https://tu-usuario.github.io
MOCK_MODE=true
```

### Client (.env)
```
VITE_API_URL=http://localhost:3001/api
VITE_DEV_MODE=true
```

## Airtable — Estructura de tablas

### Tabla "Ordenes"
Campos: Numero orden, Fecha, Estado (Pendiente/Completada/Facturada), Cliente nombre, Cliente RUT, Cliente email, Cliente telefono, Direccion, Comuna, Orden compra, Supervisor, Hora inicio, Hora termino, Trabajos realizados (JSON string), Descripcion trabajo, Observaciones, Personal (JSON string), Patente vehiculo, Total, Metodo pago, Garantia, Requiere factura, Firma supervisor (attachment), Fotos antes (attachment), Fotos despues (attachment)

### Tabla "Tecnicos"
Campos: ID, Nombre, Email, Pin Acceso, Telefono, Especialidad, Estado (Activo/Inactivo)

### Tabla "Clientes"
Campos: RUT, Nombre, Email, Telefono, Direccion, Comuna, Empresa

## Webhook payload (n8n)

Al crear una orden se envía POST al webhook:
```json
{
  "Fecha": "2026-02-16",
  "Estado": "Completada",
  "Cliente": "Juan Pérez",
  "Cliente RUT": "12.345.678-9",
  "Cliente Email": "juan@mail.com",
  "Cliente Telefono": "+56 9 1234 5678",
  "Cliente Direccion": "Av. Los Leones 1234",
  "Cliente Comuna": "Providencia",
  "Orden de Compra": "OC-001",
  "Supervisor": "María González",
  "Hora Inicio": "08:30",
  "Hora Termino": "12:00",
  "Trabajos Realizados": [
    { "trabajo": "Hora Camión Hidrojet", "cantidad": 2 },
    { "trabajo": "Evacuación de fosas", "cantidad": 1 }
  ],
  "Descripcion Trabajo": "Se realizó hidrojet en cámaras...",
  "Observaciones": "Cliente solicita visita de seguimiento",
  "Personal": ["Carlos Méndez", "Diego Silva"],
  "Patente Vehiculo": "ABCD-12",
  "Total": 350000,
  "Metodo Pago": "Transferencia",
  "Garantia": "3 meses",
  "Requiere Factura": "Sí",
  "Firma Supervisor": "data:image/png;base64,...",
  "Fecha Envio": "2026-02-16T15:30:00.000Z"
}
```

## Técnicos de prueba (modo mock)

| Email | PIN | Nombre |
|---|---|---|
| carlos.mendez@condor.cl | 1234 | Carlos Méndez |
| laura.torres@condor.cl | 1234 | Laura Torres |
| diego.silva@condor.cl | 1234 | Diego Silva |
| camila.rojas@condor.cl | 1234 | Camila Rojas |

## Clientes de prueba (modo mock)

| RUT | Nombre | Dirección |
|---|---|---|
| 12.345.678-9 | Condominio Vista Hermosa | Av. Principal 1000, Providencia |
| 9.876.543-2 | Restaurant El Buen Sabor | Calle Comercio 456, Santiago |

## Convenciones de código

- JavaScript/JSX (no TypeScript)
- ESM (`"type": "module"` en package.json)
- Tailwind CSS para estilos, NO CSS-in-JS
- Componentes funcionales con hooks
- Nombres: PascalCase para componentes, camelCase para utils
- API responses: `{ success: true, data: ... }` o `{ success: false, error: "mensaje" }`
- Validación en frontend Y backend
- Mensajes de error en español

## Consideraciones UX importantes

1. **Mobile-first**: Los técnicos usan esto en terreno, con guantes. Botones grandes (min 44px touch target), inputs generosos.
2. **Chile-specific**: RUT formatting con puntos y guión, comunas, precios en CLP con separador de miles, teléfonos +56.
3. **Firmas digitales**: Canvas touch que funcione bien en celulares. El pad de firma debe ser ancho y con borde punteado.
4. **Checklist de trabajos**: Es el core de la OT. Cada trabajo tiene checkbox + counter. Visual claro de qué se hizo y cuánto.
5. **Resumen antes de enviar**: En el paso final, mostrar TODO lo que se va a enviar con opción de volver a editar cada sección.
6. **Login simple**: Email + PIN de 4 dígitos. Sin sistema de usuarios complejo.
7. **Header con logo**: Barra superior azul oscuro con mini logo "CA" (Condor Alcantarillados) + nombre del técnico logueado.
8. **Confirmación**: Pantalla de éxito con gradiente azul y resumen de lo enviado. Botón rojo "Nueva Orden".

## Dependencias frontend

```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.28.0",
  "lucide-react": "^0.460.0"
}
```

DevDeps: vite, @vitejs/plugin-react, tailwindcss, postcss, autoprefixer

## Dependencias backend

```json
{
  "express": "^4.21.1",
  "cors": "^2.8.5",
  "dotenv": "^16.4.5",
  "jsonwebtoken": "^9.0.2",
  "airtable": "^0.12.2",
  "multer": "^1.4.5-lts.1"
}
```

## Tailwind custom theme

Extender el tema con:
- `condor` color palette (blues: 50-950 basado en #1E3A8A)
- `accent` color palette (reds: 50-900 basado en #DC2626)
- Font families: heading (DM Sans), body (IBM Plex Sans), mono (JetBrains Mono)
- Google Fonts importados en index.html

## Deploy

- **Frontend**: GitHub Pages con `base: '/condor-sistema/'` en vite.config.js, usando HashRouter
- **Backend**: Railway o Render, variable CORS_ORIGIN apuntando al dominio de GitHub Pages
- **Base path**: Todas las rutas de assets usan `/condor-sistema/` como base
