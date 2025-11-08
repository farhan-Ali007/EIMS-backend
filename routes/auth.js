import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Admin from '../models/Admin.js';
import Seller from '../models/Seller.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// @route   POST /api/auth/register
// @desc    Register new admin
// @access  Public (You can make this private later)
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ $or: [{ email }, { username }] });
    
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin already exists with this email or username' });
    }
    
    // Create new admin
    const admin = new Admin({
      username,
      email,
      password,
      role: 'admin'
    });
    
    await admin.save();
    
    // Generate token
    const token = generateToken(admin._id);
    
    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    res.status(201).json({
      success: true,
      token,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login admin or seller
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }
    
    // Check if admin exists
    let user = await Admin.findOne({ email });
    let userType = 'admin';
    
    // If not admin, check if seller
    if (!user) {
      user = await Seller.findOne({ email });
      userType = 'seller';
    }
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Check if seller is active
    if (userType === 'seller' && !user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated. Contact admin.' });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Create JWT token
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        role: userType === 'seller' ? 'seller' : user.role,
        userType
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
    
    // Send token in cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    // Send appropriate response based on user type
    const response = {
      success: true,
      token,  // Include token in response body
      userType,
      user: {
        id: user._id,
        name: userType === 'seller' ? user.name : user.username,
        email: user.email,
        role: userType === 'seller' ? 'seller' : user.role,
        commissionRate: userType === 'seller' ? user.commissionRate : undefined
      }
    };
    
    // Also include admin field for backward compatibility
    if (userType === 'admin') {
      response.admin = response.user;
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout admin
// @access  Private
router.post('/logout', authenticate, (req, res) => {
  res.cookie('token', '', {
    httpOnly: true,
    expires: new Date(0)
  });
  
  res.json({ success: true, message: 'Logged out successfully' });
});

// @route   GET /api/auth/me
// @desc    Get current user (admin or seller)
// @access  Private
router.get('/me', authenticate, async (req, res) => {
  try {
    const userType = req.userType;
    let userData;
    
    if (userType === 'seller') {
      userData = await Seller.findById(req.user._id).select('-password');
      res.json({ 
        success: true, 
        user: userData,
        userType: 'seller'
      });
    } else {
      userData = await Admin.findById(req.user._id).select('-password');
      res.json({ 
        success: true, 
        admin: userData,
        user: userData,
        userType: 'admin'
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Change user password (admin or seller)
// @access  Private
router.put('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Please provide current and new password' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    
    // Get user based on type (admin or seller)
    let user;
    if (req.userType === 'seller') {
      user = await Seller.findById(req.user._id);
    } else {
      user = await Admin.findById(req.user._id);
    }
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    
    // Update password
    user.password = newPassword;
    await user.save();
    
    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Generate password reset token
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Please provide email address' });
    }
    
    const admin = await Admin.findOne({ email });
    
    if (!admin) {
      // Don't reveal if email exists or not for security
      return res.json({ 
        success: true, 
        message: 'If an account exists with this email, a reset token has been generated.' 
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token and set to resetPasswordToken field
    admin.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Set expire time (10 minutes)
    admin.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    
    await admin.save();
    
    // In production, send this via email
    // For development, return the token
    res.json({
      success: true,
      message: 'Password reset token generated',
      // REMOVE THIS IN PRODUCTION - only for development
      resetToken: resetToken,
      note: 'In production, this token would be sent via email'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   PUT /api/auth/reset-password
// @desc    Reset password using token
// @access  Public
router.put('/reset-password', async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    
    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: 'Please provide reset token and new password' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    // Hash the token from request
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Find admin with valid token
    const admin = await Admin.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });
    
    if (!admin) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    
    // Set new password
    admin.password = newPassword;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpire = undefined;
    
    await admin.save();
    
    res.json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
