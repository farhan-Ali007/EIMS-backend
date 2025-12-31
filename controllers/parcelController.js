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

    // After creating the parcel, decrement product stock by 1 if possible.
    try {
      const quantityToDeduct = 1;
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: productId, stock: { $gte: quantityToDeduct } },
        { $inc: { stock: -quantityToDeduct } },
        { new: true }
      );

      if (!updatedProduct) {
        console.warn(
          `Could not decrement stock for product ${productId} when creating parcel: not enough stock or product missing.`
        );
      }
    } catch (stockError) {
      console.error('Error updating product stock when creating parcel:', stockError);
      // Do not block parcel creation if stock adjustment fails
    }

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

export const updateParcel = async (req, res) => {
  try {
    const parcel = await Parcel.findById(req.params.id);
    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }

    const {
      productId,
      customerName,
      trackingNumber,
      address,
      status,
      paymentStatus,
      notes,
      codAmount,
      parcelDate
    } = req.body;

    if (trackingNumber !== undefined) {
      const nextTracking = String(trackingNumber || '').trim();
      if (!nextTracking) {
        return res.status(400).json({ message: 'Tracking number is required' });
      }

      const existing = await Parcel.findOne({ trackingNumber: nextTracking, _id: { $ne: parcel._id } });
      if (existing) {
        return res.status(400).json({ message: 'A parcel with this tracking number already exists' });
      }

      parcel.trackingNumber = nextTracking;
    }

    if (customerName !== undefined) {
      const nextName = String(customerName || '').trim();
      if (!nextName) {
        return res.status(400).json({ message: 'Customer name is required' });
      }
      parcel.customerName = nextName;
    }

    if (address !== undefined) {
      const nextAddress = String(address || '').trim();
      if (!nextAddress) {
        return res.status(400).json({ message: 'Address is required' });
      }
      parcel.address = nextAddress;
    }

    if (codAmount !== undefined) {
      const numericCodAmount = Number(codAmount || 0);
      parcel.codAmount = Number.isNaN(numericCodAmount) ? 0 : numericCodAmount;
    }

    if (parcelDate !== undefined) {
      if (!parcelDate) {
        parcel.parcelDate = undefined;
      } else {
        const d = new Date(parcelDate);
        if (!Number.isNaN(d.getTime())) {
          parcel.parcelDate = d;
        }
      }
    }

    if (status !== undefined) {
      parcel.status = status;
    }

    if (paymentStatus !== undefined) {
      parcel.paymentStatus = paymentStatus;
    }

    if (notes !== undefined) {
      parcel.notes = typeof notes === 'string' ? notes : '';
    }

    const prevProductId = parcel.product ? String(parcel.product) : undefined;
    const nextProductId = productId !== undefined && productId !== null && productId !== ''
      ? String(productId)
      : prevProductId;

    const isProductChanged = prevProductId && nextProductId && prevProductId !== nextProductId;

    if (isProductChanged) {
      const productExists = await Product.findById(nextProductId);
      if (!productExists) {
        return res.status(404).json({ message: 'Product not found' });
      }

      const quantityToDeduct = 1;
      const updatedNewProduct = await Product.findOneAndUpdate(
        { _id: nextProductId, stock: { $gte: quantityToDeduct } },
        { $inc: { stock: -quantityToDeduct } },
        { new: true }
      );

      if (!updatedNewProduct) {
        return res.status(400).json({ message: 'Insufficient stock for selected product' });
      }

      try {
        await Product.findByIdAndUpdate(prevProductId, { $inc: { stock: 1 } });
      } catch (restoreError) {
        console.error('Error restoring stock to previous product on parcel update:', restoreError);
      }

      parcel.product = nextProductId;
    }

    const saved = await parcel.save();
    const populated = await Parcel.findById(saved._id)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email');

    res.json(populated);
  } catch (error) {
    console.error('Error updating parcel:', error);
    res.status(500).json({ message: 'Failed to update parcel' });
  }
};

export const deleteParcel = async (req, res) => {
  try {
    const parcel = await Parcel.findById(req.params.id);
    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }

    const productId = parcel.product ? String(parcel.product) : undefined;
    await Parcel.findByIdAndDelete(req.params.id);

    if (productId) {
      try {
        await Product.findByIdAndUpdate(productId, { $inc: { stock: 1 } });
      } catch (stockError) {
        console.error('Error restoring stock when deleting parcel:', stockError);
      }
    }

    res.json({ message: 'Parcel deleted' });
  } catch (error) {
    console.error('Error deleting parcel:', error);
    res.status(500).json({ message: 'Failed to delete parcel' });
  }
};
