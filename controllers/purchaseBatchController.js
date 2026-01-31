import PurchaseBatch from '../models/PurchaseBatch.js';
import Product from '../models/Product.js';

export const createPurchaseBatch = async (req, res) => {
  try {
    const { batchNumber, supplierName, purchaseDate, notes, items } = req.body || {};

    if (!supplierName || !String(supplierName).trim()) {
      return res.status(400).json({ message: 'Supplier name is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one item is required' });
    }

    const normalizedItems = [];

    for (const rawItem of items) {
      const productId = rawItem?.productId;
      const quantity = Number(rawItem?.quantity || 0);
      const unitPrice = Number(rawItem?.unitPrice || 0);

      if (!productId) {
        return res.status(400).json({ message: 'Each item must have a productId' });
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return res.status(400).json({ message: 'Quantity must be greater than 0 for all items' });
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ message: 'Unit price must be 0 or greater for all items' });
      }

      const product = await Product.findById(productId).select('_id name model');
      if (!product) {
        return res.status(400).json({ message: 'One or more products were not found' });
      }

      normalizedItems.push({ productId: product._id, quantity, unitPrice });
    }

    const totalAmount = normalizedItems.reduce(
      (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
      0
    );

    const batch = await PurchaseBatch.create({
      batchNumber: batchNumber ? String(batchNumber).trim() : undefined,
      supplierName: String(supplierName).trim(),
      purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
      notes: notes ? String(notes).trim() : undefined,
      items: normalizedItems,
      totalAmount,
    });

    // Update product stock
    for (const item of normalizedItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: item.quantity },
      });
    }

    return res.status(201).json(batch);
  } catch (error) {
    console.error('Error creating purchase batch:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getPurchaseBatches = async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);

    const filter = {};
    if (req.query.startDate || req.query.endDate) {
      filter.purchaseDate = {};
      if (req.query.startDate) {
        filter.purchaseDate.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.purchaseDate.$lte = new Date(req.query.endDate);
      }
    }

    const batches = await PurchaseBatch.find(filter)
      .sort({ purchaseDate: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json(batches);
  } catch (error) {
    console.error('Error fetching purchase batches:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
