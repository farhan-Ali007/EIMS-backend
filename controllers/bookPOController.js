import BookPO from '../models/BookPO.js';

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

    const order = await BookPO.create({
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
