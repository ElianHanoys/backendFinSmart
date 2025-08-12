import express from 'express';
import jwt from 'jsonwebtoken';
import Usuario from '../models/usuario.js';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';

const router = express.Router();

// Rate limiting para auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos por IP
  message: {
    error: 'Demasiados intentos de autenticación. Intenta nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validaciones para registro
const validacionRegistro = [
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres')
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/)
    .withMessage('El nombre solo puede contener letras y espacios'),
  
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Formato de email inválido'),
  
  body('contrasena')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La contraseña debe contener al menos: una minúscula, una mayúscula y un número')
];

// Validaciones para login
const validacionLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Formato de email inválido'),
  
  body('contrasena')
    .notEmpty()
    .withMessage('La contraseña es obligatoria')
];

// Función para generar JWT
const generarToken = (usuario) => {
  return jwt.sign(
    { 
      id: usuario._id, 
      nombre: usuario.nombre,
      email: usuario.email
    },
    process.env.JWT_SECRET || 'secreto_super_seguro_cambiar_en_produccion',
    { 
      expiresIn: '24h',
      issuer: 'FinSmart',
      subject: usuario._id.toString()
    }
  );
};

// 🔐 REGISTRO
router.post('/register', authLimiter, validacionRegistro, async (req, res) => {
  try {
    // Verificar errores de validación
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        detalles: errores.array()
      });
    }

    const { nombre, email, contrasena } = req.body;

    // Verificar si el usuario ya existe
    const usuarioExistente = await Usuario.findOne({ email });
    if (usuarioExistente) {
      return res.status(409).json({ 
        error: 'El correo electrónico ya está registrado' 
      });
    }

    // Crear nuevo usuario (el hash se hace automáticamente en el modelo)
    const nuevoUsuario = new Usuario({
      nombre,
      email,
      contrasena
    });

    await nuevoUsuario.save();

    // Generar token para login automático
    const token = generarToken(nuevoUsuario);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      token,
      usuario: {
        id: nuevoUsuario._id,
        nombre: nuevoUsuario.nombre,
        email: nuevoUsuario.email,
        fechaRegistro: nuevoUsuario.fechaRegistro
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    
    // Manejo específico de errores de MongoDB
    if (error.code === 11000) {
      return res.status(409).json({ 
        error: 'El correo electrónico ya está registrado' 
      });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al registrar usuario' 
    });
  }
});

// 🔑 LOGIN
router.post('/login', authLimiter, validacionLogin, async (req, res) => {
  try {
    // Verificar errores de validación
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Datos de entrada inválidos',
        detalles: errores.array()
      });
    }

    const { email, contrasena } = req.body;

    // Buscar usuario por email
    const usuario = await Usuario.findOne({ email, activo: true });
    if (!usuario) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas' 
      });
    }

    // Verificar contraseña usando el método del modelo
    const contrasenaValida = await usuario.compararContrasena(contrasena);
    if (!contrasenaValida) {
      return res.status(401).json({ 
        error: 'Credenciales inválidas' 
      });
    }

    // Generar token
    const token = generarToken(usuario);

    res.json({
      message: 'Inicio de sesión exitoso',
      token,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        fechaRegistro: usuario.fechaRegistro
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al iniciar sesión' 
    });
  }
});

// 🔍 VERIFICAR TOKEN
router.get('/verify', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'secreto_super_seguro_cambiar_en_produccion'
    );
    
    const usuario = await Usuario.findById(decoded.id).select('-contrasena');
    
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario no válido' });
    }

    res.json({
      valido: true,
      usuario: {
        id: usuario._id,
        nombre: usuario.nombre,
        email: usuario.email,
        fechaRegistro: usuario.fechaRegistro
      }
    });

  } catch (error) {
    console.error('Error verificando token:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }

    res.status(500).json({ error: 'Error verificando token' });
  }
});

// 🔄 REFRESH TOKEN
router.post('/refresh', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const decoded = jwt.verify(
      token, 
      process.env.JWT_SECRET || 'secreto_super_seguro_cambiar_en_produccion',
      { ignoreExpiration: true }
    );
    
    const usuario = await Usuario.findById(decoded.id);
    
    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: 'Usuario no válido' });
    }

    // Verificar que el token no haya expirado hace más de 7 días
    const ahora = Math.floor(Date.now() / 1000);
    const tiempoExpiracion = decoded.exp;
    const diasDesdeExpiracion = (ahora - tiempoExpiracion) / (24 * 60 * 60);
    
    if (diasDesdeExpiracion > 7) {
      return res.status(401).json({ error: 'Token demasiado antiguo' });
    }

    // Generar nuevo token
    const nuevoToken = generarToken(usuario);

    res.json({
      message: 'Token renovado exitosamente',
      token: nuevoToken
    });

  } catch (error) {
    console.error('Error renovando token:', error);
    res.status(401).json({ error: 'Error renovando token' });
  }
});

// 🚪 LOGOUT (opcional - principalmente para invalidar tokens en el cliente)
router.post('/logout', (req, res) => {
  // En un sistema con JWT stateless, el logout se maneja principalmente en el cliente
  // Aquí podrías implementar una lista negra de tokens si fuera necesario
  res.json({ 
    message: 'Sesión cerrada exitosamente',
    instruccion: 'Elimina el token del almacenamiento local del cliente'
  });
});

export default router;