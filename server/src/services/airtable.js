import Airtable from 'airtable';

const MOCK_MODE = process.env.MOCK_MODE === 'true';

// Mock data
const mockTecnicos = [
  { id: '1', recordId: 'mock_rec_1', nombre: 'Carlos Méndez', usuario: 'carlos.mendez@condor.cl', pin: '1234', telefono: '+56 9 1111 1111', activo: true },
  { id: '2', recordId: 'mock_rec_2', nombre: 'Laura Torres', usuario: 'laura.torres@condor.cl', pin: '1234', telefono: '+56 9 2222 2222', activo: true },
  { id: '3', recordId: 'mock_rec_3', nombre: 'Diego Silva', usuario: 'diego.silva@condor.cl', pin: '1234', telefono: '+56 9 3333 3333', activo: true },
  { id: '4', recordId: 'mock_rec_4', nombre: 'Camila Rojas', usuario: 'camila.rojas@condor.cl', pin: '1234', telefono: '+56 9 4444 4444', activo: true },
];

const mockClientes = [
  { rut: '12.345.678-9', nombre: 'Condominio Vista Hermosa', email: 'admin@vistahermosa.cl', telefono: '+56 2 1234 5678', direccion: 'Av. Principal 1000, Providencia', comuna: 'Providencia', tipo: 'Empresa', empresa: 'Condominio Vista Hermosa' },
  { rut: '9.876.543-2', nombre: 'Restaurant El Buen Sabor', email: 'contacto@buensabor.cl', telefono: '+56 2 8765 4321', direccion: 'Calle Comercio 456, Santiago', comuna: 'Santiago', tipo: 'Empresa', empresa: 'Restaurant El Buen Sabor' },
];

// Airtable connection (only when not in mock mode)
let base = null;
if (!MOCK_MODE) {
  Airtable.configure({ apiKey: process.env.AIRTABLE_API_KEY });
  base = Airtable.base(process.env.AIRTABLE_BASE_ID);
}

// --- Empleados ---

// Normalizar RUT: quitar puntos y guión, lowercase
function normalizeRut(rut) {
  return rut.replace(/\./g, '').replace(/-/g, '').toLowerCase().trim();
}

export async function findTecnicoByCredencial(input) {
  const normalizedInput = input.trim().toLowerCase();
  const normalizedRut = normalizeRut(input);

  if (MOCK_MODE) {
    return mockTecnicos.find((t) =>
      t.usuario.toLowerCase() === normalizedInput ||
      (t.rut && normalizeRut(t.rut) === normalizedRut)
    ) || null;
  }

  // Sanitize input against Airtable formula injection
  const sanitizedInput = normalizedInput.replace(/'/g, "\\'");
  const sanitizedRut = normalizedRut.replace(/'/g, "\\'");

  const records = await base('Empleados')
    .select({
      filterByFormula: `OR(
        LOWER({Usuario}) = '${sanitizedInput}',
        SUBSTITUTE(SUBSTITUTE(LOWER({RUT}), ".", ""), "-", "") = '${sanitizedRut}'
      )`,
      maxRecords: 1,
    })
    .firstPage();
  if (records.length === 0) return null;
  const r = records[0];
  return {
    id: r.get('ID') || r.id,
    recordId: r.id,
    nombre: r.get('Nombre'),
    usuario: r.get('Usuario'),
    rut: r.get('RUT') || '',
    pin: String(r.get('Pin Acceso') || ''),
    telefono: r.get('Telefono'),
    activo: r.get('Activo') === true,
  };
}

export async function getTecnicos() {
  if (MOCK_MODE) {
    return mockTecnicos.map(({ pin, ...rest }) => rest);
  }
  const records = await base('Empleados')
    .select({ filterByFormula: `{Activo} = TRUE()` })
    .firstPage();
  return records.map((r) => ({
    id: r.get('ID') || r.id,
    nombre: r.get('Nombre'),
    usuario: r.get('Usuario'),
    telefono: r.get('Telefono'),
  }));
}

// --- Clientes ---

export async function buscarClientes(query) {
  const cleanQuery = query.replace(/[.\-]/g, '').toLowerCase();
  if (!cleanQuery) return [];

  if (MOCK_MODE) {
    return mockClientes.filter((c) =>
      c.rut.replace(/[.\-]/g, '').toLowerCase().includes(cleanQuery)
    );
  }

  // Fetch all clients and filter locally (few records, avoids Airtable format issues)
  const records = await base('Clientes').select({ fields: ['RUT', 'Nombre', 'Email', 'Telefono', 'Direccion', 'Comuna', 'Tipo', 'Empresa'] }).firstPage();
  return records
    .filter((r) => {
      const rut = (r.get('RUT') || '').replace(/[.\-]/g, '').toLowerCase();
      return rut.includes(cleanQuery);
    })
    .slice(0, 10)
    .map((r) => ({
      rut: r.get('RUT'),
      nombre: r.get('Nombre'),
      email: r.get('Email'),
      telefono: r.get('Telefono'),
      direccion: r.get('Direccion'),
      comuna: r.get('Comuna'),
      tipo: r.get('Tipo'),
      empresa: r.get('Empresa'),
    }));
}

