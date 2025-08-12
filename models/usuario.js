import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const usuarioSchema = new mongoose.Schema({
  nombre: { 
    type: String, 
    required: [true, 'El nombre es obligatorio'],
    trim: true,
    minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
    maxlength: [50, 'El nombre no puede exceder 50 caracteres']
  },
  email: { 
    type: String, 
    required: [true, 'El email es obligatorio'], 
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Formato de email inválido']
  },
  contrasena: { 
    type: String, 
    required: [true, 'La contraseña es obligatoria'],
    minlength: [6, 'La contraseña debe tener al menos 6 caracteres']
  },
  fechaRegistro: {
    type: Date,
    default: Date.now
  },
  activo: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Middleware para hash de contraseña antes de guardar
usuarioSchema.pre('save', async function(next) {
  if (!this.isModified('contrasena')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.contrasena = await bcrypt.hash(this.contrasena, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar contraseñas
usuarioSchema.methods.compararContrasena = async function(contrasenaIngresada) {
  return await bcrypt.compare(contrasenaIngresada, this.contrasena);
};

// Método para obtener datos públicos del usuario
usuarioSchema.methods.toJSON = function() {
  const usuario = this.toObject();
  delete usuario.contrasena;
  return usuario;
};

export default mongoose.model('Usuario', usuarioSchema);

