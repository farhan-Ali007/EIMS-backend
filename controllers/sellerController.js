import Seller from '../models/Seller.js';
import Sale from '../models/Sale.js';

// Get all sellers
export const getSellers = async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ totalCommission: -1 });
    res.json(sellers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get seller leaderboard
export const getSellerLeaderboard = async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ totalCommission: -1 }).limit(10);
    res.json(sellers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get single seller with sales history
export const getSellerById = async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    const sales = await Sale.find({ sellerId: req.params.id })
      .populate('productId customerId')
      .sort({ createdAt: -1 });

    res.json({ seller, sales });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create new seller
export const createSeller = async (req, res) => {
  try {
    const { name, phone, basicSalary, commissionRate } = req.body;

    // Generate a random password (seller can change it later)
    const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);

    const seller = new Seller({
      name,
      phone,
      basicSalary: Number(basicSalary || 0),
      commissionRate: Number(commissionRate || 0), // per-product commission rate
      commission: 0,
      totalCommission: 0,
      password: randomPassword // Will be hashed by pre-save hook
    });

    const newSeller = await seller.save();

    res.status(201).json({
      seller: {
        id: newSeller._id,
        name: newSeller.name,
        phone: newSeller.phone,
        basicSalary: newSeller.basicSalary,
        commissionRate: newSeller.commissionRate,
        commission: newSeller.commission,
        totalCommission: newSeller.totalCommission,
        total: newSeller.total,
        role: newSeller.role,
        isActive: newSeller.isActive
      },
      temporaryPassword: randomPassword,
      message: `Seller created! Temporary password: ${randomPassword}`
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Update seller (only editable fields, not earned commission)
export const updateSeller = async (req, res) => {
  try {
    const { name, phone, basicSalary, commissionRate, isActive } = req.body;

    const updateData = {
      ...(name !== undefined && { name }),
      ...(phone !== undefined && { phone }),
      ...(basicSalary !== undefined && { basicSalary }),
      ...(commissionRate !== undefined && { commissionRate }),
      ...(isActive !== undefined && { isActive })
    };

    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    res.json(seller);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete seller
export const deleteSeller = async (req, res) => {
  try {
    const seller = await Seller.findByIdAndDelete(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }
    res.json({ message: 'Seller deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
