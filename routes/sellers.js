import express from 'express';
import Seller from '../models/Seller.js';
import Sale from '../models/Sale.js';

const router = express.Router();

// Get all sellers
router.get('/', async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ totalCommission: -1 });
    res.json(sellers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get seller leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const sellers = await Seller.find().sort({ totalCommission: -1 }).limit(10);
    res.json(sellers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get single seller
router.get('/:id', async (req, res) => {
  try {
    const seller = await Seller.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }
    
    // Get seller's sales
    const sales = await Sale.find({ sellerId: req.params.id })
      .populate('productId customerId')
      .sort({ createdAt: -1 });
    
    res.json({ seller, sales });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create new seller
router.post('/', async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    
    // Check if email already exists
    const existingSeller = await Seller.findOne({ email });
    if (existingSeller) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    
    // Generate a random password (seller can change it later)
    const randomPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8);
    
    const seller = new Seller({
      name,
      email,
      phone,
      password: randomPassword // Will be hashed by pre-save hook
    });
    
    const newSeller = await seller.save();
    
    // Return seller info with temporary password
    res.status(201).json({
      seller: {
        id: newSeller._id,
        name: newSeller.name,
        email: newSeller.email,
        phone: newSeller.phone,
        role: newSeller.role,
        isActive: newSeller.isActive
      },
      temporaryPassword: randomPassword, // Show this ONCE to admin
      message: `Seller created! Login credentials - Email: ${email}, Password: ${randomPassword}`
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update seller
router.put('/:id', async (req, res) => {
  try {
    const seller = await Seller.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }
    res.json(seller);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete seller
router.delete('/:id', async (req, res) => {
  try {
    const seller = await Seller.findByIdAndDelete(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }
    res.json({ message: 'Seller deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
