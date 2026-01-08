import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import Seller from '../models/Seller.js';
import Product from '../models/Product.js';

const toObjectIdString = (v) => (v == null ? '' : String(v));

const normalizeIncomingProductsInfo = (productsInfo) => {
  if (!Array.isArray(productsInfo)) return undefined;
  const cleaned = productsInfo
    .map((item) => {
      const productId = item?.productId ? String(item.productId) : '';
      const quantity = Number(item?.quantity);
      return {
        productId,
        quantity: Number.isFinite(quantity) ? quantity : 1,
      };
    })
    .filter((x) => x.productId && x.quantity > 0);

  if (cleaned.length === 0) return [];

  const byId = new Map();
  for (const item of cleaned) {
    const key = String(item.productId);
    const prev = byId.get(key);
    byId.set(key, {
      productId: key,
      quantity: (prev?.quantity || 0) + item.quantity,
    });
  }

  return Array.from(byId.values());
};

const snapshotCustomerProducts = (customer) => {
  const list = Array.isArray(customer?.productsInfo) ? customer.productsInfo : undefined;
  if (list && list.length > 0) {
    return list
      .map((x) => ({
        productId: x?.productId ? String(x.productId) : '',
        name: x?.name,
        model: x?.model,
        quantity: Number(x?.quantity || 1),
      }))
      .filter((x) => x.productId && x.quantity > 0);
  }

  if (customer?.productInfo?.productId) {
    return [
      {
        productId: String(customer.productInfo.productId),
        name: customer.productInfo?.name,
        model: customer.productInfo?.model,
        quantity: 1,
      },
    ];
  }

  return [];
};

const resolveProductsInfoDocs = async (incomingList) => {
  const normalized = normalizeIncomingProductsInfo(incomingList);
  if (normalized === undefined) return { normalized: undefined, resolved: [] };
  if (normalized.length === 0) return { normalized: [], resolved: [] };

  const ids = normalized.map((x) => x.productId);
  const productDocs = await Product.find({ _id: { $in: ids } });
  const map = new Map(productDocs.map((p) => [String(p._id), p]));

  const resolved = normalized.map((x) => {
    const doc = map.get(String(x.productId));
    return {
      productId: x.productId,
      quantity: x.quantity,
      doc,
    };
  });

  return { normalized, resolved };
};

const validateStockForResolved = (resolved) => {
  for (const item of resolved) {
    if (!item.doc) {
      return { ok: false, message: 'Product not found' };
    }
    const available = Number(item.doc.stock || 0);
    const requested = Number(item.quantity || 0);
    if (requested < 1 || !Number.isFinite(requested)) {
      return { ok: false, message: 'Invalid quantity. Must be a positive number.' };
    }
    if (available < requested) {
      return {
        ok: false,
        message: `Insufficient stock for ${item.doc.name}. Available: ${available}, Requested: ${requested}`,
      };
    }
  }
  return { ok: true };
};

const applyStockDeltas = async (deltas) => {
  const touched = [];

  try {
    for (const d of deltas) {
      const productId = String(d.productId);
      const delta = Number(d.delta || 0);
      if (!productId || !Number.isFinite(delta) || delta === 0) continue;

      if (delta > 0) {
        const updated = await Product.findOneAndUpdate(
          { _id: productId, stock: { $gte: delta } },
          { $inc: { stock: -delta } },
          { new: true }
        );
        if (!updated) {
          throw new Error('INSUFFICIENT_STOCK');
        }
        touched.push({ productId, delta });
      } else {
        await Product.findByIdAndUpdate(productId, { $inc: { stock: -delta } });
        touched.push({ productId, delta });
      }
    }

    return { ok: true };
  } catch (error) {
    for (const t of touched) {
      try {
        const revert = -Number(t.delta || 0);
        if (revert !== 0) {
          await Product.findByIdAndUpdate(String(t.productId), { $inc: { stock: revert } });
        }
      } catch {
        // ignore
      }
    }

    return { ok: false, error };
  }
};

