// middleware/validation.js
import { validationResult } from 'express-validator';

export const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Error de validación',
      detalles: errors.array(),
      codigo: 'VALIDATION_FAILED'
    });
  }
  next();
};