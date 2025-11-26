import express from 'express';
import Parcel from '../models/Parcel.js';
import Product from '../models/Product.js';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes here require admin / manager access
router.use(authenticate, authorizeManagerOrAdmin);

// GET /api/parcels - list parcels (optional query: tracking, status, paymentStatus)
router.get('/', async (req, res) => {
  try {
    const { tracking, status, paymentStatus } = req.query;
    const filter = {};

    if (tracking) {
      filter.trackingNumber = { $regex: tracking, $options: 'i' };
    }
    if (status) {
      filter.status = status;
    }
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    const parcels = await Parcel.find(filter)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });

    res.json(parcels);
  } catch (error) {
    console.error('Error fetching parcels:', error);
    res.status(500).json({ message: 'Failed to fetch parcels' });
  }
});

// POST /api/parcels - create new parcel
router.post('/', async (req, res) => {
  try {
    const { productId, trackingNumber, address, status, paymentStatus, notes } = req.body;

    if (!productId || !trackingNumber || !address) {
      return res.status(400).json({ message: 'Product, tracking number and address are required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const existing = await Parcel.findOne({ trackingNumber });
    if (existing) {
      return res.status(400).json({ message: 'A parcel with this tracking number already exists' });
    }

    const parcel = await Parcel.create({
      product: productId,
      trackingNumber,
      address,
      status: status || 'processing',
      paymentStatus: paymentStatus || 'unpaid',
      notes: notes || '',
      createdBy: req.admin._id
    });

    const populatedParcel = await Parcel.findById(parcel._id)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email');

    res.status(201).json(populatedParcel);
  } catch (error) {
    console.error('Error creating parcel:', error);
    res.status(500).json({ message: 'Failed to create parcel' });
  }
});

export default router;
