import mongoose from 'mongoose';

const metaSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: [true, 'El usuario es obligatorio']
  },
  titulo: { 
    type: String, 
    required: [true, 'El título es obligatorio'],
    trim: true,
    maxlength: [100, 'El título no puede exceder 100 caracteres']
  },
  descripcion: {
    type: String,
    trim: true,
    maxlength: [500, 'La descripción no puede exceder 500 caracteres']
  },
  montoObjetivo: { 
    type: Number, 
    required: [true, 'El monto objetivo es obligatorio'],
    min: [1, 'El monto objetivo debe ser mayor a 0']
  },
  montoActual: { 
    type: Number, 
    default: 0,
    min: [0, 'El monto actual no puede ser negativo']
  },
  fechaInicio: {
    type: Date,
    default: Date.now
  },
  fechaLimite: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v > this.fechaInicio;
      },
      message: 'La fecha límite debe ser posterior a la fecha de inicio'
    }
  },
  categoria: {
    type: String,
    enum: ['ahorro', 'vacaciones', 'emergencia', 'compra', 'inversion', 'educacion', 'otro'],
    default: 'ahorro'
  },
  prioridad: {
    type: String,
    enum: ['baja', 'media', 'alta'],
    default: 'media'
  },
  estado: {
    type: String,
    enum: ['activa', 'completada', 'pausada', 'cancelada'],
    default: 'activa'
  },
  recordatorios: {
    frecuencia: {
      type: String,
      enum: ['diario', 'semanal', 'mensual', 'nunca'],
      default: 'semanal'
    },
    proximoRecordatorio: Date
  }
}, { 
  timestamps: true 
});

// Virtual para calcular el progreso
metaSchema.virtual('progreso').get(function() {
  return Math.min((this.montoActual / this.montoObjetivo) * 100, 100);
});

// Virtual para días restantes
metaSchema.virtual('diasRestantes').get(function() {
  if (!this.fechaLimite) return null;
  const hoy = new Date();
  const diferencia = this.fechaLimite - hoy;
  return Math.ceil(diferencia / (1000 * 60 * 60 * 24));
});

// Incluir virtuals en JSON
metaSchema.set('toJSON', { virtuals: true });

// Índices
metaSchema.index({ usuario: 1, estado: 1 });
metaSchema.index({ usuario: 1, fechaLimite: 1 });

export default mongoose.model('Meta', metaSchema);



