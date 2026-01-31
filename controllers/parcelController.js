import Parcel from '../models/Parcel.js';
import Product from '../models/Product.js';

const normalizeParcelProducts = ({ productId, productsInfo }) => {
  if (Array.isArray(productsInfo) && productsInfo.length > 0) {
    return productsInfo
      .map((x) => ({
        productId: x?.productId,
        quantity: Number(x?.quantity || 1),
      }))
      .filter((x) => x.productId);
  }

  if (productId) {
    return [{ productId, quantity: 1 }];
  }

  return [];
};

const applyParcelStockPlan = async (stockPlan) => {
  const plan = Array.isArray(stockPlan) ? stockPlan : [];
  const decremented = [];

  for (const item of plan) {
    const delta = Number(item?.delta || 0);
    const productId = item?.productId ? String(item.productId) : '';
    if (!productId || !Number.isFinite(delta) || delta === 0) continue;

    if (delta > 0) {
      const updated = await Product.findOneAndUpdate(
        { _id: productId, stock: { $gte: delta } },
        { $inc: { stock: -delta } },
        { new: true }
      );
      if (!updated) {
        for (const d of decremented) {
          try {
            await Product.findByIdAndUpdate(d.productId, { $inc: { stock: d.delta } });
          } catch {
          }
        }
        return { ok: false, error: new Error('INSUFFICIENT_STOCK') };
      }
      decremented.push({ productId, delta });
    }
  }

  for (const item of plan) {
    const delta = Number(item?.delta || 0);
    const productId = item?.productId ? String(item.productId) : '';
    if (!productId || !Number.isFinite(delta) || delta === 0) continue;

    if (delta < 0) {
      try {
        await Product.findByIdAndUpdate(productId, { $inc: { stock: Math.abs(delta) } });
      } catch {
      }
    }
  }

  return { ok: true };
};

// Get parcels list (with optional filters)
export const getParcels = async (req, res) => {
  try {
    const { tracking, status, paymentStatus, date, month, search } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);

    const filter = {};

    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const normalizeText = (input) => {
      if (input == null) return '';

      return String(input)
        .normalize('NFKC')
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/\u0640/g, '')
        .replace(/[\u064A\u0649]/g, 'ی')
        .replace(/\u0643/g, 'ک')
        .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
    };

    const buildUrduAwarePattern = (input) => {
      const s = normalizeText(input).trim();
      if (!s) return '';

      const digitClass = {
        0: '[0٠۰]',
        1: '[1١۱]',
        2: '[2٢۲]',
        3: '[3٣۳]',
        4: '[4٤۴]',
        5: '[5٥۵]',
        6: '[6٦۶]',
        7: '[7٧۷]',
        8: '[8٨۸]',
        9: '[9٩۹]',
      };

      return s
        .split('')
        .map((ch) => {
          if (ch === ' ') return '\\s*';
          if (digitClass[ch] != null) return digitClass[ch];
          if (ch === 'ی') return '[یيى]';
          if (ch === 'ک') return '[کك]';
          return escapeRegex(ch);
        })
        .join('');
    };

    if (search) {
      const pattern = buildUrduAwarePattern(search);
      if (pattern) {
        filter.$or = [
          { trackingNumber: { $regex: pattern, $options: 'i' } },
          { customerName: { $regex: pattern, $options: 'i' } },
          { phone: { $regex: pattern, $options: 'i' } },
          { address: { $regex: pattern, $options: 'i' } },
          { notes: { $regex: pattern, $options: 'i' } },
        ];
      }
    }

    if (tracking) {
      filter.trackingNumber = { $regex: tracking, $options: 'i' };
    }
    if (status) {
      filter.status = status;
    }
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    // Filter by createdAt (exact date or month)
    // date=YYYY-MM-DD takes precedence over month=YYYY-MM
    if (date) {
      const start = new Date(`${date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);

      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        filter.$and = [
          ...(Array.isArray(filter.$and) ? filter.$and : []),
          {
            $or: [
              { parcelDate: { $gte: start, $lt: end } },
              { createdAt: { $gte: start, $lt: end } },
            ],
          },
        ];
      }
    } else if (month) {
      const start = new Date(`${month}-01T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);

      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        filter.$and = [
          ...(Array.isArray(filter.$and) ? filter.$and : []),
          {
            $or: [
              { parcelDate: { $gte: start, $lt: end } },
              { createdAt: { $gte: start, $lt: end } },
            ],
          },
        ];
      }
    }

    const [total, parcels, totalsAgg] = await Promise.all([
      Parcel.countDocuments(filter),
      Parcel.find(filter)
        .populate('product', 'name model category')
        .populate('createdBy', 'username email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Parcel.aggregate([
        { $match: filter },
        {
          $project: {
            productUnits: {
              $cond: [
                { $gt: [{ $size: { $ifNull: ['$productsInfo', []] } }, 0] },
                { $sum: '$productsInfo.quantity' },
                1,
              ],
            },
          },
        },
        { $group: { _id: null, totalProductUnits: { $sum: '$productUnits' } } },
      ]),
    ]);

    const totalProductUnits = Number(totalsAgg?.[0]?.totalProductUnits || 0);

    const totalPages = Math.max(Math.ceil(total / limit), 1);

    res.json({
      data: parcels,
      total,
      totalProductUnits,
      page,
      totalPages,
      limit,
    });
  } catch (error) {
    console.error('Error fetching parcels:', error);
    res.status(500).json({ message: 'Failed to fetch parcels' });
  }
};

