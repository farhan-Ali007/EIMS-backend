import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import Seller from '../models/Seller.js';

// Get dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    // Total counts
    const totalProducts = await Product.countDocuments();
    const totalCustomers = await Customer.countDocuments();
    const onlineCustomers = await Customer.countDocuments({ type: 'online' });
    const offlineCustomers = await Customer.countDocuments({ type: 'offline' });
    const totalSellers = await Seller.countDocuments();
    const totalSales = await Sale.countDocuments();

    // Low stock products count (same rule as /products/low-stock: stock <= 10)
    const lowStockProducts = await Product.countDocuments({ stock: { $lte: 10 } });

    // Low stock items (actual products)
    const lowStockItems = await Product.find({ stock: { $lte: 10 } })
      .select('name category stock')
      .sort({ stock: 1 })
      .limit(10);

    // Total revenue and commission
    const revenueResult = await Sale.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalCommission: { $sum: '$commission' },
        },
      },
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    const totalCommission = revenueResult.length > 0 ? revenueResult[0].totalCommission : 0;

    // Recent sales
    const recentSales = await Sale.find()
      .populate('productId sellerId customerId')
      .sort({ createdAt: -1 })
      .limit(5);

    // Top selling products
    const topProducts = await Sale.aggregate([
      {
        $group: {
          _id: '$productName',
          count: { $sum: '$quantity' },
          totalRevenue: { $sum: '$total' },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    // Sales by category
    const salesByCategory = await Sale.aggregate([
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $group: {
          _id: '$product.category',
          totalSales: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      totalProducts,
      totalCustomers,
      onlineCustomers,
      offlineCustomers,
      totalSellers,
      totalSales,
      lowStockProducts,
      lowStockItems,
      totalRevenue,
      totalCommission,
      recentSales,
      topProducts,
      salesByCategory,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get sales data for charts (last 7 days)
export const getDashboardChartData = async (req, res) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const salesData = await Sale.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          totalSales: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Create array of last 7 days with 0 values for missing days
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];

      const existingData = salesData.find((item) => item._id === dateString);

      last7Days.push({
        _id: dateString,
        totalSales: existingData ? existingData.totalSales : 0,
        count: existingData ? existingData.count : 0,
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      });
    }

    res.json(last7Days);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
