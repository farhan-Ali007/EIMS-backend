import express from 'express';
import mongoose from 'mongoose';
import { authenticate, authorizeSeller } from '../middleware/auth.js';
import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Seller from '../models/Seller.js';

const router = express.Router();

// All seller dashboard routes require authenticated seller
router.use(authenticate, authorizeSeller);

// Get seller's dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.user.id); // Convert to ObjectId
    
    // Debug: Check all sales for this seller
    const allSales = await Sale.find({ sellerId }).select('total commission quantity');
    console.log('🔍 Debug - Seller ID:', req.user.id);
    console.log('🔍 Debug - All sales for this seller:', allSales);
    
    // Get all-time totals for this seller
    const totalSalesCount = await Sale.countDocuments({ sellerId });
    
    const totalStats = await Sale.aggregate([
      {
        $match: { sellerId: sellerId } // Now using ObjectId
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalCommission: { $sum: '$commission' },
          totalProductsSold: { $sum: '$quantity' }
        }
      }
    ]);
    
    const stats = totalStats[0] || {
      totalRevenue: 0,
      totalCommission: 0,
      totalProductsSold: 0
    };
    
    console.log('✅ Seller stats for', sellerId.toString(), ':', {
      totalSales: totalSalesCount,
      revenue: stats.totalRevenue,
      commission: stats.totalCommission,
      products: stats.totalProductsSold
    });
    
    res.json({
      totalSales: totalSalesCount,
      totalRevenue: stats.totalRevenue,
      totalCommission: stats.totalCommission,
      totalProductsSold: stats.totalProductsSold
    });
  } catch (error) {
    console.error('Seller stats error:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get seller's recent sales
router.get('/recent-sales', async (req, res) => {
  try {
    const sellerId = new mongoose.Types.ObjectId(req.user.id);
    const limit = parseInt(req.query.limit) || 10;
    
    const sales = await Sale.find({ sellerId })
      .populate('productId', 'name price')
      .populate('customerId', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit);
    
    console.log(`📋 Fetched ${sales.length} sales for seller ${req.user.id}`);
    
    res.json(sales);
  } catch (error) {
    console.error('Error fetching recent sales:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get seller's sales history with pagination
router.get('/sales', async (req, res) => {
  try {
    const sellerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const sales = await Sale.find({ sellerId })
      .populate('productId customerId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await Sale.countDocuments({ sellerId });
    
    res.json({
      sales,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get available products for quick sale
router.get('/products', async (req, res) => {
  try {
    const products = await Product.find({ stock: { $gt: 0 } })
      .select('name category price stock commission')
      .sort({ name: 1 });
    
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get customers (for quick sale)
router.get('/customers', async (req, res) => {
  try {
    const customers = await Customer.find()
      .select('name email phone type')
      .sort({ name: 1 });
    
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create a sale (seller-specific)
router.post('/create-sale', async (req, res) => {
  try {
    const sellerId = req.user.id;
    const { productId, customerId, quantity } = req.body;
    
    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    // Check stock
    if (product.stock < quantity) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }
    
    // Get customer details
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    // Get seller details
    const seller = await Seller.findById(sellerId);
    
    // Calculate totals
    const total = product.price * quantity;
    const commission = product.commission * quantity;
    
    // Create sale
    const sale = new Sale({
      productId,
      productName: product.name,
      customerId,
      customerName: customer.name,
      sellerId,
      sellerName: seller.name,
      quantity,
      unitPrice: product.price,
      total,
      commission
    });
    
    await sale.save();
    
    // Update product stock
    product.stock -= quantity;
    await product.save();
    
    // Update seller commission
    seller.totalCommission += commission;
    await seller.save();
    
    res.status(201).json({
      success: true,
      sale,
      message: 'Sale completed successfully!'
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Add new customer (seller can add customers)
router.post('/add-customer', async (req, res) => {
  try {
    const customer = new Customer(req.body);
    const newCustomer = await customer.save();
    res.status(201).json(newCustomer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