// Create new parcel
export const createParcel = async (req, res) => {
  try {
    const { productId, productsInfo, customerName, phone, trackingNumber, address, status, paymentStatus, notes, codAmount, parcelDate } = req.body;

    if (!customerName || !trackingNumber || !address) {
      return res
        .status(400)
        .json({ message: 'Customer name, tracking number and address are required' });
    }

    const requestedProducts = normalizeParcelProducts({ productId, productsInfo });
    if (!requestedProducts || requestedProducts.length === 0) {
      return res.status(400).json({ message: 'Please select at least one product' });
    }

    const ids = requestedProducts.map((x) => String(x.productId));
    const docs = await Product.find({ _id: { $in: ids } });
    const byId = new Map(docs.map((d) => [String(d._id), d]));

    for (const item of requestedProducts) {
      const id = String(item.productId);
      const qty = Number(item.quantity || 0);
      if (!byId.get(id)) {
        return res.status(404).json({ message: 'Product not found' });
      }
      if (!Number.isFinite(qty) || qty < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1' });
      }
    }

    const existing = await Parcel.findOne({ trackingNumber });
    if (existing) {
      return res.status(400).json({ message: 'A parcel with this tracking number already exists' });
    }

    const numericCodAmount = Number(codAmount || 0);

    const primaryProductId = String(requestedProducts[0].productId);
    const resolvedProductsInfo = requestedProducts.map((x) => {
      const doc = byId.get(String(x.productId));
      return {
        productId: doc._id,
        name: doc.name,
        model: doc.model,
        quantity: Number(x.quantity || 1),
      };
    });

    const stockPlan = resolvedProductsInfo.map((x) => ({
      productId: x.productId,
      delta: Number(x.quantity || 0),
    }));

    const stockApplied = await applyParcelStockPlan(stockPlan);
    if (!stockApplied.ok) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    let parcel;
    try {
      parcel = await Parcel.create({
        product: primaryProductId,
        productsInfo: resolvedProductsInfo,
        phone: phone ? String(phone).trim() : '',
        customerName: customerName.trim(),
        trackingNumber,
        // Use tracking number as the primary barcode value for now
        barcodeValue: trackingNumber,
        address,
        codAmount: Number.isNaN(numericCodAmount) ? 0 : numericCodAmount,
        parcelDate: parcelDate ? new Date(parcelDate) : new Date(),
        status: status || 'processing',
        paymentStatus: paymentStatus || 'unpaid',
        notes: notes || '',
        createdBy: req.admin._id,
      });
    } catch (saveError) {
      // rollback the stock deduction if parcel creation fails
      try {
        await applyParcelStockPlan(stockPlan.map((x) => ({ productId: x.productId, delta: -Number(x.delta || 0) })));
      } catch {
      }
      throw saveError;
    }

    const populatedParcel = await Parcel.findById(parcel._id)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email');

    res.status(201).json(populatedParcel);
  } catch (error) {
    console.error('Error creating parcel:', error);
    res.status(500).json({ message: 'Failed to create parcel' });
  }
};