const reverseCustomerCommissionSales = async ({ customer, sellerId, productsInfo, unitPriceOverride }) => {
  if (!customer?._id) return;
  const customerId = customer._id;

  const productIds = (Array.isArray(productsInfo) ? productsInfo : [])
    .map((p) => (p?.productId ? String(p.productId) : ''))
    .filter(Boolean);

  const baseQuery = {
    customerId,
    ...(sellerId ? { sellerId } : {}),
    ...(productIds.length > 0 ? { productId: { $in: productIds } } : {}),
    $or: [{ isCustomerCommissionSale: true }, { isCustomerCommissionSale: { $exists: false } }],
  };

  const customerUnitPrice = Number(
    unitPriceOverride !== undefined ? unitPriceOverride : (customer?.price || 0)
  );
  const legacyGuard = { unitPrice: customerUnitPrice };
  const hasLegacyGuard = Number.isFinite(customerUnitPrice);

  const sales = await Sale.find({
    ...baseQuery,
    ...(hasLegacyGuard ? legacyGuard : { isCustomerCommissionSale: true }),
  });
  if (!sales || sales.length === 0) return;

  const bySeller = new Map();
  for (const s of sales) {
    const key = String(s.sellerId);
    bySeller.set(key, (bySeller.get(key) || 0) + Number(s.commission || 0));
  }

  for (const [sellerId, totalCommission] of bySeller.entries()) {
    const seller = await Seller.findById(sellerId);
    if (!seller) continue;
    seller.commission = Math.max(0, Number(seller.commission || 0) - Number(totalCommission || 0));
    seller.totalCommission = Math.max(0, Number(seller.totalCommission || 0) - Number(totalCommission || 0));
    await seller.save();
  }

  await Sale.deleteMany({ _id: { $in: sales.map((s) => s._id) } });
};

