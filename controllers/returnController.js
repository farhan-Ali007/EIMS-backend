import Return from '../models/Return.js';
import Product from '../models/Product.js';

// Create a new return and increase product stock
export const createReturn = async (req, res) => {
  try {
    const { productId, quantity, unitPrice, trackingId, notes, customerName } = req.body;

    if (!productId || !quantity || !unitPrice || !trackingId) {
      return res.status(400).json({ message: 'productId, quantity, unitPrice, and trackingId are required' });
    }

    const qty = Number(quantity);
    const price = Number(unitPrice);

    if (Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Quantity must be a positive number' });
    }

    if (Number.isNaN(price) || price < 0) {
      return res.status(400).json({ message: 'Unit price must be a non-negative number' });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Increment product stock
    product.stock = (Number(product.stock) || 0) + qty;
    await product.save();

    const returnRecord = await Return.create({
      product: productId,
      quantity: qty,
      unitPrice: price,
      trackingId,
      notes,
      customerName,
      createdBy: req.admin?._id
    });

    const populated = await returnRecord.populate('product', 'name model category');

    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating return:', error);
    res.status(500).json({ message: error.message || 'Failed to create return' });
  }
};

// Get list of returns (optional search by trackingId or product name/model)
export const getReturns = async (req, res) => {
  try {
    const { search } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { trackingId: { $regex: search, $options: 'i' } }
      ];
    }

    let returnsQuery = Return.find(query)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });

    const returns = await returnsQuery.exec();

    res.json(returns);
  } catch (error) {
    console.error('Error fetching returns:', error);
    res.status(500).json({ message: error.message || 'Failed to load returns' });
  }
};
