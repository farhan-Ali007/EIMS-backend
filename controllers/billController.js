import Bill from '../models/Bill.js';
import Income from '../models/Income.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Seller from '../models/Seller.js';

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
          message: `Insufficient stock for ${item.name}-${item.model}. Available: ${product.stock}, Requested: ${item.quantity}`
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

    // Record initial bill as income entry if applicable
    // expectedAmount represents how much they should pay for this bill,
    // amount represents how much was actually paid at bill creation (can be 0)
    if (embeddedCustomer) {
      try {
        const income = new Income({
          type: 'cash',
          expectedAmount: numericTotal,
          amount: numericAmountPaid,
          from: embeddedCustomer.name,
          date: new Date(),
          createdBy: req.user.id,
        });
        await income.save();
      } catch (incomeError) {
        console.error('Error creating income for initial bill payment:', incomeError);
        // Do not fail bill creation if income creation fails
      }
    }

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

// Update existing bill and recalculate stock based on item differences
export const updateBill = async (req, res) => {
  try {
    const billId = req.params.id;
    const { customer, items, subtotal, discount, discountType, total, amountPaid, previousRemaining, paymentMethod, notes } = req.body;

    const existingBill = await Bill.findById(billId);
    if (!existingBill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    // Build quantity maps for old and new items
    const oldQuantities = {};
    for (const item of existingBill.items) {
      const key = String(item.productId);
      oldQuantities[key] = (oldQuantities[key] || 0) + Number(item.quantity || 0);
    }

    const newQuantities = {};
    for (const item of items) {
      const key = String(item.productId);
      newQuantities[key] = (newQuantities[key] || 0) + Number(item.quantity || 0);
    }

    // Validate stock for new quantities, considering we are reverting old consumption
    const productIds = Array.from(new Set([...Object.keys(oldQuantities), ...Object.keys(newQuantities)]));

    for (const productId of productIds) {
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(400).json({ message: `Product with ID ${productId} not found` });
      }

      const oldQty = oldQuantities[productId] || 0;
      const newQty = newQuantities[productId] || 0;

      // Effective available stock if we add back the old quantity first
      const effectiveStock = Number(product.stock || 0) + oldQty;
      if (effectiveStock < newQty) {
        return res.status(400).json({
          message: `Insufficient stock for product ${product.name}. Available: ${effectiveStock}, Requested: ${newQty}`
        });
      }
    }

    // Apply stock changes: revert old items, apply new ones via a single delta per product
    for (const productId of productIds) {
      const oldQty = oldQuantities[productId] || 0;
      const newQty = newQuantities[productId] || 0;
      const delta = oldQty - newQty; // positive -> increase stock, negative -> decrease further

      if (delta !== 0) {
        await Product.findByIdAndUpdate(productId, { $inc: { stock: delta } });
      }
    }

    const embeddedCustomer = customer ? {
      id: customer.id || customer._id || customer.customerId,
      name: customer.name,
      type: customer.type,
      phone: customer.phone,
      address: customer.address
    } : null;

    const numericTotal = Number(total) || 0;
    const numericAmountPaid = Number(amountPaid ?? 0);
    const prevRemaining = Number(previousRemaining ?? 0);
    const globalRemaining = prevRemaining + numericTotal - numericAmountPaid;

    existingBill.customer = embeddedCustomer;
    existingBill.items = items.map(item => ({
      ...item,
      totalAmount: item.selectedPrice * item.quantity
    }));
    existingBill.subtotal = subtotal;
    existingBill.discount = discount || 0;
    existingBill.discountType = discountType || 'percentage';
    existingBill.total = numericTotal;
    existingBill.amountPaid = numericAmountPaid;
    existingBill.remainingAmount = globalRemaining < 0 ? 0 : globalRemaining;
    existingBill.paymentMethod = paymentMethod || existingBill.paymentMethod || 'cash';
    existingBill.notes = notes;

    await existingBill.save();

    const populatedBill = await Bill.findById(existingBill._id)
      .populate('createdBy', 'username email')
      .populate('items.productId', 'name model category');

    res.json(populatedBill);
  } catch (error) {
    console.error('Error updating bill:', error);
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

// Get the last unit price a customer paid for a specific product (based on Sales)
export const getCustomerLastProductPrice = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { productId } = req.query;

    if (!customerId || !productId) {
      return res.status(400).json({ message: 'customerId (param) and productId (query) are required' });
    }

    const sale = await Sale.findOne({ customerId, productId })
      .sort({ createdAt: -1 })
      .select('unitPrice createdAt');

    if (!sale) {
      return res.json({ found: false });
    }

    return res.json({
      found: true,
      unitPrice: sale.unitPrice,
      date: sale.createdAt,
    });
  } catch (error) {
    console.error('Error fetching customer last product price:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
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
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const previousStatus = bill.status;

    // Restore product stock only if this bill was previously completed
    if (previousStatus === 'completed') {
      for (const item of bill.items) {
        await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: item.quantity } }
        );
      }
    }

    bill.status = 'cancelled';
    await bill.save();

    res.json({ message: 'Bill cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling bill:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Add payment to an existing bill and create matching income entry
export const addBillPayment = async (req, res) => {
  try {
    const { amount, note } = req.body;

    const paidNow = Number(amount || 0);
    if (!paidNow || paidNow <= 0) {
      return res.status(400).json({ message: 'Payment amount must be greater than 0' });
    }

    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const currentPaid = Number(bill.amountPaid || 0);
    const currentRemaining = Number(bill.remainingAmount || 0);

    const newAmountPaid = currentPaid + paidNow;
    const newRemaining = currentRemaining - paidNow;

    bill.amountPaid = newAmountPaid;
    bill.remainingAmount = newRemaining < 0 ? 0 : newRemaining;

    await bill.save();

    // Create an income record for this payment if customer info is available
    if (bill.customer && bill.customer.name) {
      try {
        const income = new Income({
          type: 'cash',
          expectedAmount: 0,
          amount: paidNow,
          from: bill.customer.name,
          date: new Date(),
          createdBy: req.user.id,
        });
        await income.save();
      } catch (incomeError) {
        console.error('Error creating income for bill payment:', incomeError);
        // Do not fail the whole request if income creation fails
      }
    }

    const populatedBill = await Bill.findById(bill._id)
      .populate('createdBy', 'username email')
      .populate('items.productId', 'name model category');

    res.json(populatedBill);
  } catch (error) {
    console.error('Error adding bill payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