// Update parcel status / payment / notes
export const updateParcelStatus = async (req, res) => {
  try {
    const { status, paymentStatus, notes } = req.body;

    const parcel = await Parcel.findById(req.params.id)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email');

    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }

    const prevStatus = parcel.status;
    const nextStatus = status || prevStatus;

    // If we are moving into 'return' from a non-return status, restore stock once
    if (prevStatus !== 'return' && nextStatus === 'return') {
      const productsToRestore = Array.isArray(parcel.productsInfo) && parcel.productsInfo.length > 0
        ? parcel.productsInfo.map((x) => ({ productId: x.productId, quantity: Number(x.quantity || 1) }))
        : (parcel.product ? [{ productId: parcel.product, quantity: 1 }] : []);

      const stockPlan = productsToRestore
        .map((item) => ({
          productId: item.productId,
          // Negative delta so applyParcelStockPlan will add back to stock
          delta: -Number(item.quantity || 0),
        }))
        .filter((x) => x.productId && Number.isFinite(x.delta) && x.delta < 0);

      if (stockPlan.length > 0) {
        const stockApplied = await applyParcelStockPlan(stockPlan);
        if (!stockApplied.ok) {
          return res.status(500).json({ message: 'Failed to restore stock for returned parcel' });
        }
      }
    }

    if (status) parcel.status = status;
    if (paymentStatus) parcel.paymentStatus = paymentStatus;
    if (typeof notes === 'string') parcel.notes = notes;

    const saved = await parcel.save();
    const populated = await Parcel.findById(saved._id)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email');

    res.json(populated);
  } catch (error) {
    console.error('Error updating parcel status:', error);
    res.status(500).json({ message: 'Failed to update parcel status' });
  }
};

