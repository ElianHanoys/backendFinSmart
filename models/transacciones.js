import mongoose from 'mongoose';

const transaccionSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: [true, 'El usuario es obligatorio']
  },
  tipo: {
    type: String,
    enum: {
      values: ['ingreso', 'gasto'],
      message: 'El tipo debe ser ingreso o gasto'
    },
    required: [true, 'El tipo de transacción es obligatorio']
  },
  descripcion: {
    type: String,
    required: [true, 'La descripción es obligatoria'],
    trim: true,
    maxlength: [200, 'La descripción no puede exceder 200 caracteres']
  },
  monto: {
    type: Number,
    required: [true, 'El monto es obligatorio'],
    min: [0.01, 'El monto debe ser mayor a 0']
  },
  fecha: {
    type: Date,
    default: Date.now,
    validate: {
      validator: function(v) {
        return v <= new Date();
      },
      message: 'La fecha no puede ser futura'
    }
  },
  categoria: {
    type: String,
    enum: ['alimentación', 'transporte', 'entretenimiento', 'servicios', 'salud', 'ropa', 'educación', 'hogar', 'otros'],
    default: 'otros'
  },
  subcategoria: {
    type: String,
    trim: true,
    maxlength: [50, 'La subcategoría no puede exceder 50 caracteres']
  },
  metodo_pago: {
    type: String,
    enum: ['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'otro'],
    default: 'efectivo'
  },
  notas: {
    type: String,
    trim: true,
    maxlength: [500, 'Las notas no pueden exceder 500 caracteres']
  },
  activa: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Índices para mejorar consultas
transaccionSchema.index({ usuario: 1, fecha: -1 });
transaccionSchema.index({ usuario: 1, categoria: 1 });
transaccionSchema.index({ usuario: 1, tipo: 1 });

export default mongoose.model('Transaccion', transaccionSchema);



