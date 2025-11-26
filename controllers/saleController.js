import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Customer from '../models/Customer.js';

// Get all sales
export const getSales = async (req, res) => {
  try {
    const sales = await Sale.find()
      .populate('productId sellerId customerId')
      .sort({ createdAt: -1 });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single sale
export const getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('productId sellerId customerId');
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    res.json(sale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create sale (manual use only; billing now creates sales automatically)
export const createSale = async (req, res) => {
  try {
    const { productId, sellerId, customerId, quantity } = req.body;

    // Convert quantity to number and validate
    const quantityNum = parseInt(quantity, 10);

    if (!quantityNum || quantityNum < 1) {
      return res.status(400).json({ message: 'Invalid quantity. Must be a positive number.' });
    }

    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check stock
    if (product.stock < quantityNum) {
      return res.status(400).json({ message: `Insufficient stock. Available: ${product.stock}, Requested: ${quantityNum}` });
    }

    // Get seller and customer details
    const seller = await Seller.findById(sellerId);
    const customer = await Customer.findById(customerId);

    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // NOTE: This manual endpoint assumes product has price/commission fields.
    const unitPrice = product.price;
    const total = unitPrice * quantityNum;
    const commission = product.commission * quantityNum;

    const sale = new Sale({
      productId,
      sellerId,
      customerId,
      productName: product.name,
      sellerName: seller.name,
      customerName: customer.name,
      quantity: quantityNum,
      unitPrice,
      total,
      commission
    });

    const newSale = await sale.save();

    // Update product stock
    product.stock -= quantityNum;
    await product.save();

    // Update seller commission
    seller.totalCommission += commission;
    await seller.save();

    res.status(201).json(newSale);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete sale
export const deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    res.json({ message: 'Sale deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
