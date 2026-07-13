// Estados reales del CHECK constraint de `ordenes.estado` en Postgres (001_init.sql).
export const ESTADOS = ['Pendiente', 'Enviada', 'Completada', 'Facturacion pendiente', 'Facturada'];

// Opciones reales del CHECK constraint de `ordenes.metodo_pago`/`ordenes.garantia`
// (001_init.sql) — usadas por los selects de edición de la ficha de orden.
export const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Débito', 'Crédito', 'Por pagar'];
export const GARANTIAS = ['Sin garantía', '3 meses', '6 meses', '1 año'];
