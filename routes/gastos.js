import express from 'express';
import Transaccion from '../models/transacciones.js';

const router = express.Router();

// Función para clasificar automáticamente
function clasificarCategoria(desc) {
  const texto = desc.toLowerCase();
  if (texto.includes('comida') || texto.includes('restaurante')) return 'alimentación';
  if (texto.includes('transporte') || texto.includes('uber') || texto.includes('taxi')) return 'transporte';
  if (texto.includes('cine') || texto.includes('ocio') || texto.includes('pelicula')) return 'entretenimiento';
  if (texto.includes('luz') || texto.includes('agua') || texto.includes('internet')) return 'servicios';
  if (texto.includes('salud') || texto.includes('medicina')) return 'salud';
  if (texto.includes('ropa') || texto.includes('zapato')) return 'ropa';
  return 'otros';
}

// 🔹 Crear nueva transacción
router.post('/', async (req, res) => {
  try {
    const categoriaDetectada = clasificarCategoria(req.body.descripcion);
    const nueva = new Transaccion({...req.body, categoria: categoriaDetectada, usuario: req.usuario.id});
    const guardada = await nueva.save();
    res.status(201).json(guardada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔹 Listar todas las transacciones
router.get('/', async (req, res) => {
  try {
    const lista = await Transaccion.find();
    res.json(lista);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 🔹 Actualizar una transacción
router.put('/:id', async (req, res) => {
  try {
    const categoriaDetectada = clasificarCategoria(req.body.descripcion);
    const actualizada = await Transaccion.findByIdAndUpdate(
      req.params.id,
      { ...req.body, categoria: categoriaDetectada },
      { new: true }
    );
    res.json(actualizada);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔹 Eliminar una transacción
router.delete('/:id', async (req, res) => {
  try {
    await Transaccion.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transacción eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;