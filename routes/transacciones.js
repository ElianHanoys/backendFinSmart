import express from 'express';
import { body, query, validationResult } from 'express-validator';
import Transaccion from '../models/transacciones.js';
import Meta from '../models/meta.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Aplicar autenticación a todas las rutas
router.use(authenticateToken);

// Función mejorada para clasificar automáticamente
function clasificarCategoria(descripcion) {
  const texto = descripcion.toLowerCase().trim();
  
  const categorias = {
    'alimentación': [
      'comida', 'restaurante', 'supermercado', 'mercado', 'pizza', 'hamburguesa',
      'café', 'desayuno', 'almuerzo', 'cena', 'bebida', 'coca cola', 'agua',
      'pan', 'panadería', 'carnicería', 'verdulería', 'sushi', 'delivery'
    ],
    'transporte': [
      'transporte', 'uber', 'taxi', 'bus', 'metro', 'gasolina', 'combustible',
      'peaje', 'parking', 'estacionamiento', 'motocicleta', 'bicicleta',
      'avión', 'vuelo', 'tren', 'barco'
    ],
    'entretenimiento': [
      'cine', 'ocio', 'película', 'teatro', 'concierto', 'bar', 'discoteca',
      'videojuego', 'netflix', 'spotify', 'streaming', 'parque', 'diversión',
      'gimnasio', 'deporte', 'futbol', 'basquet'
    ],
    'servicios': [
      'luz', 'agua', 'internet', 'teléfono', 'gas', 'electricidad',
      'cable', 'seguro', 'banco', 'notaría', 'abogado', 'contador',
      'limpieza', 'jardinería', 'reparación'
    ],
    'salud': [
      'salud', 'medicina', 'doctor', 'médico', 'hospital', 'clínica',
      'farmacia', 'pastillas', 'vitaminas', 'dentista', 'oftalmólogo',
      'laboratorio', 'rayos x', 'consulta'
    ],
    'ropa': [
      'ropa', 'zapato', 'camisa', 'pantalón', 'vestido', 'tienda',
      'boutique', 'zapatería', 'moda', 'accesorios', 'bolso', 'cartera'
    ],
    'educación': [
      'educación', 'colegio', 'universidad', 'curso', 'libro', 'cuaderno',
      'lápiz', 'material', 'matrícula', 'pensión', 'tutoría'
    ],
    'hogar': [
      'hogar', 'casa', 'mueble', 'electrodoméstico', 'decoración',
      'herramienta', 'pintura', 'construcción', 'alquiler', 'hipoteca'
    ]
  };

  for (const [categoria, palabras] of Object.entries(categorias)) {
    if (palabras.some(palabra => texto.includes(palabra))) {
      return categoria;
    }
  }
  
  return 'otros';
}

// Validaciones para crear transacción
const validacionTransaccion = [
  body('tipo')
    .isIn(['ingreso', 'gasto'])
    .withMessage('El tipo debe ser ingreso o gasto'),
  
  body('descripcion')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('La descripción debe tener entre 3 y 200 caracteres'),
  
  body('monto')
    .isFloat({ min: 0.01 })
    .withMessage('El monto debe ser mayor a 0'),
  
  body('fecha')
    .optional()
    .isISO8601()
    .withMessage('Formato de fecha inválido'),
  
  body('categoria')
    .optional()
    .isIn(['alimentación', 'transporte', 'entretenimiento', 'servicios', 'salud', 'ropa', 'educación', 'hogar', 'otros'])
    .withMessage('Categoría inválida'),
  
  body('metodo_pago')
    .optional()
    .isIn(['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'otro'])
    .withMessage('Método de pago inválido')
];

// 🔹 Crear nueva transacción
router.post('/', validacionTransaccion, async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles: errores.array()
      });
    }

    const { descripcion, categoria, ...otrosDatos } = req.body;
    
    // Clasificar automáticamente si no se proporciona categoría
    const categoriaFinal = categoria || clasificarCategoria(descripcion);
    
    const nuevaTransaccion = new Transaccion({
      ...otrosDatos,
      descripcion,
      categoria: categoriaFinal,
      usuario: req.usuario.id
    });

    const transaccionGuardada = await nuevaTransaccion.save();
    
    // Si es un ingreso, actualizar metas activas automáticamente
    if (transaccionGuardada.tipo === 'ingreso') {
      await actualizarMetasConIngreso(req.usuario.id, transaccionGuardada.monto);
    }

    await transaccionGuardada.populate('usuario', 'nombre email');

    res.status(201).json({
      message: 'Transacción creada exitosamente',
      transaccion: transaccionGuardada
    });

  } catch (error) {
    console.error('Error creando transacción:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Datos de transacción inválidos',
        detalles: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al crear transacción' 
    });
  }
});

