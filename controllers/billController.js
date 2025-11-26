import Bill from '../models/Bill.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Admin from '../models/Admin.js';
import Seller from '../models/Seller.js';
import Sale from '../models/Sale.js';

// Get all bills with pagination and filters
export const getBills = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};

    // Date range filter
    if (req.query.startDate || req.query.endDate) {
      filter.createdAt = {};
      if (req.query.startDate) {
        filter.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        filter.createdAt.$lte = new Date(req.query.endDate);
      }
    }

    // Customer filter
    if (req.query.customerId) {
      filter['customer.id'] = req.query.customerId;
    }

    // Status filter
    if (req.query.status) {
      filter.status = req.query.status;
    }

    // Search by bill number or customer name
    if (req.query.search) {
      filter.$or = [
        { billNumber: { $regex: req.query.search, $options: 'i' } },
        { 'customer.name': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    const bills = await Bill.find(filter)
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Bill.countDocuments(filter);

    res.json({
      bills,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get single bill by ID
export const getBillById = async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id)
      .populate('createdBy', 'username email')
      .populate('items.productId', 'name model category');

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    res.json(bill);
  } catch (error) {
    console.error('Error fetching bill:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Create new bill
export const createBill = async (req, res) => {
  try {
    const { customer, items, subtotal, discount, discountType, total, amountPaid, previousRemaining, remainingAmount, paymentMethod, notes, sellerId } = req.body;

    if (!sellerId) {
      return res.status(400).json({ message: 'Seller is required for billing' });
    }

    const embeddedCustomer = customer ? {
      id: customer.id || customer._id || customer.customerId,
      name: customer.name,
      type: customer.type,
      phone: customer.phone,
      address: customer.address
    } : null;

    // Validate items and check stock
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(400).json({ message: `Product ${item.name} not found` });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${item.name}. Available: ${product.stock}, Requested: ${item.quantity}`
        });
      }
    }

    // Create bill
    const numericTotal = Number(total) || 0;
    const numericAmountPaid = Number(amountPaid ?? 0);
    const prevRemaining = Number(previousRemaining ?? 0);
    // Global remaining = previous remaining + this bill total - amount paid
    const globalRemaining = prevRemaining + numericTotal - numericAmountPaid;

    const bill = new Bill({
      seller: sellerId,
      customer: embeddedCustomer,
      items: items.map(item => ({
        ...item,
        totalAmount: item.selectedPrice * item.quantity
      })),
      subtotal,
      discount: discount || 0,
      discountType: discountType || 'percentage',
      total: numericTotal,
      amountPaid: numericAmountPaid,
      remainingAmount: globalRemaining < 0 ? 0 : globalRemaining,
      paymentMethod: paymentMethod || 'cash',
      createdBy: req.user.id,
      notes
    });
    await bill.save();

    // Update product stock
    for (const item of items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: -item.quantity } }
      );
    }

    // Update seller commission based on total quantity
    const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const seller = await Seller.findById(sellerId);
    if (seller) {
      const perUnitCommission = Number(seller.commissionRate || 0);
      const commissionToAdd = perUnitCommission * totalQuantity;

      // Add commission for this bill to seller's running totals
      seller.commission = Number(seller.commission || 0) + commissionToAdd;
      seller.totalCommission = Number(seller.totalCommission || 0) + commissionToAdd;

      await seller.save();
    }

    // Create sales records for this bill so Sales module is driven by billing
    if (embeddedCustomer && seller) {
      const salesToInsert = items.map((item) => {
        const quantityNum = Number(item.quantity || 0);
        const unitPrice = Number(item.selectedPrice || 0);
        const lineTotal = unitPrice * quantityNum;
        const perUnitCommission = Number(seller.commissionRate || 0);
        const lineCommission = perUnitCommission * quantityNum;

        return {
          productId: item.productId,
          sellerId: seller._id,
          customerId: embeddedCustomer.id,
          productName: item.name,
          sellerName: seller.name,
          customerName: embeddedCustomer.name,
          quantity: quantityNum,
          unitPrice,
          total: lineTotal,
          commission: lineCommission
        };
      }).filter(sale => sale.quantity > 0 && sale.unitPrice >= 0);

      if (salesToInsert.length > 0) {
        await Sale.insertMany(salesToInsert);
      }
    }

    // Populate the created bill
    const populatedBill = await Bill.findById(bill._id)
      .populate('createdBy', 'username email')
      .populate('items.productId', 'name model category');

    res.status(201).json(populatedBill);
  } catch (error) {
    console.error('Error creating bill:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get customer purchase history
export const getCustomerHistory = async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const bills = await Bill.find({ 'customer.id': customerId })
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Bill.countDocuments({ 'customer.id': customerId });

    // Calculate customer statistics (totals) via aggregation
    const aggregateStats = await Bill.aggregate([
      { $match: { 'customer.id': customerId } },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: 1 },
          totalAmount: { $sum: '$total' },
          averageOrderValue: { $avg: '$total' },
          totalPaid: { $sum: { $ifNull: ['$amountPaid', 0] } }
        }
      }
    ]);

    // Latest bill's remainingAmount represents the current outstanding balance
    const latestBill = await Bill.findOne({ 'customer.id': customerId })
      .sort({ createdAt: -1 })
      .select('remainingAmount');

    const statsBase = aggregateStats[0] || { totalPurchases: 0, totalAmount: 0, averageOrderValue: 0, totalPaid: 0 };
    const stats = {
      ...statsBase,
      totalRemaining: latestBill?.remainingAmount ?? 0
    };

    res.json({
      bills,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      },
      stats
    });
  } catch (error) {
    console.error('Error fetching customer history:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get billing statistics
export const getBillingStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [dailyStats, monthlyStats, yearlyStats] = await Promise.all([
      Bill.aggregate([
        { $match: { createdAt: { $gte: startOfDay }, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalBills: { $sum: 1 },
            totalRevenue: { $sum: '$total' },
            averageOrderValue: { $avg: '$total' }
          }
        }
      ]),
      Bill.aggregate([
        { $match: { createdAt: { $gte: startOfMonth }, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalBills: { $sum: 1 },
            totalRevenue: { $sum: '$total' },
            averageOrderValue: { $avg: '$total' }
          }
        }
      ]),
      Bill.aggregate([
        { $match: { createdAt: { $gte: startOfYear }, status: 'completed' } },
        {
          $group: {
            _id: null,
            totalBills: { $sum: 1 },
            totalRevenue: { $sum: '$total' },
            averageOrderValue: { $avg: '$total' }
          }
        }
      ])
    ]);

    res.json({
      daily: dailyStats[0] || { totalBills: 0, totalRevenue: 0, averageOrderValue: 0 },
      monthly: monthlyStats[0] || { totalBills: 0, totalRevenue: 0, averageOrderValue: 0 },
      yearly: yearlyStats[0] || { totalBills: 0, totalRevenue: 0, averageOrderValue: 0 }
    });
  } catch (error) {
    console.error('Error fetching billing stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update bill status
export const updateBillStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const bill = await Bill.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('createdBy', 'username email');

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    res.json(bill);
  } catch (error) {
    console.error('Error updating bill status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Delete bill (soft delete by changing status)
export const cancelBill = async (req, res) => {
  try {
    const bill = await Bill.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled' },
      { new: true }
    );

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    // Restore product stock if bill was completed
    if (bill.status === 'completed') {
      for (const item of bill.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: item.quantity } }
        );
      }
    }

    res.json({ message: 'Bill cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling bill:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
