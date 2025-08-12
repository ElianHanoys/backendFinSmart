import express from 'express';
import { body, query, validationResult } from 'express-validator';
import Meta from '../models/meta.js';
import Transaccion from '../models/transacciones.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(authenticateToken);

// Validaciones para crear/actualizar meta
const validacionMeta = [
  body('titulo')
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('El título debe tener entre 3 y 100 caracteres'),
  
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La descripción no puede exceder 500 caracteres'),
  
  body('montoObjetivo')
    .isFloat({ min: 1 })
    .withMessage('El monto objetivo debe ser mayor a 0'),
  
  body('fechaLimite')
    .optional()
    .isISO8601()
    .custom((value, { req }) => {
      if (value && new Date(value) <= new Date()) {
        throw new Error('La fecha límite debe ser futura');
      }
      return true;
    }),
  
  body('categoria')
    .optional()
    .isIn(['ahorro', 'vacaciones', 'emergencia', 'compra', 'inversion', 'educacion', 'otro'])
    .withMessage('Categoría inválida'),
  
  body('prioridad')
    .optional()
    .isIn(['baja', 'media', 'alta'])
    .withMessage('Prioridad inválida')
];

// 🎯 Crear nueva meta
router.post('/', validacionMeta, async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles: errores.array()
      });
    }

    // Verificar límite de metas activas (máximo 10)
    const metasActivas = await Meta.countDocuments({
      usuario: req.usuario.id,
      estado: 'activa'
    });

    if (metasActivas >= 10) {
      return res.status(400).json({
        error: 'Has alcanzado el límite máximo de 10 metas activas'
      });
    }

    const nuevaMeta = new Meta({
      ...req.body,
      usuario: req.usuario.id
    });

    // Configurar recordatorio automático si se especifica fecha límite
    if (nuevaMeta.fechaLimite && nuevaMeta.recordatorios.frecuencia !== 'nunca') {
      nuevaMeta.recordatorios.proximoRecordatorio = calcularProximoRecordatorio(
        new Date(),
        nuevaMeta.recordatorios.frecuencia
      );
    }

    const metaGuardada = await nuevaMeta.save();
    await metaGuardada.populate('usuario', 'nombre email');

    res.status(201).json({
      message: 'Meta creada exitosamente',
      meta: metaGuardada
    });

  } catch (error) {
    console.error('Error creando meta:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Datos de meta inválidos',
        detalles: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al crear meta' 
    });
  }
});

// 🎯 Obtener todas las metas con filtros
router.get('/', [
  query('estado').optional().isIn(['activa', 'completada', 'pausada', 'cancelada']).withMessage('Estado inválido'),
  query('categoria').optional().isString().withMessage('Categoría debe ser texto'),
  query('pagina').optional().isInt({ min: 1 }).withMessage('Página debe ser un número mayor a 0'),
  query('limite').optional().isInt({ min: 1, max: 50 }).withMessage('Límite debe ser entre 1 y 50')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Parámetros de consulta inválidos',
        detalles: errores.array()
      });
    }

    const {
      estado,
      categoria,
      pagina = 1,
      limite = 10
    } = req.query;

    // Construir filtros
    const filtros = { usuario: req.usuario.id };
    if (estado) filtros.estado = estado;
    if (categoria) filtros.categoria = categoria;

    // Configurar paginación
    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    // Ejecutar consulta
    const [metas, total] = await Promise.all([
      Meta.find(filtros)
        .sort({ 
          estado: 1, // activas primero
          prioridad: -1, // alta prioridad primero
          fechaLimite: 1, // más próximas primero
          createdAt: -1 
        })
        .skip(skip)
        .limit(parseInt(limite))
        .populate('usuario', 'nombre'),
      Meta.countDocuments(filtros)
    ]);

    // Calcular estadísticas generales
    const estadisticas = await Meta.aggregate([
      { $match: { usuario: req.usuario.id } },
      {
        $group: {
          _id: '$estado',
          cantidad: { $sum: 1 },
          montoTotal: { $sum: '$montoObjetivo' },
          montoActualTotal: { $sum: '$montoActual' }
        }
      }
    ]);

    res.json({
      metas,
      paginacion: {
        paginaActual: parseInt(pagina),
        totalPaginas: Math.ceil(total / parseInt(limite)),
        totalElementos: total,
        elementosPorPagina: parseInt(limite)
      },
      estadisticas: estadisticas.reduce((acc, stat) => {
        acc[stat._id] = {
          cantidad: stat.cantidad,
          montoTotal: stat.montoTotal,
          montoActual: stat.montoActualTotal
        };
        return acc;
      }, {})
    });

  } catch (error) {
    console.error('Error obteniendo metas:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al obtener metas' 
    });
  }
});