// 🔹 Listar transacciones con filtros y paginación
router.get('/', [
  query('pagina').optional().isInt({ min: 1 }).withMessage('Página debe ser un número mayor a 0'),
  query('limite').optional().isInt({ min: 1, max: 100 }).withMessage('Límite debe ser entre 1 y 100'),
  query('tipo').optional().isIn(['ingreso', 'gasto']).withMessage('Tipo inválido'),
  query('categoria').optional().isString().withMessage('Categoría debe ser texto'),
  query('fecha_desde').optional().isISO8601().withMessage('Fecha desde inválida'),
  query('fecha_hasta').optional().isISO8601().withMessage('Fecha hasta inválida')
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
      pagina = 1,
      limite = 20,
      tipo,
      categoria,
      fecha_desde,
      fecha_hasta,
      buscar
    } = req.query;

    // Construir filtros
    const filtros = { 
      usuario: req.usuario.id,
      activa: true
    };

    if (tipo) filtros.tipo = tipo;
    if (categoria) filtros.categoria = categoria;
    
    if (fecha_desde || fecha_hasta) {
      filtros.fecha = {};
      if (fecha_desde) filtros.fecha.$gte = new Date(fecha_desde);
      if (fecha_hasta) filtros.fecha.$lte = new Date(fecha_hasta);
    }

    if (buscar) {
      filtros.descripcion = { $regex: buscar, $options: 'i' };
    }

    // Configurar paginación
    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    // Ejecutar consulta
    const [transacciones, total] = await Promise.all([
      Transaccion.find(filtros)
        .sort({ fecha: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limite))
        .populate('usuario', 'nombre'),
      Transaccion.countDocuments(filtros)
    ]);

    // Calcular estadísticas
    const estadisticas = await Transaccion.aggregate([
      { $match: { ...filtros, usuario: req.usuario.id } },
      {
        $group: {
          _id: '$tipo',
          total: { $sum: '$monto' },
          cantidad: { $sum: 1 }
        }
      }
    ]);

    const ingresos = estadisticas.find(e => e._id === 'ingreso') || { total: 0, cantidad: 0 };
    const gastos = estadisticas.find(e => e._id === 'gasto') || { total: 0, cantidad: 0 };

    res.json({
      transacciones,
      paginacion: {
        paginaActual: parseInt(pagina),
        totalPaginas: Math.ceil(total / parseInt(limite)),
        totalElementos: total,
        elementosPorPagina: parseInt(limite)
      },
      estadisticas: {
        totalIngresos: ingresos.total,
        totalGastos: gastos.total,
        balance: ingresos.total - gastos.total,
        cantidadIngresos: ingresos.cantidad,
        cantidadGastos: gastos.cantidad
      }
    });

  } catch (error) {
    console.error('Error obteniendo transacciones:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al obtener transacciones' 
    });
  }
});

// 🔹 Obtener transacción por ID
router.get('/:id', async (req, res) => {
  try {
    const transaccion = await Transaccion.findOne({
      _id: req.params.id,
      usuario: req.usuario.id,
      activa: true
    }).populate('usuario', 'nombre email');

    if (!transaccion) {
      return res.status(404).json({ 
        error: 'Transacción no encontrada' 
      });
    }

    res.json(transaccion);

  } catch (error) {
    console.error('Error obteniendo transacción:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'ID de transacción inválido' });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al obtener transacción' 
    });
  }
});

// 🔹 Actualizar una transacción
router.put('/:id', validacionTransaccion, async (req, res) => {
  try {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({
        error: 'Datos inválidos',
        detalles: errores.array()
      });
    }

    const { descripcion, categoria, ...otrosDatos } = req.body;
    
    // Clasificar automáticamente si no se proporciona categoría
    const categoriaFinal = categoria || clasificarCategoria(descripcion);
    
    const transaccionActualizada = await Transaccion.findOneAndUpdate(
      { 
        _id: req.params.id, 
        usuario: req.usuario.id,
        activa: true
      },
      { 
        ...otrosDatos,
        descripcion,
        categoria: categoriaFinal
      },
      { 
        new: true, 
        runValidators: true 
      }
    ).populate('usuario', 'nombre email');

    if (!transaccionActualizada) {
      return res.status(404).json({ 
        error: 'Transacción no encontrada' 
      });
    }

    res.json({
      message: 'Transacción actualizada exitosamente',
      transaccion: transaccionActualizada
    });

  } catch (error) {
    console.error('Error actualizando transacción:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'ID de transacción inválido' });
    }
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Datos de transacción inválidos',
        detalles: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al actualizar transacción' 
    });
  }
});

