import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Importar middlewares - CORREGIDO
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger, responseLogger } from './middleware/logging.js';
import { apiLimiter, authLimiter } from './middleware/rateLimiter.js';
import { authenticateToken } from './middleware/auth.js';

// Importar rutas
import authRoutes from './routes/auth.js';
import gastosRoutes from './routes/gastos.js';
import metasRoutes from './routes/metas.js';
import transaccionesRoutes from './routes/transacciones.js';

dotenv.config();
const app = express();

// Conexión a MongoDB con mejores prácticas
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  retryWrites: true,
  w: 'majority'
})
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => {
    console.error('❌ Error al conectar a MongoDB:', err);
    process.exit(1); // Salir si no hay conexión a la DB
  });

// Configuración de eventos de Mongoose
mongoose.connection.on('connected', () => {
  console.log('Mongoose conectado a la DB');
});

mongoose.connection.on('error', (err) => {
  console.error('Error de conexión de Mongoose:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('Mongoose desconectado de la DB');
});

// Middlewares globales
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);
app.use(responseLogger);

// Aplicar rate limiting a todas las rutas API
app.use('/api', apiLimiter);

// Rutas API
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/gastos', authenticateToken, gastosRoutes);
app.use('/api/metas', authenticateToken, metasRoutes);
app.use('/api/transacciones', authenticateToken, transaccionesRoutes);

// Ruta raíz con información del API
app.get('/', (req, res) => {
  res.json({
    message: 'Servidor FinSmart en línea!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      gastos: '/api/gastos',
      metas: '/api/metas',
      transacciones: '/api/transacciones'
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// Ruta de estado del servidor
app.get('/api/status', (req, res) => {
  res.json({
    status: 'OK',
    dbState: mongoose.connection.readyState,
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Ruta de prueba con verificación de DB
app.get('/api/test', async (req, res) => {
  try {
    // Verificar conexión a DB
    await mongoose.connection.db.admin().ping();
    
    res.json({ 
      message: 'Servidor funcionando con MongoDB conectado',
      dbStatus: 'healthy'
    });
  } catch (err) {
    res.status(503).json({
      message: 'Servidor funcionando pero MongoDB no responde',
      dbStatus: 'unhealthy',
      error: err.message
    });
  }
});

// Manejo de rutas no encontradas (404)
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    codigo: 'NOT_FOUND'
  });
});

// Manejador de errores (debe ser el último middleware)
app.use(errorHandler);

// Manejo de cierre adecuado
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('Conexión a MongoDB cerrada por terminación de la aplicación');
  process.exit(0);
});

// Levantar servidor
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  server.close(() => process.exit(1));
});

export default app;