// 🎯 Obtener meta por ID
router.get('/:id', async (req, res) => {
  try {
    const meta = await Meta.findOne({
      _id: req.params.id,
      usuario: req.usuario.id
    }).populate('usuario', 'nombre email');

    if (!meta) {
      return res.status(404).json({ 
        error: 'Meta no encontrada' 
      });
    }

    // Obtener transacciones relacionadas (opcional)
    const transaccionesRelacionadas = await Transaccion.find({
      usuario: req.usuario.id,
      tipo: 'ingreso',
      fecha: { $gte: meta.fechaInicio },
      activa: true
    }).limit(5).sort({ fecha: -1 });

    res.json({
      meta,
      transaccionesRecientes: transaccionesRelacionadas
    });

  } catch (error) {
    console.error('Error obteniendo meta:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'ID de meta inválido' });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al obtener meta' 
    });
  }
});

// 🎯 Actualizar una meta
router.put('/:id', validacionMeta, async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles: errores.array()
      });
    }

    const metaActualizada = await Meta.findOneAndUpdate(
      { 
        _id: req.params.id, 
        usuario: req.usuario.id
      },
      req.body,
      { 
        new: true, 
        runValidators: true 
      }
    ).populate('usuario', 'nombre email');

    if (!metaActualizada) {
      return res.status(404).json({ 
        error: 'Meta no encontrada' 
      });
    }

    // Verificar si la meta se completó
    if (metaActualizada.montoActual >= metaActualizada.montoObjetivo && 
        metaActualizada.estado === 'activa') {
      metaActualizada.estado = 'completada';
      await metaActualizada.save();
    }

    res.json({
      message: 'Meta actualizada exitosamente',
      meta: metaActualizada
    });

  } catch (error) {
    console.error('Error actualizando meta:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'ID de meta inválido' });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Datos de meta inválidos',
        detalles: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al actualizar meta' 
    });
  }
});

// 🎯 Agregar dinero a una meta
router.post('/:id/agregar', [
  body('monto')
    .isFloat({ min: 0.01 })
    .withMessage('El monto debe ser mayor a 0'),
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La descripción no puede exceder 200 caracteres')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles: errores.array()
      });
    }

    const { monto, descripcion = 'Aporte a meta' } = req.body;

    const meta = await Meta.findOne({
      _id: req.params.id,
      usuario: req.usuario.id,
      estado: 'activa'
    });

    if (!meta) {
      return res.status(404).json({ 
        error: 'Meta activa no encontrada' 
      });
    }

    // Verificar que no exceda el objetivo
    if (meta.montoActual + monto > meta.montoObjetivo) {
      return res.status(400).json({
        error: 'El monto excede el objetivo de la meta',
        montoMaximo: meta.montoObjetivo - meta.montoActual
      });
    }

    // Actualizar meta
    meta.montoActual += monto;
    
    // Verificar si se completó
    if (meta.montoActual >= meta.montoObjetivo) {
      meta.estado = 'completada';
    }

    await meta.save();

    // Crear transacción de registro
    const nuevaTransaccion = new Transaccion({
      usuario: req.usuario.id,
      tipo: 'gasto', // Se considera gasto porque sale del dinero disponible
      descripcion: `${descripcion} - ${meta.titulo}`,
      monto: monto,
      categoria: 'otros',
      subcategoria: 'ahorro_meta'
    });

    await nuevaTransaccion.save();

    res.json({
      message: meta.estado === 'completada' ? 
        '¡Felicitaciones! Has completado tu meta' : 
        'Dinero agregado exitosamente a la meta',
      meta,
      transaccion: nuevaTransaccion
    });

  } catch (error) {
    console.error('Error agregando dinero a meta:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al agregar dinero' 
    });
  }
});

