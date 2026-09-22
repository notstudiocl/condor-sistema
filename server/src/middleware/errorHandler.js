// Traduce errores de Postgres a respuestas legibles en vez de exponer el mensaje SQL crudo
// (bug real de QA: "invalid input syntax for type bigint" llegaba tal cual a la UI).
const PG_ERRORES = {
  '22P02': [400, 'Identificador o valor con formato inválido'],       // invalid_text_representation (bigint 'NaN')
  '22007': [400, 'Fecha con formato inválido'],                        // invalid_datetime_format
  '22008': [400, 'Fecha fuera de rango'],
  '23505': [409, 'Ya existe un registro con ese valor'],              // unique_violation
  '23514': [400, 'Valor no permitido para este campo'],               // check_violation (estado inválido)
  '23503': [409, 'El registro está en uso por otros datos'],          // foreign_key_violation
  '23502': [400, 'Falta un dato obligatorio'],                        // not_null_violation
};

export function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err.message);
  if (!err.status || err.status >= 500) {
    console.error(err.stack);
  }
  // Si el timeout global de 30s (index.js) ya respondió (ej. 504) antes de que este
  // handler llegara acá vía next(err), escribir una segunda respuesta tira
  // ERR_HTTP_HEADERS_SENT sin capturar y tumba el proceso Node entero. Delegar al
  // manejador de error por defecto de Express (recomendado por su propia doc para
  // este caso) en vez de intentar responder de nuevo.
  if (res.headersSent) return next(err);

  const pg = err.code && PG_ERRORES[err.code];
  if (pg && !err.status) {
    const [status, mensaje] = pg;
    return res.status(status).json({ success: false, error: mensaje });
  }
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: status >= 500 ? 'Error interno del servidor. Intenta nuevamente.' : err.message || 'Error',
  });
}
