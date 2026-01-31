import BookPO from '../models/BookPO.js';

const generateNextBookPOCode = async () => {
  const last = await BookPO.findOne({ seq: { $ne: null } }).sort({ seq: -1 }).lean();
  const nextSeq = (last?.seq || 0) + 1;
  const code = `EM${String(nextSeq).padStart(5, '0')}`;
  return { code, seq: nextSeq };
};

// Create new Book PO order
export const createBookPO = async (req, res) => {
  try {
    const { toName, toPhone, toAddress, weight, amount } = req.body;

    if (!toName || !toPhone || !toAddress || !weight || amount == null) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const numericAmount = Number(amount || 0);
    if (Number.isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ message: 'Amount must be a non-negative number' });
    }

    const { code, seq } = await generateNextBookPOCode();

    const order = await BookPO.create({
      code,
      seq,
      toName: toName.trim(),
      toPhone: toPhone.trim(),
      toAddress: toAddress.trim(),
      weight: weight.trim(),
      amount: numericAmount,
      createdBy: req.user.id,
    });

    return res.status(201).json(order);
  } catch (error) {
    console.error('Error creating Book PO order:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Update existing Book PO order
export const updateBookPO = async (req, res) => {
  try {
    const { toName, toPhone, toAddress, weight, amount } = req.body;

    if (!toName || !toPhone || !toAddress || !weight || amount == null) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const numericAmount = Number(amount || 0);
    if (Number.isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ message: 'Amount must be a non-negative number' });
    }

    const updated = await BookPO.findByIdAndUpdate(
      req.params.id,
      {
        toName: toName.trim(),
        toPhone: toPhone.trim(),
        toAddress: toAddress.trim(),
        weight: weight.trim(),
        amount: numericAmount,
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Book PO order not found' });
    }

    return res.json(updated);
  } catch (error) {
    console.error('Error updating Book PO order:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Get list of Book PO orders (simple, latest first, optional limit)
export const getBookPOs = async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);

    const orders = await BookPO.find()
      .sort({ createdAt: -1 })
      .limit(limit);

    return res.json(orders);
  } catch (error) {
    console.error('Error fetching Book PO orders:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Lookup a single Book PO by short code (preferred) or Mongo _id (fallback)
export const lookupBookPO = async (req, res) => {
  try {
    const raw = String(req.params.value || '').trim();
    if (!raw) {
      return res.status(400).json({ message: 'Lookup value is required' });
    }

    // Try by code first (e.g. BP00023)
    let order = await BookPO.findOne({ code: raw });

    // Fallback: treat as Mongo _id
    if (!order) {
      try {
        order = await BookPO.findById(raw);
      } catch (e) {
        // ignore cast errors, handled below
      }
    }

    if (!order) {
      return res.status(404).json({ message: 'Book PO order not found' });
    }

    return res.json(order);
  } catch (error) {
    console.error('Error looking up Book PO order:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
