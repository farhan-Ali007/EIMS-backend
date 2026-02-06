import Product from '../models/Product.js';
import StockHistory from '../models/StockHistory.js';
import PurchaseBatch from '../models/PurchaseBatch.js';

// Get all products
export const getProducts = async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get low stock products (stock <= 1)
export const getLowStockProducts = async (req, res) => {
  try {
    const products = await Product.find({ stock: { $lte: 1 } });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single product
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create product
export const createProduct = async (req, res) => {
  try {
    // Normalize barcode: treat empty string or whitespace as "no barcode"
    const payload = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(payload, 'barcode')) {
      const rawBarcode = typeof payload.barcode === 'string' ? payload.barcode.trim() : payload.barcode;
      if (!rawBarcode) {
        delete payload.barcode;
      } else {
        payload.barcode = rawBarcode;
      }
    }

    // Prevent duplicate model entries
    const existing = await Product.findOne({ model: payload.model });
    if (existing) {
      return res.status(400).json({ message: 'A product with this model already exists' });
    }

    const product = new Product(payload);
    const newProduct = await product.save();

    // Create initial stock history entry
    if (newProduct.stock > 0) {
      await StockHistory.create({
        productId: newProduct._id,
        type: 'stock_in',
        quantity: newProduct.stock,
        previousStock: 0,
        newStock: newProduct.stock,
        reason: 'Initial stock',
        notes: 'Product created with initial stock',
        createdBy: req.user?.id
      });
    }

    res.status(201).json(newProduct);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Add stock to product by barcode (for scan-based inventory increments)
export const addProductStockByBarcode = async (req, res) => {
  try {
    const raw = String(req.body?.barcode || '').trim();
    const batchId = req.body?.batchId ? String(req.body.batchId).trim() : '';
    if (!raw) {
      return res.status(400).json({ message: 'Barcode is required' });
    }

    const product = await Product.findOne({ barcode: raw });
    if (!product) {
      return res.status(404).json({ message: 'Product not found for this barcode' });
    }

    const previousStock = product.stock;
    const qtyNum = 1;
    const newStock = previousStock + qtyNum;

    product.stock = newStock;
    await product.save();

    await StockHistory.create({
      productId: product._id,
      type: 'stock_in',
      quantity: qtyNum,
      previousStock,
      newStock,
      reason: 'Stock added via barcode scan',
      notes: '',
      createdBy: req.user?.id,
    });

    // Optionally attach this scan to a purchase batch
    if (batchId) {
      try {
        const batch = await PurchaseBatch.findById(batchId);
        if (batch) {
          const items = Array.isArray(batch.items) ? batch.items : [];
          const productIdStr = String(product._id);
          const existing = items.find((it) => String(it.productId) === productIdStr);

          const unitPrice = Number.isFinite(Number(req.body?.unitPrice))
            ? Number(req.body.unitPrice)
            : Number(product.originalPrice || 0) || 0;

          if (existing) {
            existing.quantity = Number(existing.quantity || 0) + qtyNum;
          } else {
            items.push({
              productId: product._id,
              quantity: qtyNum,
              unitPrice,
            });
          }

          batch.items = items;
          batch.totalAmount = items.reduce(
            (sum, it) => sum + Number(it.quantity || 0) * Number(it.unitPrice || 0),
            0,
          );

          await batch.save();
        }
      } catch (batchErr) {
        // Log but do not fail the main scan operation if batch update fails
        console.error('Error attaching scan to purchase batch:', batchErr);
      }
    }

    res.json({
      message: 'Stock added successfully via barcode scan',
      product,
      previousStock,
      newStock,
      quantityAdded: qtyNum,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update product
export const updateProduct = async (req, res) => {
  try {
    const oldProduct = await Product.findById(req.params.id);
    if (!oldProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Normalize barcode on update as well
    const updateData = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updateData, 'barcode')) {
      const rawBarcode = typeof updateData.barcode === 'string' ? updateData.barcode.trim() : updateData.barcode;
      if (!rawBarcode) {
        // If request sends empty/whitespace barcode, do NOT touch existing barcode in DB
        // Remove the key from the update payload so only other fields (e.g. stock) are updated
        delete updateData.barcode;
      } else {
        updateData.barcode = rawBarcode;
      }
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    // Track stock changes
    if (oldProduct.stock !== product.stock) {
      const stockDifference = product.stock - oldProduct.stock;
      await StockHistory.create({
        productId: product._id,
        type: stockDifference > 0 ? 'stock_in' : 'stock_out',
        quantity: Math.abs(stockDifference),
        previousStock: oldProduct.stock,
        newStock: product.stock,
        reason: 'Stock updated',
        notes: 'Stock updated via product edit',
        createdBy: req.user?.id
      });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Also delete related stock history
    await StockHistory.deleteMany({ productId: req.params.id });

    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get stock history for a product
export const getProductStockHistory = async (req, res) => {
  try {
    const stockHistory = await StockHistory.find({ productId: req.params.id })
      .populate('createdBy', 'username')
      .sort({ createdAt: -1 });
    res.json(stockHistory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add stock to product
export const addProductStock = async (req, res) => {
  try {
    const { quantity, reason, notes } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Quantity must be greater than 0' });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const previousStock = product.stock;
    const qtyNum = parseInt(quantity, 10);
    const newStock = previousStock + qtyNum;

    // Update product stock
    product.stock = newStock;
    await product.save();

    // Create stock history entry
    await StockHistory.create({
      productId: product._id,
      type: 'stock_in',
      quantity: qtyNum,
      previousStock,
      newStock,
      reason: reason || 'Stock added',
      notes: notes || '',
      createdBy: req.user?.id
    });

    res.json({
      message: 'Stock added successfully',
      product,
      previousStock,
      newStock,
      quantityAdded: qtyNum
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
