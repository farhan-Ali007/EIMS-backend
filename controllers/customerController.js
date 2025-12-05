import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import Seller from '../models/Seller.js';

// Get all customers
export const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find()
      .populate('seller', 'name')
      .sort({ createdAt: -1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Preview mode for online customer commission backfill (no DB writes)
// Returns what would be processed/created/skipped and total commission added
// if backfillOnlineCustomerCommissions were to run.
export const previewOnlineCustomerCommissions = async (req, res) => {
  try {
    const customers = await Customer.find({
      type: 'online',
      product: { $exists: true, $ne: null, $ne: '' },
      seller: { $exists: true, $ne: null }
    });

    let processed = 0;
    let wouldCreate = 0;
    let skipped = 0;
    let totalCommissionAdded = 0;
    const perSeller = {};

    for (const customer of customers) {
      processed += 1;

      const existingSale = await Sale.findOne({
        sellerId: customer.seller,
        customerId: customer._id,
        productName: customer.product
      });

      if (existingSale) {
        skipped += 1;
        continue;
      }

      const seller = await Seller.findById(customer.seller);
      if (!seller) {
        skipped += 1;
        continue;
      }

      const quantity = 1;
      const perUnitCommission = Number(seller.commissionRate || 0);
      const commission = perUnitCommission * quantity;

      wouldCreate += 1;
      totalCommissionAdded += commission;

      const key = String(seller._id);
      if (!perSeller[key]) {
        perSeller[key] = {
          sellerId: seller._id,
          sellerName: seller.name,
          customers: 0,
          commissionToAdd: 0
        };
      }
      perSeller[key].customers += 1;
      perSeller[key].commissionToAdd += commission;
    }

    res.json({
      message: 'Preview completed',
      processed,
      wouldCreate,
      skipped,
      totalCommissionAdded,
      perSeller: Object.values(perSeller)
    });
  } catch (error) {
    console.error('Error during online customer commission preview:', error);
    res.status(500).json({ message: 'Failed to preview online customer commissions' });
  }
};

// Get single customer with purchase historys
export const getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    const purchases = await Sale.find({ customerId: req.params.id })
      .populate('productId sellerId')
      .sort({ createdAt: -1 });

    res.json({ customer, purchases });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create customer
export const createCustomer = async (req, res) => {
  const customer = new Customer(req.body);
  try {
    const newCustomer = await customer.save();

    // If this is a new online customer with a product and a referred seller,
    // add commission for the seller (quantity assumed as 1) and create a commission history entry.
    if (newCustomer.type === 'online' && newCustomer.product && newCustomer.seller) {
      try {
        const seller = await Seller.findById(newCustomer.seller);

        if (seller) {
          const quantity = 1;
          const perUnitCommission = Number(seller.commissionRate || 0);
          const commission = perUnitCommission * quantity;

          // Update seller commission totals
          seller.commission = Number(seller.commission || 0) + commission;
          seller.totalCommission = Number(seller.totalCommission || 0) + commission;
          await seller.save();

          // Record commission history using Sale model
          const unitPrice = Number(newCustomer.price || 0);
          const total = unitPrice * quantity;

          await Sale.create({
            // productId is optional here because Customer.product is a free-text field
            sellerId: seller._id,
            customerId: newCustomer._id,
            productName: newCustomer.product,
            sellerName: seller.name,
            customerName: newCustomer.name,
            quantity,
            unitPrice,
            total,
            commission
          });
        }
      } catch (commissionError) {
        // Do not block customer creation if commission logic fails
        console.error('Error adding commission for online customer:', commissionError);
      }
    }

    res.status(201).json(newCustomer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update customer
export const updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json(customer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete customer
export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// One-time backfill for online customers to add missing commission & Sale history
// For each online customer with product+seller, if there is no existing Sale record
// for that (seller, customer, productName), add commission and create a Sale.
export const backfillOnlineCustomerCommissions = async (req, res) => {
  try {
    const customers = await Customer.find({
      type: 'online',
      product: { $exists: true, $ne: null, $ne: '' },
      seller: { $exists: true, $ne: null }
    });

    let processed = 0;
    let created = 0;
    let skipped = 0;
    let totalCommissionAdded = 0;

    for (const customer of customers) {
      processed += 1;

      // Check if a Sale already exists for this combination
      const existingSale = await Sale.findOne({
        sellerId: customer.seller,
        customerId: customer._id,
        productName: customer.product
      });

      if (existingSale) {
        skipped += 1;
        continue;
      }

      const seller = await Seller.findById(customer.seller);
      if (!seller) {
        skipped += 1;
        continue;
      }

      const quantity = 1;
      const perUnitCommission = Number(seller.commissionRate || 0);
      const commission = perUnitCommission * quantity;

      // Update seller commission totals
      seller.commission = Number(seller.commission || 0) + commission;
      seller.totalCommission = Number(seller.totalCommission || 0) + commission;
      await seller.save();

      // Record commission history using Sale model
      const unitPrice = Number(customer.price || 0);
      const total = unitPrice * quantity;

      await Sale.create({
        sellerId: seller._id,
        customerId: customer._id,
        productName: customer.product,
        sellerName: seller.name,
        customerName: customer.name,
        quantity,
        unitPrice,
        total,
        commission
      });

      created += 1;
      totalCommissionAdded += commission;
    }

    res.json({
      message: 'Backfill completed',
      processed,
      created,
      skipped,
      totalCommissionAdded
    });
  } catch (error) {
    console.error('Error during online customer commission backfill:', error);
    res.status(500).json({ message: 'Failed to backfill online customer commissions' });
  }
};