const applyCustomerCommissionSales = async ({ customer, sellerId, productsInfo }) => {
  if (!sellerId) return;
  if (!Array.isArray(productsInfo) || productsInfo.length === 0) return;

  const seller = await Seller.findById(sellerId);
  if (!seller) return;

  const perUnitCommission = Number(seller.commissionRate || 0);
  const unitPrice = Number(customer?.price || 0);

  let totalCommission = 0;
  const salesToCreate = [];

  for (const item of productsInfo) {
    if (!item?.productId) continue;
    const quantity = Number(item.quantity || 1);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    const commission = perUnitCommission * quantity;
    totalCommission += commission;

    salesToCreate.push({
      productId: item.productId,
      isCustomerCommissionSale: true,
      sellerId: seller._id,
      customerId: customer._id,
      productName: item.name,
      sellerName: seller.name,
      customerName: customer.name,
      quantity,
      unitPrice,
      total: unitPrice * quantity,
      commission,
    });
  }

  if (salesToCreate.length === 0) return;

  seller.commission = Number(seller.commission || 0) + totalCommission;
  seller.totalCommission = Number(seller.totalCommission || 0) + totalCommission;
  await seller.save();

  await Sale.insertMany(salesToCreate);
};

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

      const products = snapshotCustomerProducts(customer);
      const productIds = products.map((p) => p.productId);

      const existingSale = await Sale.findOne({
        sellerId: customer.seller,
        customerId: customer._id,
        productId: { $in: productIds },
        isCustomerCommissionSale: true
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

      const quantity = products.reduce((sum, p) => sum + Number(p.quantity || 0), 0) || 1;
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
  if (Object.prototype.hasOwnProperty.call(req.body, 'customDate')) {
    if (!req.body.customDate) {
      delete req.body.customDate;
    } else {
      const parsed = new Date(req.body.customDate);
      if (Number.isNaN(parsed.getTime())) {
        delete req.body.customDate;
      }
    }
  }

  const customer = new Customer(req.body);
  try {
    // Prevent accidental persistence of unsupported top-level fields
    if (Object.prototype.hasOwnProperty.call(req.body, 'productId')) {
      delete customer.productId;
    }

    const { normalized: incomingProductsInfo, resolved } = await resolveProductsInfoDocs(req.body?.productsInfo);
    let appliedStockDeltas = null;

    if (incomingProductsInfo !== undefined) {
      if (incomingProductsInfo.length > 0) {
        const stockOk = validateStockForResolved(resolved);
        if (!stockOk.ok) {
          return res.status(400).json({ message: stockOk.message });
        }

        const stockApplied = await applyStockDeltas(
          resolved.map((x) => ({ productId: x.productId, delta: Number(x.quantity || 0) }))
        );

        if (!stockApplied.ok) {
          const msg =
            stockApplied.error?.message === 'INSUFFICIENT_STOCK'
              ? 'Insufficient stock'
              : 'Failed to update product stock';
          return res.status(400).json({ message: msg });
        }

        appliedStockDeltas = resolved.map((x) => ({ productId: x.productId, delta: Number(x.quantity || 0) }));

        customer.productsInfo = resolved.map((x) => ({
          productId: x.doc._id,
          name: x.doc.name,
          model: x.doc.model,
          quantity: Number(x.quantity || 1),
        }));

        const primary = customer.productsInfo[0];
        customer.productInfo = primary
          ? { productId: primary.productId, name: primary.name, model: primary.model }
          : undefined;
        customer.product = primary?.name || '';
      } else {
        customer.productsInfo = [];
        customer.productInfo = undefined;
        customer.product = '';
      }
    }

    // If a product is provided, attempt to resolve it to a Product and
    // store structured info on the customer (productInfo) before saving.
    // Prefer productId when provided; fall back to product name.
    if (incomingProductsInfo === undefined && (req.body?.productId || customer.product)) {
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

          customer.productsInfo = [
            {
              productId: productDoc._id,
              name: productDoc.name,
              model: productDoc.model,
              quantity: 1,
            },
          ];
        }
      } catch (lookupError) {
        console.error('Error resolving product for customer.product:', lookupError);
      }
    }

    if (incomingProductsInfo === undefined && customer.productsInfo?.length > 0) {
      const resolvedForSingle = await resolveProductsInfoDocs(customer.productsInfo);
      const stockOk = validateStockForResolved(resolvedForSingle.resolved);
      if (!stockOk.ok) {
        return res.status(400).json({ message: stockOk.message });
      }

      const stockApplied = await applyStockDeltas(
        resolvedForSingle.resolved.map((x) => ({ productId: x.productId, delta: Number(x.quantity || 0) }))
      );

      if (!stockApplied.ok) {
        const msg =
          stockApplied.error?.message === 'INSUFFICIENT_STOCK'
            ? 'Insufficient stock'
            : 'Failed to update product stock';
        return res.status(400).json({ message: msg });
      }

      appliedStockDeltas = resolvedForSingle.resolved.map((x) => ({
        productId: x.productId,
        delta: Number(x.quantity || 0),
      }));
    }

    let newCustomer;
    try {
      newCustomer = await customer.save();
    } catch (saveError) {
      if (Array.isArray(appliedStockDeltas) && appliedStockDeltas.length > 0) {
        try {
          await applyStockDeltas(appliedStockDeltas.map((d) => ({ productId: d.productId, delta: -Number(d.delta || 0) })));
        } catch {
          // ignore
        }
      }
      throw saveError;
    }

    try {
      await applyCustomerCommissionSales({
        customer: newCustomer,
        sellerId: newCustomer.seller,
        productsInfo: snapshotCustomerProducts(newCustomer),
      });
    } catch (commissionError) {
      console.error('Error adding commission for customer:', commissionError);
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

    if (Object.prototype.hasOwnProperty.call(req.body, 'productsInfo')) {
      const prevProducts = snapshotCustomerProducts(existingCustomer);
      const prevSellerId = existingCustomer.seller ? String(existingCustomer.seller) : undefined;
      const prevPrice = existingCustomer.price;

      const { normalized: incomingProductsInfo, resolved } = await resolveProductsInfoDocs(req.body?.productsInfo);
      if (incomingProductsInfo === undefined) {
        return res.status(400).json({ message: 'Invalid productsInfo' });
      }

      for (const x of resolved) {
        const qty = Number(x.quantity || 0);
        if (!Number.isFinite(qty) || qty < 1) {
          return res.status(400).json({ message: 'Quantity must be at least 1' });
        }
      }

      const incomingSellerId = Object.prototype.hasOwnProperty.call(req.body, 'seller')
        ? req.body.seller
        : existingCustomer.seller;
      const newSellerId = incomingSellerId ? String(incomingSellerId) : undefined;

      const newProducts = resolved.map((x) => ({
        productId: x.doc._id,
        name: x.doc.name,
        model: x.doc.model,
        quantity: Number(x.quantity || 1),
      }));

      const prevMap = new Map(prevProducts.map((p) => [String(p.productId), Number(p.quantity || 0)]));
      const nextMap = new Map(newProducts.map((p) => [String(p.productId), Number(p.quantity || 0)]));
      const allIds = new Set([...prevMap.keys(), ...nextMap.keys()]);

      const deltas = Array.from(allIds).map((id) => ({
        productId: id,
        delta: Math.max(0, Number(nextMap.get(id) || 0) - Number(prevMap.get(id) || 0)),
      }));

      for (const d of deltas) {
        if (d.delta > 0) {
          const doc = await Product.findById(d.productId);
          const available = Number(doc?.stock || 0);
          if (!doc || available < d.delta) {
            return res.status(400).json({
              message: `Insufficient stock for ${doc?.name || 'product'}. Available: ${available}, Requested: ${d.delta}`,
            });
          }
        }
      }

      const stockPlan = Array.from(allIds)
        .map((id) => ({
          productId: id,
          delta: Number(nextMap.get(id) || 0) - Number(prevMap.get(id) || 0),
        }))
        .filter((x) => x.delta !== 0);

      const stockApplied = await applyStockDeltas(
        stockPlan.map((x) => ({ productId: x.productId, delta: x.delta }))
      );

      if (!stockApplied.ok) {
        const msg =
          stockApplied.error?.message === 'INSUFFICIENT_STOCK'
            ? 'Insufficient stock'
            : 'Failed to update product stock';
        return res.status(400).json({ message: msg });
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'customDate')) {
        if (!req.body.customDate) {
          existingCustomer.customDate = undefined;
        } else {
          const parsed = new Date(req.body.customDate);
          if (!Number.isNaN(parsed.getTime())) {
            existingCustomer.customDate = parsed;
          }
        }
        delete req.body.customDate;
      }

      const body = { ...req.body };
      delete body.productsInfo;
      delete body.product;
      delete body.productId;

      existingCustomer.productsInfo = newProducts;
      const primary = newProducts[0];
      existingCustomer.productInfo = primary
        ? { productId: primary.productId, name: primary.name, model: primary.model }
        : undefined;
      existingCustomer.product = primary?.name || '';

      Object.assign(existingCustomer, body);

      let updatedCustomer;
      try {
        updatedCustomer = await existingCustomer.save();
      } catch (saveError) {
        try {
          await applyStockDeltas(stockPlan.map((x) => ({ productId: x.productId, delta: -Number(x.delta || 0) })));
        } catch {
          // ignore
        }
        throw saveError;
      }

      try {
        await reverseCustomerCommissionSales({
          customer: updatedCustomer,
          sellerId: prevSellerId,
          productsInfo: prevProducts,
          unitPriceOverride: prevPrice,
        });
        await applyCustomerCommissionSales({
          customer: updatedCustomer,
          sellerId: newSellerId,
          productsInfo: snapshotCustomerProducts(updatedCustomer),
        });
      } catch (commissionError) {
        console.error('Error adjusting seller commission for customer update:', commissionError);
      }

      return res.json(updatedCustomer);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'customDate')) {
      if (!req.body.customDate) {
        existingCustomer.customDate = undefined;
      } else {
        const parsed = new Date(req.body.customDate);
        if (!Number.isNaN(parsed.getTime())) {
          existingCustomer.customDate = parsed;
        }
      }
      delete req.body.customDate;
    }

    // Preserve previous state before applying updates
    const prevType = existingCustomer.type;
    const prevProduct = existingCustomer.product;
    const prevProductInfo = existingCustomer.productInfo
      ? { ...((existingCustomer.productInfo.toObject?.() || existingCustomer.productInfo)) }
      : undefined;
    const prevSellerId = existingCustomer.seller ? String(existingCustomer.seller) : undefined;

    const incomingProductId = Object.prototype.hasOwnProperty.call(req.body, 'productId')
      ? req.body.productId
      : undefined;

    // If productId is provided, treat it as authoritative and do not allow
    // any incoming product name string to override the resolved Product.
    if (incomingProductId !== undefined && Object.prototype.hasOwnProperty.call(req.body, 'product')) {
      delete req.body.product;
    }

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

            // Keep legacy product string in sync for downstream consumers
            req.body.product = productDoc.name;
          }
        } catch (lookupError) {
          console.error('Error resolving product by productId for customer update:', lookupError);
        }
      }
    }

    // If a product string is provided in the update:
    // - when non-empty, resolve it to a Product and update structured productInfo.
    // - when empty string or null, clear product and productInfo.
    if (
      incomingProductId === undefined &&
      Object.prototype.hasOwnProperty.call(req.body, 'product')
    ) {
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
    const prevWithProduct = !!prevProductInfo?.productId || !!prevProduct;
    const newWithProduct = !!updatedCustomer.productInfo?.productId || !!updatedCustomer.product;

    // Helper to resolve a product from a snapshot (productInfo + product string)
    const resolveProductFromSnapshot = async (productInfo, productStr) => {
      if (productInfo?.productId) {
        const byId = await Product.findById(productInfo.productId);
        if (byId) return byId;
      }

      if (!productStr) return null;

      const byName = await Product.findOne({ name: productStr });
      if (byName) return byName;

      const escaped = String(productStr).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return Product.findOne({ name: new RegExp(`^${escaped}$`, 'i') });
    };

    try {
      const prevProductDoc = prevWithProduct
        ? await resolveProductFromSnapshot(prevProductInfo, prevProduct)
        : null;
      const newProductDoc = newWithProduct
        ? await resolveProductFromSnapshot(updatedCustomer.productInfo, updatedCustomer.product)
        : null;

      // Case 1: previously no product, now has product -> decrement new product stock
      if (!prevWithProduct && newWithProduct && newProductDoc) {
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
      if (prevWithProduct && !newWithProduct && prevProductDoc) {
        const quantity = 1;
        await Product.findByIdAndUpdate(prevProductDoc._id, {
          $inc: { stock: quantity },
        });
      }

      // Case 3: had product A, now has product B
      if (prevWithProduct && newWithProduct && prevProductDoc && newProductDoc) {
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

    // Commission adjustments (applies to both online and offline)
    // Rules:
    // - If seller+product removed => reverse previous commission + delete Sale.
    // - If seller+product added => apply commission + create Sale.
    // - If seller or product changed => reverse previous, apply new.
    try {
      const newSellerId = updatedCustomer.seller ? String(updatedCustomer.seller) : undefined;
      const prevHasCommissionable = !!prevSellerId && prevWithProduct;
      const newHasCommissionable = !!newSellerId && newWithProduct;

      const findExistingSale = async (sellerId, productInfo, productStr) => {
        if (!sellerId) return null;
        const baseQuery = { sellerId, customerId: updatedCustomer._id };

        if (productInfo?.productId) {
          const byPid = await Sale.findOne({ ...baseQuery, productId: productInfo.productId });
          if (byPid) return byPid;
        }

        if (productStr) {
          const byName = await Sale.findOne({ ...baseQuery, productName: productStr });
          if (byName) return byName;
          const escaped = String(productStr).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return Sale.findOne({ ...baseQuery, productName: new RegExp(`^${escaped}$`, 'i') });
        }

        return null;
      };

      const adjustSellerCommission = async (sellerId, delta) => {
        const seller = await Seller.findById(sellerId);
        if (!seller) return;

        const nextCommission = Number(seller.commission || 0) + Number(delta || 0);
        const nextTotalCommission = Number(seller.totalCommission || 0) + Number(delta || 0);

        seller.commission = Math.max(0, nextCommission);
        seller.totalCommission = Math.max(0, nextTotalCommission);
        await seller.save();
      };

      const applyCommission = async () => {
        const seller = await Seller.findById(newSellerId);
        if (!seller) return;

        const quantity = 1;
        const perUnitCommission = Number(seller.commissionRate || 0);
        const commission = perUnitCommission * quantity;
        await adjustSellerCommission(seller._id, commission);

        const unitPrice = Number(updatedCustomer.price || 0);
        const total = unitPrice * quantity;

        await Sale.create({
          productId: updatedCustomer.productInfo?.productId,
          sellerId: seller._id,
          customerId: updatedCustomer._id,
          productName: updatedCustomer.product,
          sellerName: seller.name,
          customerName: updatedCustomer.name,
          quantity,
          unitPrice,
          total,
          commission
        });
      };

      const reverseCommission = async () => {
        const existingSale = await findExistingSale(prevSellerId, prevProductInfo, prevProduct);
        if (!existingSale) return;
        await adjustSellerCommission(prevSellerId, -Number(existingSale.commission || 0));
        await Sale.findByIdAndDelete(existingSale._id);
      };

      if (!prevHasCommissionable && newHasCommissionable) {
        await applyCommission();
      }

      if (prevHasCommissionable && !newHasCommissionable) {
        await reverseCommission();
      }

      if (prevHasCommissionable && newHasCommissionable) {
        const prevProdKey = prevProductInfo?.productId ? String(prevProductInfo.productId) : String(prevProduct || '');
        const newProdKey = updatedCustomer.productInfo?.productId
          ? String(updatedCustomer.productInfo.productId)
          : String(updatedCustomer.product || '');

        const changed = prevSellerId !== newSellerId || prevProdKey !== newProdKey;
        if (changed) {
          await reverseCommission();
          await applyCommission();
        }
      }
    } catch (commissionError) {
      console.error('Error adjusting seller commission for customer update:', commissionError);
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

    const products = snapshotCustomerProducts(customer);
    if (products.length > 0) {
      try {
        for (const item of products) {
          const qty = Number(item.quantity || 0);
          if (item.productId && qty > 0) {
            await Product.findByIdAndUpdate(String(item.productId), { $inc: { stock: qty } });
          }
        }
      } catch (stockError) {
        console.error('Error restoring product stock when deleting customer:', stockError);
      }
    }

    try {
      await reverseCustomerCommissionSales({
        customer,
        sellerId: customer.seller,
        productsInfo: products,
        unitPriceOverride: customer.price,
      });
    } catch (commissionError) {
      console.error('Error reversing seller commission when deleting customer:', commissionError);
    }

    await Customer.findByIdAndDelete(req.params.id);
    return res.json({ message: 'Customer deleted' });
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

      const products = snapshotCustomerProducts(customer);
      const productIds = products.map((p) => p.productId);

      // Check if a Sale already exists for this combination
      const existingSale = await Sale.findOne({
        sellerId: customer.seller,
        customerId: customer._id,
        productId: { $in: productIds },
        isCustomerCommissionSale: true
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

      await applyCustomerCommissionSales({
        customer,
        sellerId: seller._id,
        productsInfo: products,
      });

      created += 1;
      totalCommissionAdded += Number(seller.commissionRate || 0) * (products.reduce((sum, p) => sum + Number(p.quantity || 0), 0) || 1);
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
