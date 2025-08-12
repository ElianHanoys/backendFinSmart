// middleware/auth.js
import jwt from 'jsonwebtoken';
import Usuario from '../models/usuario.js';

// Middleware mejorado para verificar token JWT
export const authenticateToken = async (req, res, next) => {
  try {
    // Obtener token del header Authorization
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      const error = new Error('Token de acceso requerido');
      error.name = 'AuthError';
      error.codigo = 'TOKEN_REQUIRED';
      throw error;
    }

    // Verificar token
    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'secreto_super_seguro_cambiar_en_produccion'
    );

    // Verificar que el usuario existe y está activo
    const usuario = await Usuario.findById(decoded.id).select('-contrasena');
    
    if (!usuario || !usuario.activo) {
      const error = new Error('Usuario no válido o inactivo');
      error.name = 'AuthError';
      error.codigo = 'USER_INVALID';
      throw error;
    }

    // Agregar usuario a la request
    req.usuario = {
      id: usuario._id,
      nombre: usuario.nombre,
      email: usuario.email,
      fechaRegistro: usuario.fechaRegistro
    };

    next();

  } catch (error) {
    next(error); // Pasar al manejador de errores centralizado
  }
};

// Middleware opcional - no falla si no hay token
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      req.usuario = null;
      return next();
    }

    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'secreto_super_seguro_cambiar_en_produccion'
    );

    const usuario = await Usuario.findById(decoded.id).select('-contrasena');
    
    if (usuario && usuario.activo) {
      req.usuario = {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        fechaRegistro: usuario.fechaRegistro
      };
    } else {
      req.usuario = null;
    }

    next();

  } catch (error) {
    // En caso de error, continúa sin usuario autenticado
    req.usuario = null;
    next();
  }
};