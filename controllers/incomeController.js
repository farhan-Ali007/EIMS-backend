import Income from '../models/Income.js';

// Create new income record
export const createIncome = async (req, res) => {
  try {
    const { type, expectedAmount, amount, from, date } = req.body;

    if (!type || !['cash', 'in_account'].includes(type)) {
      return res.status(400).json({ message: 'Type must be cash or in_account' });
    }

    if (!expectedAmount || Number(expectedAmount) <= 0) {
      return res.status(400).json({ message: 'Expected amount must be greater than 0' });
    }

    if (amount == null || Number(amount) < 0) {
      return res.status(400).json({ message: 'Paid amount must be 0 or greater' });
    }

    if (!from || !from.trim()) {
      return res.status(400).json({ message: 'From field is required' });
    }

    const income = new Income({
      type,
      expectedAmount: Number(expectedAmount || 0),
      amount: Number(amount || 0),
      from: from.trim(),
      date: date ? new Date(date) : new Date(),
      createdBy: req.user.id,
    });

    const saved = await income.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
// Get incomes with optional filters
export const getIncomes = async (req, res) => {
  try {
    const { type, startDate, endDate, search } = req.query;
    const filter = {};

    if (type && ['cash', 'in_account'].includes(type)) {
      filter.type = type;
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (search) {
      filter.from = { $regex: search, $options: 'i' };
    }

    const incomes = await Income.find(filter)
      .populate('createdBy', 'username email')
      .sort({ date: -1 });

    res.json(incomes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
