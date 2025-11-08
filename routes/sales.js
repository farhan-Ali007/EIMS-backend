import express from 'express';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Seller from '../models/Seller.js';
import Customer from '../models/Customer.js';

const router = express.Router();

// Get all sales
router.get('/', async (req, res) => {
  try {
    const sales = await Sale.find()
      .populate('productId sellerId customerId')
      .sort({ createdAt: -1 });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single sale
router.get('/:id', async (req, res) => {
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
});

// Create sale (auto-calculate total and commission, update stock)
router.post('/', async (req, res) => {
  try {
    const { productId, sellerId, customerId, quantity } = req.body;
    
    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Check stock
    if (product.stock < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
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
    
    // Calculate total and commission
    const unitPrice = product.price;
    const total = unitPrice * quantity;
    const commission = product.commission * quantity;
    
    // Create sale
    const sale = new Sale({
      productId,
      sellerId,
      customerId,
      productName: product.name,
      sellerName: seller.name,
      customerName: customer.name,
      quantity,
      unitPrice,
      total,
      commission
    });
    
    const newSale = await sale.save();
    
    // Update product stock
    product.stock -= quantity;
    await product.save();
    
    // Update seller commission
    seller.totalCommission += commission;
    await seller.save();
    
    res.status(201).json(newSale);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete sale
router.delete('/:id', async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) {
      return res.status(404).json({ message: 'Sale not found' });
    }
    res.json({ message: 'Sale deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
