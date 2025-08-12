// middleware/roleCheck.js
export const checkRole = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({
        error: 'Autenticación requerida',
        codigo: 'AUTH_REQUIRED'
      });
    }

    // Todavia no hay roles pero se dejan definidos para posibles futuras implementaciones
    if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: 'No tienes permisos para esta acción',
        codigo: 'FORBIDDEN'
      });
    }

    next();
  };
};