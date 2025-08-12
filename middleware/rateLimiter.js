// middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 solicitudes por IP
  message: {
    error: 'Demasiadas solicitudes desde esta IP',
    codigo: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // límite de 5 intentos de autenticación
  message: {
    error: 'Demasiados intentos de autenticación. Intenta nuevamente en 15 minutos.',
    codigo: 'AUTH_RATE_LIMIT'
  },
  standardHeaders: true,
  legacyHeaders: false
});