// middleware/errorHandler.js
export const errorHandler = (err, req, res, next) => {
  console.error('Error capturado:', err);

  // Error de validación de Mongoose
  if (err.name === 'ValidationError') {
    const errores = Object.values(err.errors).map(error => ({
      campo: error.path,
      mensaje: error.message
    }));
    
    return res.status(400).json({
      error: 'Datos de entrada inválidos',
      detalles: errores,
      codigo: 'VALIDATION_ERROR'
    });
  }

  // Error de duplicado en MongoDB
  if (err.code === 11000) {
    const campo = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      error: `El valor para ${campo} ya existe`,
      codigo: 'DUPLICATE_KEY'
    });
  }

  // Error de casteo de ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'ID inválido',
      codigo: 'INVALID_ID'
    });
  }

  // Error de autenticación personalizado
  if (err.name === 'AuthError') {
    return res.status(401).json({
      error: err.message,
      codigo: err.codigo || 'AUTH_ERROR'
    });
  }

  // Error de límite de tasa
  if (err.name === 'RateLimitError') {
    return res.status(429).json({
      error: 'Demasiadas solicitudes',
      detalles: err.message,
      codigo: 'RATE_LIMIT_EXCEEDED'
    });
  }

  // Error de API externa
  if (err.name === 'ExternalAPIError') {
    return res.status(502).json({
      error: 'Error en servicio externo',
      detalles: err.message,
      codigo: 'EXTERNAL_API_FAILURE'
    });
  }

  // Error de ruta no encontrada
  if (err.name === 'NotFoundError') {
    return res.status(404).json({
      error: err.message,
      codigo: 'RESOURCE_NOT_FOUND'
    });
  }

  // Error de permisos
  if (err.name === 'ForbiddenError') {
    return res.status(403).json({
      error: 'No tienes permisos para esta acción',
      codigo: 'FORBIDDEN'
    });
  }

  // Error general del servidor
  res.status(500).json({
    error: 'Error interno del servidor',
    codigo: 'INTERNAL_SERVER_ERROR',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};