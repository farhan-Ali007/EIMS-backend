import Bill from '../models/Bill.js';
import Income from '../models/Income.js';
import Product from '../models/Product.js';
import Sale from '../models/Sale.js';
import Seller from '../models/Seller.js';
import StockHistory from '../models/StockHistory.js';

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

      if (Number(product.stock || 0) < Number(item.quantity || 0)) {
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
    const decremented = [];
    for (const item of items) {
      const qty = Number(item.quantity || 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const updated = await Product.findOneAndUpdate(
        { _id: item.productId, stock: { $gte: qty } },
        { $inc: { stock: -qty } },
        { new: true }
      );

      if (!updated) {
        for (const d of decremented) {
          try {
            await Product.findByIdAndUpdate(d.productId, { $inc: { stock: d.qty } });
          } catch {
          }
        }
        return res.status(400).json({
          message: `Insufficient stock for ${item.name}-${item.model}. Requested: ${qty}`
        });
      }

      decremented.push({ productId: updated._id, qty });

      const newStock = Number(updated.stock || 0);
      const previousStock = newStock + qty;
      await StockHistory.create({
        productId: updated._id,
        type: 'stock_out',
        quantity: qty,
        previousStock,
        newStock,
        reason: `Bill ${bill.billNumber} created`,
        notes: String(bill._id),
        createdBy: req.user.id,
      });
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
          billId: bill._id,
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
    const { customer, items, subtotal, discount, discountType, total, amountPaid, previousRemaining, paymentMethod, notes, sellerId } = req.body;

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

    // Only completed bills should affect inventory.
    // If a bill is cancelled/pending, its items should be editable without changing Product.stock.
    const productIds = Array.from(new Set([...Object.keys(oldQuantities), ...Object.keys(newQuantities)]));

    if (existingBill.status === 'completed') {
      // Validate stock for new quantities, considering we are reverting old consumption
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
          if (delta > 0) {
            const updated = await Product.findByIdAndUpdate(
              productId,
              { $inc: { stock: delta } },
              { new: true }
            );
            if (updated) {
              const newStock = Number(updated.stock || 0);
              const previousStock = newStock - delta;
              await StockHistory.create({
                productId: updated._id,
                type: 'stock_in',
                quantity: delta,
                previousStock,
                newStock,
                reason: `Bill ${existingBill.billNumber} updated`,
                notes: String(existingBill._id),
                createdBy: req.user.id,
              });
            }
          } else {
            const qty = Math.abs(delta);
            const updated = await Product.findOneAndUpdate(
              { _id: productId, stock: { $gte: qty } },
              { $inc: { stock: -qty } },
              { new: true }
            );
            if (!updated) {
              return res.status(400).json({ message: 'INSUFFICIENT_STOCK' });
            }
            const newStock = Number(updated.stock || 0);
            const previousStock = newStock + qty;
            await StockHistory.create({
              productId: updated._id,
              type: 'stock_out',
              quantity: qty,
              previousStock,
              newStock,
              reason: `Bill ${existingBill.billNumber} updated`,
              notes: String(existingBill._id),
              createdBy: req.user.id,
            });
          }
        }
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

    // Get old commission from existing sales records before deleting them
    const oldSellerCommissionChanges = {};
    const oldSalesRecords = await Sale.find({ billId: existingBill._id });
    
    for (const sale of oldSalesRecords) {
      const sellerIdStr = String(sale.sellerId);
      oldSellerCommissionChanges[sellerIdStr] = (oldSellerCommissionChanges[sellerIdStr] || 0) + Number(sale.commission || 0);
    }

    // Update Sales records: delete old ones for this bill, create new ones
    // This prevents commission duplication and ensures commission matches current bill items
    await Sale.deleteMany({ billId: existingBill._id });

    // Calculate commission changes for each seller
    const sellerCommissionChanges = {};

    if (embeddedCustomer && items && items.length > 0) {
      // Get seller info once (like in createBill)
      const seller = await Seller.findById(sellerId);
      if (seller) {
        // Prepare sales records for new items and calculate new commissions
        const salesPromises = items.map(async (item) => {
          const product = await Product.findById(item.productId);
          if (!product) return null;

          const quantityNum = Number(item.quantity || 0);
          const unitPrice = Number(item.selectedPrice || 0);
          const lineTotal = quantityNum * unitPrice;
          const perUnitCommission = Number(seller.commissionRate || 0);
          const lineCommission = perUnitCommission * quantityNum;

          // Track commission changes per seller
          const sellerIdStr = String(seller._id);
          sellerCommissionChanges[sellerIdStr] = (sellerCommissionChanges[sellerIdStr] || 0) + lineCommission;

          return {
            billId: existingBill._id,
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
        });

        const resolvedSales = await Promise.all(salesPromises);
        const filteredSales = resolvedSales.filter(sale => sale && sale.quantity > 0 && sale.unitPrice >= 0);

        if (filteredSales.length > 0) {
          await Sale.insertMany(filteredSales);
        }
      }
    }

    // Update seller commissions based on the difference
    const allSellerIds = new Set([
      ...Object.keys(sellerCommissionChanges),
      ...Object.keys(oldSellerCommissionChanges)
    ]);

    for (const sellerIdStr of allSellerIds) {
      const newCommission = sellerCommissionChanges[sellerIdStr] || 0;
      const oldCommission = oldSellerCommissionChanges[sellerIdStr] || 0;
      const commissionDiff = newCommission - oldCommission;

      if (commissionDiff !== 0) {
        const seller = await Seller.findById(sellerIdStr);
        if (seller) {
          seller.commission = Number(seller.commission || 0) + commissionDiff;
          seller.totalCommission = Number(seller.totalCommission || 0) + commissionDiff;
          await seller.save();
        }
      }
    }

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

    const bill = await Bill.findById(req.params.id);
    if (!bill) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const fromStatus = bill.status;
    const toStatus = status;

    if (fromStatus === toStatus) {
      const populated = await Bill.findById(bill._id)
        .populate('createdBy', 'username email')
        .populate('items.productId', 'name model category');
      return res.json(populated);
    }

    // Inventory rules:
    // - completed => stock should be deducted
    // - cancelled/pending => stock should NOT be deducted
    const leavingCompleted = fromStatus === 'completed' && toStatus !== 'completed';
    const enteringCompleted = fromStatus !== 'completed' && toStatus === 'completed';

    if (leavingCompleted) {
      // Restore stock for all items
      for (const item of bill.items) {
        const qty = Number(item.quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const updated = await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: qty } },
          { new: true }
        );

        if (updated) {
          const newStock = Number(updated.stock || 0);
          const previousStock = newStock - qty;
          await StockHistory.create({
            productId: updated._id,
            type: 'stock_in',
            quantity: qty,
            previousStock,
            newStock,
            reason: `Bill ${bill.billNumber} status ${fromStatus} -> ${toStatus}`,
            notes: String(bill._id),
            createdBy: req.user.id,
          });
        }
      }
    }

    if (enteringCompleted) {
      // Deduct stock for all items (atomic per item with rollback)
      const decremented = [];
      for (const item of bill.items) {
        const qty = Number(item.quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const updated = await Product.findOneAndUpdate(
          { _id: item.productId, stock: { $gte: qty } },
          { $inc: { stock: -qty } },
          { new: true }
        );

        if (!updated) {
          for (const d of decremented) {
            try {
              await Product.findByIdAndUpdate(d.productId, { $inc: { stock: d.qty } });
            } catch {
            }
          }
          return res.status(400).json({ message: 'INSUFFICIENT_STOCK' });
        }

        decremented.push({ productId: updated._id, qty });

        const newStock = Number(updated.stock || 0);
        const previousStock = newStock + qty;
        await StockHistory.create({
          productId: updated._id,
          type: 'stock_out',
          quantity: qty,
          previousStock,
          newStock,
          reason: `Bill ${bill.billNumber} status ${fromStatus} -> ${toStatus}`,
          notes: String(bill._id),
          createdBy: req.user.id,
        });
      }
    }

    bill.status = toStatus;
    await bill.save();

    const populated = await Bill.findById(bill._id)
      .populate('createdBy', 'username email')
      .populate('items.productId', 'name model category');

    res.json(populated);
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
        const qty = Number(item.quantity || 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;
        const updated = await Product.findByIdAndUpdate(
          item.productId,
          { $inc: { stock: qty } },
          { new: true }
        );
        if (updated) {
          const newStock = Number(updated.stock || 0);
          const previousStock = newStock - qty;
          await StockHistory.create({
            productId: updated._id,
            type: 'stock_in',
            quantity: qty,
            previousStock,
            newStock,
            reason: `Bill ${bill.billNumber} cancelled`,
            notes: String(bill._id),
            createdBy: req.user.id,
          });
        }
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

export const getBillStockMovements = async (req, res) => {
  try {
    const billId = String(req.params.id || '').trim();
    if (!billId) {
      return res.status(400).json({ message: 'Bill id is required' });
    }

    const movements = await StockHistory.aggregate([
      { $match: { notes: billId } },
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: { productId: '$productId', type: '$type' },
          totalQty: { $sum: '$quantity' },
          firstAt: { $first: '$createdAt' },
          lastAt: { $last: '$createdAt' },
        },
      },
      {
        $group: {
          _id: '$_id.productId',
          stockIn: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'stock_in'] }, '$totalQty', 0],
            },
          },
          stockOut: {
            $sum: {
              $cond: [{ $eq: ['$_id.type', 'stock_out'] }, '$totalQty', 0],
            },
          },
          firstAt: { $min: '$firstAt' },
          lastAt: { $max: '$lastAt' },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          productId: '$_id',
          stockIn: 1,
          stockOut: 1,
          net: { $subtract: ['$stockIn', '$stockOut'] },
          firstAt: 1,
          lastAt: 1,
          product: {
            _id: '$product._id',
            name: '$product.name',
            model: '$product.model',
            category: '$product.category',
          },
        },
      },
      { $sort: { net: -1 } },
    ]);

    const totals = movements.reduce(
      (acc, m) => {
        acc.stockIn += Number(m.stockIn || 0);
        acc.stockOut += Number(m.stockOut || 0);
        acc.net += Number(m.net || 0);
        return acc;
      },
      { stockIn: 0, stockOut: 0, net: 0 }
    );

    return res.json({ billId, totals, movements });
  } catch (error) {
    console.error('Error fetching bill stock movements:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
