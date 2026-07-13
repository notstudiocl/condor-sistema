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
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: err.message || 'Error interno del servidor',
  });
}