// 🔹 Eliminar una transacción (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const transaccionEliminada = await Transaccion.findOneAndUpdate(
      { 
        _id: req.params.id, 
        usuario: req.usuario.id,
        activa: true
      },
      { activa: false },
      { new: true }
    );

    if (!transaccionEliminada) {
      return res.status(404).json({ 
        error: 'Transacción no encontrada' 
      });
    }

    res.json({ 
      message: 'Transacción eliminada exitosamente',
      transaccion: transaccionEliminada
    });

  } catch (error) {
    console.error('Error eliminando transacción:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'ID de transacción inválido' });
    }

    res.status(500).json({ 
      error: 'Error interno del servidor al eliminar transacción' 
    });
  }
});

// 🔹 Obtener resumen por categorías
router.get('/resumen/categorias', async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta, tipo } = req.query;
    
    const filtros = { 
      usuario: req.usuario.id,
      activa: true
    };

    if (tipo) filtros.tipo = tipo;
    
    if (fecha_desde || fecha_hasta) {
      filtros.fecha = {};
      if (fecha_desde) filtros.fecha.$gte = new Date(fecha_desde);
      if (fecha_hasta) filtros.fecha.$lte = new Date(fecha_hasta);
    }

    const resumen = await Transaccion.aggregate([
      { $match: filtros },
      {
        $group: {
          _id: '$categoria',
          total: { $sum: '$monto' },
          cantidad: { $sum: 1 },
          promedio: { $avg: '$monto' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.json({
      resumenCategorias: resumen,
      totalGeneral: resumen.reduce((acc, cat) => acc + cat.total, 0)
    });

  } catch (error) {
    console.error('Error obteniendo resumen por categorías:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al obtener resumen' 
    });
  }
});

// 🔹 Obtener tendencias mensuales
router.get('/tendencias/mensuales', async (req, res) => {
  try {
    const { año = new Date().getFullYear() } = req.query;

    const tendencias = await Transaccion.aggregate([
      {
        $match: {
          usuario: req.usuario.id,
          activa: true,
          fecha: {
            $gte: new Date(`${año}-01-01`),
            $lte: new Date(`${año}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: {
            mes: { $month: '$fecha' },
            tipo: '$tipo'
          },
          total: { $sum: '$monto' },
          cantidad: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.mes',
          ingresos: {
            $sum: {
              $cond: [{ $eq: ['$_id.tipo', 'ingreso'] }, '$total', 0]
            }
          },
          gastos: {
            $sum: {
              $cond: [{ $eq: ['$_id.tipo', 'gasto'] }, '$total', 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Rellenar meses faltantes con ceros
    const mesesCompletos = Array.from({ length: 12 }, (_, i) => {
      const mesData = tendencias.find(t => t._id === i + 1);
      return {
        mes: i + 1,
        ingresos: mesData?.ingresos || 0,
        gastos: mesData?.gastos || 0,
        balance: (mesData?.ingresos || 0) - (mesData?.gastos || 0)
      };
    });

    res.json({
      año: parseInt(año),
      tendenciasMensuales: mesesCompletos
    });

  } catch (error) {
    console.error('Error obteniendo tendencias mensuales:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al obtener tendencias' 
    });
  }
});

// Función auxiliar para actualizar metas con ingresos
async function actualizarMetasConIngreso(usuarioId, montoIngreso) {
  try {
    // Obtener metas activas del usuario
    const metasActivas = await Meta.find({
      usuario: usuarioId,
      estado: 'activa'
    }).sort({ prioridad: -1, fechaLimite: 1 });

    // Distribuir el ingreso entre las metas según prioridad
    let montoRestante = montoIngreso * 0.1; // 10% del ingreso para metas

    for (const meta of metasActivas) {
      if (montoRestante <= 0) break;
      
      const montoFaltante = meta.montoObjetivo - meta.montoActual;
      if (montoFaltante <= 0) continue;

      const montoAAgregar = Math.min(montoRestante, montoFaltante);
      
      await Meta.findByIdAndUpdate(meta._id, {
        $inc: { montoActual: montoAAgregar }
      });

      montoRestante -= montoAAgregar;
    }
  } catch (error) {
    console.error('Error actualizando metas:', error);
  }
}

export default router;