import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';

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
    // Prevent accidental persistence of unsupported top-level fields
    if (Object.prototype.hasOwnProperty.call(req.body, 'productId')) {
      delete customer.productId;
    }

    // If a product is provided, attempt to resolve it to a Product and
    // store structured info on the customer (productInfo) before saving.
    // Prefer productId when provided; fall back to product name.
    if (req.body?.productId || customer.product) {
      try {
        let productDoc = null;

        if (req.body?.productId) {
          productDoc = await Product.findById(req.body.productId);
        }

        if (!productDoc && customer.product) {
          productDoc = await Product.findOne({ name: customer.product });
          if (!productDoc) {
            const escaped = String(customer.product).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            productDoc = await Product.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
          }
        }

        if (productDoc) {
          customer.productInfo = {
            productId: productDoc._id,
            name: productDoc.name,
            model: productDoc.model,
          };

          // Normalize stored product name
          customer.product = productDoc.name;
        }
      } catch (lookupError) {
        console.error('Error resolving product for customer.product:', lookupError);
      }
    }

    const newCustomer = await customer.save();

    // If this is a new online customer with a product, also decrement matching product stock by 1.
    // Prefer the structured productInfo.productId if available; otherwise
    // fall back to matching by product name string. Only log errors so
    // stock issues do not block customer creation.
    if (newCustomer.type === 'online' && newCustomer.product) {
      try {
        let productDoc = null;

        // Prefer lookup by productInfo.productId when present
        if (newCustomer.productInfo?.productId) {
          productDoc = await Product.findById(newCustomer.productInfo.productId);
        }

        // Fallback: find by name string
        if (!productDoc) {
          productDoc = await Product.findOne({ name: newCustomer.product });
        }

        if (productDoc) {
          const quantityToDeduct = 1;

          const updatedProduct = await Product.findOneAndUpdate(
            { _id: productDoc._id, stock: { $gte: quantityToDeduct } },
            { $inc: { stock: -quantityToDeduct } },
            { new: true }
          );

          if (!updatedProduct) {
            console.warn(
              `Could not decrement stock for product ${productDoc._id}: not enough stock.`
            );
          }
        } else {
          console.warn(
            `No Product document found matching customer.product="${newCustomer.product}"`
          );
        }
      } catch (stockError) {
        console.error('Error updating product stock for online customer:', stockError);
      }
    }

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
    const existingCustomer = await Customer.findById(req.params.id);
    if (!existingCustomer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // Preserve previous state before applying updates
    const prevType = existingCustomer.type;
    const prevProduct = existingCustomer.product;
    const prevProductInfo = existingCustomer.productInfo
      ? { ...((existingCustomer.productInfo.toObject?.() || existingCustomer.productInfo)) }
      : undefined;

    const incomingProductId = Object.prototype.hasOwnProperty.call(req.body, 'productId')
      ? req.body.productId
      : undefined;

    // Prevent accidental persistence of unsupported top-level fields
    if (Object.prototype.hasOwnProperty.call(req.body, 'productId')) {
      delete req.body.productId;
    }

    // productId takes precedence over product name.
    // This ensures stable association even if product names/models change.
    if (incomingProductId !== undefined) {
      if (!incomingProductId) {
        existingCustomer.product = '';
        existingCustomer.productInfo = undefined;
      } else {
        try {
          const productDoc = await Product.findById(incomingProductId);
          if (productDoc) {
            existingCustomer.productInfo = {
              productId: productDoc._id,
              name: productDoc.name,
              model: productDoc.model,
            };
            existingCustomer.product = productDoc.name;
          }
        } catch (lookupError) {
          console.error('Error resolving product by productId for customer update:', lookupError);
        }
      }
    }

    // If a product string is provided in the update:
    // - when non-empty, resolve it to a Product and update structured productInfo.
    // - when empty string or null, clear product and productInfo.
    if (Object.prototype.hasOwnProperty.call(req.body, 'product')) {
      const incomingProduct = req.body.product;

      if (!incomingProduct) {
        // Explicitly clearing product
        existingCustomer.product = '';
        existingCustomer.productInfo = undefined;
      } else {
        try {
          const productDoc = await Product.findOne({ name: incomingProduct });
          if (productDoc) {
            existingCustomer.productInfo = {
              productId: productDoc._id,
              name: productDoc.name,
              model: productDoc.model,
            };
            existingCustomer.product = productDoc.name;
          } else {
            const escaped = String(incomingProduct).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const productDocCI = await Product.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
            if (productDocCI) {
              existingCustomer.productInfo = {
                productId: productDocCI._id,
                name: productDocCI.name,
                model: productDocCI.model,
              };
              existingCustomer.product = productDocCI.name;
            } else {
              // If we can't resolve it, still store the string and clear structured info
              existingCustomer.product = incomingProduct;
              existingCustomer.productInfo = undefined;
            }
          }
        } catch (lookupError) {
          console.error('Error resolving product for customer update:', lookupError);
        }
      }
    }

    // Apply remaining updates on the existing instance so we can compare before/after
    Object.assign(existingCustomer, req.body);

    // After applying body updates, if the customer still has a product name but
    // productInfo is missing or out of date, refresh it from the current Product
    // document. This keeps model/name in sync with the Products collection even
    // when only non-product fields (e.g. price) are edited.
    if (existingCustomer.product) {
      try {
        let productDoc = null;

        if (existingCustomer.productInfo?.productId) {
          productDoc = await Product.findById(existingCustomer.productInfo.productId);
        }

        if (!productDoc) {
          productDoc = await Product.findOne({ name: existingCustomer.product });
        }

        if (!productDoc) {
          const escaped = String(existingCustomer.product).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          productDoc = await Product.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
        }

        if (productDoc) {
          existingCustomer.productInfo = {
            productId: productDoc._id,
            name: productDoc.name,
            model: productDoc.model,
          };
          // Normalize stored product name
          existingCustomer.product = productDoc.name;
        }
      } catch (lookupError) {
        console.error('Error refreshing productInfo during customer update:', lookupError);
      }
    }

    const updatedCustomer = await existingCustomer.save();

    // Decide stock adjustments based on before/after states
    const prevOnlineWithProduct = prevType === 'online' && !!prevProduct;
    const newOnlineWithProduct =
      updatedCustomer.type === 'online' && !!updatedCustomer.product;

    // Helper to resolve a product from a snapshot (type + productInfo + product string)
    const resolveProductFromSnapshot = async (type, productInfo, productStr) => {
      if (type !== 'online' || !productStr) return null;

      if (productInfo?.productId) {
        const byId = await Product.findById(productInfo.productId);
        if (byId) return byId;
      }
      return Product.findOne({ name: productStr });
    };

    try {
      const prevProductDoc = prevOnlineWithProduct
        ? await resolveProductFromSnapshot(prevType, prevProductInfo, prevProduct)
        : null;
      const newProductDoc = newOnlineWithProduct
        ? await resolveProductFromSnapshot(
            updatedCustomer.type,
            updatedCustomer.productInfo,
            updatedCustomer.product
          )
        : null;

      // Case 1: previously no product, now has product -> decrement new product stock
      if (!prevOnlineWithProduct && newOnlineWithProduct && newProductDoc) {
        const quantity = 1;
        const updated = await Product.findOneAndUpdate(
          { _id: newProductDoc._id, stock: { $gte: quantity } },
          { $inc: { stock: -quantity } },
          { new: true }
        );
        if (!updated) {
          console.warn(
            `Could not decrement stock for product ${newProductDoc._id} on customer update: not enough stock.`
          );
        }
      }

      // Case 2: previously had product, now none -> increment previous product stock
      if (prevOnlineWithProduct && !newOnlineWithProduct && prevProductDoc) {
        const quantity = 1;
        await Product.findByIdAndUpdate(prevProductDoc._id, {
          $inc: { stock: quantity },
        });
      }

      // Case 3: had product A, now has product B
      if (prevOnlineWithProduct && newOnlineWithProduct && prevProductDoc && newProductDoc) {
        const sameProduct = String(prevProductDoc._id) === String(newProductDoc._id);
        if (!sameProduct) {
          const quantity = 1;
          // Return stock to previous product
          await Product.findByIdAndUpdate(prevProductDoc._id, {
            $inc: { stock: quantity },
          });

          // Deduct stock from new product
          const updated = await Product.findOneAndUpdate(
            { _id: newProductDoc._id, stock: { $gte: quantity } },
            { $inc: { stock: -quantity } },
            { new: true }
          );
          if (!updated) {
            console.warn(
              `Could not decrement stock for new product ${newProductDoc._id} on customer update: not enough stock.`
            );
          }
        }
      }
    } catch (stockError) {
      console.error('Error adjusting product stock for online customer (update):', stockError);
    }

    res.json(updatedCustomer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete customer
export const deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    // If this was an online customer with an associated product, return 1 unit
    // of stock to that product before deleting the customer.
    if (customer.type === 'online' && customer.product) {
      try {
        let productDoc = null;

        if (customer.productInfo?.productId) {
          productDoc = await Product.findById(customer.productInfo.productId);
        }

        if (!productDoc) {
          productDoc = await Product.findOne({ name: customer.product });
        }

        if (productDoc) {
          await Product.findByIdAndUpdate(productDoc._id, { $inc: { stock: 1 } });
        }
      } catch (stockError) {
        console.error('Error restoring product stock when deleting customer:', stockError);
        // Do not block customer deletion if stock adjustment fails
      }
    }

    await Customer.findByIdAndDelete(req.params.id);
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
