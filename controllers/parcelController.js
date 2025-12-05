import Parcel from '../models/Parcel.js';
import Product from '../models/Product.js';

// Get parcels list (with optional filters)
export const getParcels = async (req, res) => {
  try {
    const { tracking, status, paymentStatus } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

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

    const [total, parcels] = await Promise.all([
      Parcel.countDocuments(filter),
      Parcel.find(filter)
        .populate('product', 'name model category')
        .populate('createdBy', 'username email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.json({
      data: parcels,
      total,
      page,
      totalPages,
      limit,
    });
  } catch (error) {
    console.error('Error fetching parcels:', error);
    res.status(500).json({ message: 'Failed to fetch parcels' });
  }
};

// Create new parcel
export const createParcel = async (req, res) => {
  try {
    const { productId, customerName, trackingNumber, address, status, paymentStatus, notes, codAmount, parcelDate } = req.body;

    if (!productId || !customerName || !trackingNumber || !address) {
      return res
        .status(400)
        .json({ message: 'Product, customer name, tracking number and address are required' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const existing = await Parcel.findOne({ trackingNumber });
    if (existing) {
      return res.status(400).json({ message: 'A parcel with this tracking number already exists' });
    }

    const numericCodAmount = Number(codAmount || 0);

    const parcel = await Parcel.create({
      product: productId,
      customerName: customerName.trim(),
      trackingNumber,
      address,
      codAmount: Number.isNaN(numericCodAmount) ? 0 : numericCodAmount,
      parcelDate: parcelDate ? new Date(parcelDate) : new Date(),
      status: status || 'processing',
      paymentStatus: paymentStatus || 'unpaid',
      notes: notes || '',
      createdBy: req.admin._id,
    });

    const populatedParcel = await Parcel.findById(parcel._id)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email');

    res.status(201).json(populatedParcel);
  } catch (error) {
    console.error('Error creating parcel:', error);
    res.status(500).json({ message: 'Failed to create parcel' });
  }
};

// Update parcel status / payment / notes
export const updateParcelStatus = async (req, res) => {
  try {
    const { status, paymentStatus, notes } = req.body;

    const update = {};
    if (status) update.status = status;
    if (paymentStatus) update.paymentStatus = paymentStatus;
    if (typeof notes === 'string') update.notes = notes;

    const parcel = await Parcel.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    )
      .populate('product', 'name model category')
      .populate('createdBy', 'username email');

    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }

    res.json(parcel);
  } catch (error) {
    console.error('Error updating parcel status:', error);
    res.status(500).json({ message: 'Failed to update parcel status' });
  }
};
