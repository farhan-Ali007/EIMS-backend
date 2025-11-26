import Expense from '../models/Expense.js';

// Create new expense
export const createExpense = async (req, res) => {
  try {
    const { title, amount, category, whereSpent, notes, date } = req.body;

    const expense = new Expense({
      title,
      amount: Number(amount || 0),
      category,
      whereSpent,
      notes,
      date: date ? new Date(date) : new Date(),
      createdBy: req.user.id
    });

    const saved = await expense.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get expenses with optional date range and search
export const getExpenses = async (req, res) => {
  try {
    const { startDate, endDate, search } = req.query;
    const filter = {};

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { whereSpent: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } }
      ];
    }

    const expenses = await Expense.find(filter)
      .populate('createdBy', 'username email')
      .sort({ date: -1 });

    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Expense stats: today, week, month, year
export const getExpenseStats = async (req, res) => {
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const startOfWeek = new Date(startOfDay);
    const dayOfWeek = startOfDay.getDay(); // 0=Sun
    const diffToMonday = (dayOfWeek + 6) % 7; // days since Monday
    startOfWeek.setDate(startOfWeek.getDate() - diffToMonday);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    const [todayStats, weekStats, monthStats, yearStats] = await Promise.all([
      Expense.aggregate([
        { $match: { date: { $gte: startOfDay } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: startOfWeek } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: startOfMonth } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]),
      Expense.aggregate([
        { $match: { date: { $gte: startOfYear } } },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      today: todayStats[0] || { totalAmount: 0, count: 0 },
      week: weekStats[0] || { totalAmount: 0, count: 0 },
      month: monthStats[0] || { totalAmount: 0, count: 0 },
      year: yearStats[0] || { totalAmount: 0, count: 0 }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