// 🎯 Cambiar estado de una meta
router.patch('/:id/estado', [
  body('estado')
    .isIn(['activa', 'completada', 'pausada', 'cancelada'])
    .withMessage('Estado inválido')
], async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Estado inválido',
        detalles: errores.array()
      });
    }

    const meta = await Meta.findOneAndUpdate(
      { 
        _id: req.params.id, 
        usuario: req.usuario.id
      },
      { estado: req.body.estado },
      { new: true }
    );

    if (!meta) {
      return res.status(404).json({ 
        error: 'Meta no encontrada' 
      });
    }

    res.json({
      message: `Meta ${req.body.estado} exitosamente`,
      meta
    });

  } catch (error) {
    console.error('Error cambiando estado de meta:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al cambiar estado' 
    });
  }
});

// 🎯 Eliminar una meta
router.delete('/:id', async (req, res) => {
  try {
    const metaEliminada = await Meta.findOneAndDelete({
      _id: req.params.id,
      usuario: req.usuario.id
    });

    if (!metaEliminada) {
      return res.status(404).json({ 
        error: 'Meta no encontrada' 
      });
    }

    res.json({ 
      message: 'Meta eliminada exitosamente',
      meta: metaEliminada
    });

  } catch (error) {
    console.error('Error eliminando meta:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'ID de meta inválido' });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al eliminar meta' 
    });
  }
});

// 🎯 Obtener dashboard de metas
router.get('/dashboard/resumen', async (req, res) => {
  try {
    const metas = await Meta.find({ usuario: req.usuario.id });
    
    const resumen = {
      total: metas.length,
      activas: metas.filter(m => m.estado === 'activa').length,
      completadas: metas.filter(m => m.estado === 'completada').length,
      pausadas: metas.filter(m => m.estado === 'pausada').length,
      canceladas: metas.filter(m => m.estado === 'cancelada').length,
      montoTotalObjetivos: metas.reduce((acc, m) => acc + m.montoObjetivo, 0),
      montoTotalAhorrado: metas.reduce((acc, m) => acc + m.montoActual, 0),
      progresoGeneral: 0
    };

    if (resumen.montoTotalObjetivos > 0) {
      resumen.progresoGeneral = (resumen.montoTotalAhorrado / resumen.montoTotalObjetivos) * 100;
    }

    // Metas próximas a vencer (próximos 30 días)
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + 30);

    const metasProximasVencer = await Meta.find({
      usuario: req.usuario.id,
      estado: 'activa',
      fechaLimite: { $lte: fechaLimite }
    }).sort({ fechaLimite: 1 });

    res.json({
      resumen,
      metasProximasVencer
    });

  } catch (error) {
    console.error('Error obteniendo dashboard de metas:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al obtener dashboard' 
    });
  }
});

// Función auxiliar para calcular próximo recordatorio
function calcularProximoRecordatorio(fechaBase, frecuencia) {
  const fecha = new Date(fechaBase);
  
  switch (frecuencia) {
    case 'diario':
      fecha.setDate(fecha.getDate() + 1);
      break;
    case 'semanal':
      fecha.setDate(fecha.getDate() + 7);
      break;
    case 'mensual':
      fecha.setMonth(fecha.getMonth() + 1);
      break;
    default:
      return null;
  }
  
  return fecha;
}

export default router;