export const updateParcel = async (req, res) => {
  try {
    const parcel = await Parcel.findById(req.params.id);
    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }

    const {
      productId,
      productsInfo,
      customerName,
      phone,
      trackingNumber,
      address,
      status,
      paymentStatus,
      notes,
      codAmount,
      parcelDate
    } = req.body;

    if (trackingNumber !== undefined) {
      const nextTracking = String(trackingNumber || '').trim();
      if (!nextTracking) {
        return res.status(400).json({ message: 'Tracking number is required' });
      }

      const existing = await Parcel.findOne({ trackingNumber: nextTracking, _id: { $ne: parcel._id } });
      if (existing) {
        return res.status(400).json({ message: 'A parcel with this tracking number already exists' });
      }

      parcel.trackingNumber = nextTracking;
    }

    if (customerName !== undefined) {
      const nextName = String(customerName || '').trim();
      if (!nextName) {
        return res.status(400).json({ message: 'Customer name is required' });
      }
      parcel.customerName = nextName;
    }

    if (address !== undefined) {
      const nextAddress = String(address || '').trim();
      if (!nextAddress) {
        return res.status(400).json({ message: 'Address is required' });
      }
      parcel.address = nextAddress;
    }

    if (phone !== undefined) {
      parcel.phone = phone ? String(phone).trim() : '';
    }

    if (codAmount !== undefined) {
      const numericCodAmount = Number(codAmount || 0);
      parcel.codAmount = Number.isNaN(numericCodAmount) ? 0 : numericCodAmount;
    }

    if (parcelDate !== undefined) {
      if (!parcelDate) {
        parcel.parcelDate = undefined;
      } else {
        const d = new Date(parcelDate);
        if (!Number.isNaN(d.getTime())) {
          parcel.parcelDate = d;
        }
      }
    }

    if (status !== undefined) {
      parcel.status = status;
    }

    if (paymentStatus !== undefined) {
      parcel.paymentStatus = paymentStatus;
    }

    if (notes !== undefined) {
      parcel.notes = typeof notes === 'string' ? notes : '';
    }

    const prevProducts = Array.isArray(parcel.productsInfo) && parcel.productsInfo.length > 0
      ? parcel.productsInfo.map((x) => ({ productId: x.productId, quantity: Number(x.quantity || 1) }))
      : (parcel.product ? [{ productId: parcel.product, quantity: 1 }] : []);

    const nextProducts = normalizeParcelProducts({ productId, productsInfo });

    if (nextProducts.length > 0) {
      const prevMap = new Map(prevProducts.map((p) => [String(p.productId), Number(p.quantity || 0)]));
      const nextMap = new Map(nextProducts.map((p) => [String(p.productId), Number(p.quantity || 0)]));
      const allIds = new Set([...prevMap.keys(), ...nextMap.keys()]);

      const stockPlan = Array.from(allIds)
        .map((id) => ({
          productId: id,
          delta: Number(nextMap.get(id) || 0) - Number(prevMap.get(id) || 0),
        }))
        .filter((x) => x.delta !== 0);

      // Validate quantities and product existence
      const nextIds = Array.from(nextMap.keys());
      const docs = await Product.find({ _id: { $in: nextIds } });
      const byId = new Map(docs.map((d) => [String(d._id), d]));

      for (const [id, qty] of nextMap.entries()) {
        if (!byId.get(String(id))) {
          return res.status(404).json({ message: 'Product not found' });
        }
        if (!Number.isFinite(qty) || qty < 1) {
          return res.status(400).json({ message: 'Quantity must be at least 1' });
        }
      }

      const stockApplied = await applyParcelStockPlan(stockPlan);
      if (!stockApplied.ok) {
        return res.status(400).json({ message: 'Insufficient stock' });
      }

      const primaryProductId = String(nextProducts[0].productId);
      parcel.product = primaryProductId;
      parcel.productsInfo = nextProducts.map((x) => {
        const doc = byId.get(String(x.productId));
        return {
          productId: doc._id,
          name: doc.name,
          model: doc.model,
          quantity: Number(x.quantity || 1),
        };
      });
    }

    const saved = await parcel.save();
    const populated = await Parcel.findById(saved._id)
      .populate('product', 'name model category')
      .populate('createdBy', 'username email');

    res.json(populated);
  } catch (error) {
    console.error('Error updating parcel:', error);
    res.status(500).json({ message: 'Failed to update parcel' });
  }
};

export const deleteParcel = async (req, res) => {
  try {
    const parcel = await Parcel.findById(req.params.id);
    if (!parcel) {
      return res.status(404).json({ message: 'Parcel not found' });
    }

    const productsToRestore = Array.isArray(parcel.productsInfo) && parcel.productsInfo.length > 0
      ? parcel.productsInfo.map((x) => ({ productId: x.productId, quantity: Number(x.quantity || 1) }))
      : (parcel.product ? [{ productId: parcel.product, quantity: 1 }] : []);
    await Parcel.findByIdAndDelete(req.params.id);

    for (const item of productsToRestore) {
      const id = item?.productId ? String(item.productId) : '';
      const qty = Number(item?.quantity || 0);
      if (!id || !Number.isFinite(qty) || qty <= 0) continue;
      try {
        await Product.findByIdAndUpdate(id, { $inc: { stock: qty } });
      } catch (stockError) {
        console.error('Error restoring stock when deleting parcel:', stockError);
      }
    }

    res.json({ message: 'Parcel deleted' });
  } catch (error) {
    console.error('Error deleting parcel:', error);
    res.status(500).json({ message: 'Failed to delete parcel' });
  }
};
