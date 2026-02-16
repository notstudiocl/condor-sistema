import Airtable from 'airtable';

const MOCK_MODE = process.env.MOCK_MODE === 'true';

// Mock data
const mockTecnicos = [
  { id: '1', nombre: 'Carlos Méndez', email: 'carlos.mendez@condor.cl', pin: '1234', telefono: '+56 9 1111 1111', especialidad: 'Hidrojet', estado: 'Activo' },
  { id: '2', nombre: 'Laura Torres', email: 'laura.torres@condor.cl', pin: '1234', telefono: '+56 9 2222 2222', especialidad: 'Varillaje', estado: 'Activo' },
  { id: '3', nombre: 'Diego Silva', email: 'diego.silva@condor.cl', pin: '1234', telefono: '+56 9 3333 3333', especialidad: 'Evacuación', estado: 'Activo' },
  { id: '4', nombre: 'Camila Rojas', email: 'camila.rojas@condor.cl', pin: '1234', telefono: '+56 9 4444 4444', especialidad: 'Mantención', estado: 'Activo' },
];

const mockClientes = [
  { rut: '12.345.678-9', nombre: 'Condominio Vista Hermosa', email: 'admin@vistahermosa.cl', telefono: '+56 2 1234 5678', direccion: 'Av. Principal 1000, Providencia', comuna: 'Providencia', empresa: true },
  { rut: '9.876.543-2', nombre: 'Restaurant El Buen Sabor', email: 'contacto@buensabor.cl', telefono: '+56 2 8765 4321', direccion: 'Calle Comercio 456, Santiago', comuna: 'Santiago', empresa: true },
];

// Airtable connection (only when not in mock mode)
let base = null;
if (!MOCK_MODE) {
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_KEY });
  base = Airtable.base(process.env.AIRTABLE_BASE_ID);
}

export async function findTecnicoByEmail(email) {
  if (MOCK_MODE) {
    return mockTecnicos.find((t) => t.email === email) || null;
  }
  const records = await base('Empleados')
    .select({ filterByFormula: `{Email} = '${email}'`, maxRecords: 1 })
    .firstPage();
  if (records.length === 0) return null;
  const r = records[0];
  return {
    id: r.get('ID') || r.id,
    nombre: r.get('Nombre'),
    email: r.get('Email'),
    pin: String(r.get('Pin Acceso') || ''),
    telefono: r.get('Telefono'),
    especialidad: r.get('Especialidad'),
    estado: r.get('Estado'),
  };
}

export async function getTecnicos() {
  if (MOCK_MODE) {
    return mockTecnicos.map(({ pin, ...rest }) => rest);
  }
  const records = await base('Empleados')
    .select({ filterByFormula: `{Estado} = 'Activo'` })
    .firstPage();
  return records.map((r) => ({
    id: r.get('ID') || r.id,
    nombre: r.get('Nombre'),
    email: r.get('Email'),
    telefono: r.get('Telefono'),
    especialidad: r.get('Especialidad'),
  }));
}

export async function buscarClientes(query) {
  if (MOCK_MODE) {
    const q = query.toLowerCase().replace(/\./g, '');
    return mockClientes.filter(
      (c) =>
        c.rut.replace(/\./g, '').toLowerCase().includes(q) ||
        c.nombre.toLowerCase().includes(q)
    );
  }
  const records = await base('Clientes')
    .select({
      filterByFormula: `OR(FIND('${query}', {RUT}), FIND('${query}', {Nombre}))`,
      maxRecords: 10,
    })
    .firstPage();
  return records.map((r) => ({
    rut: r.get('RUT'),
    nombre: r.get('Nombre'),
    email: r.get('Email'),
    telefono: r.get('Telefono'),
    direccion: r.get('Direccion'),
    comuna: r.get('Comuna'),
    empresa: !!r.get('Empresa'),
  }));
}

export async function crearOrdenEnAirtable(data) {
  if (MOCK_MODE) {
    console.log('[MOCK] Orden guardada en Airtable:', data.clienteNombre);
    return { id: 'mock_' + Date.now() };
  }
  const record = await base('Ordenes').create({
    'Fecha': data.fecha,
    'Estado': 'Completada',
    'Cliente nombre': data.clienteNombre,
    'Cliente RUT': data.clienteRut,
    'Cliente email': data.clienteEmail,
    'Cliente telefono': data.clienteTelefono,
    'Direccion': data.direccion,
    'Comuna': data.comuna,
    'Orden compra': data.ordenCompra,
    'Supervisor': data.supervisor,
    'Hora inicio': data.horaInicio,
    'Hora termino': data.horaTermino,
    'Trabajos realizados': JSON.stringify(data.trabajos),
    'Descripcion trabajo': data.descripcion,
    'Observaciones': data.observaciones,
    'Personal': JSON.stringify(data.personal),
    'Patente vehiculo': data.patenteVehiculo,
    'Total': data.total,
    'Metodo pago': data.metodoPago,
    'Garantia': data.garantia,
    'Requiere factura': data.requiereFactura,
  });
  return { id: record.id };
}
