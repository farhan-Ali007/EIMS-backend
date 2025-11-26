import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Admin from '../models/Admin.js';
import Seller from '../models/Seller.js';
import InviteCode from '../models/InviteCode.js';
import { authenticate, authorizeAdmin } from '../middleware/auth.js';
import sendEmail from '../utils/sendEmail.js';
import { passwordResetTemplate, passwordChangedTemplate } from '../utils/emailTemplates.js';

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

// Helper to generate a secure random invite code
const generateInviteCode = () => {
  return crypto.randomBytes(8).toString('hex'); // 16 chars, 64-bit entropy
};

// Ensure there is always an invite code document present
const getOrCreateInviteCode = async () => {
  let doc = await InviteCode.findOne();
  if (!doc) {
    doc = await InviteCode.create({ code: generateInviteCode() });
  }
  return doc;
};

// @route   GET /api/auth/invite-code
// @desc    Get current invite code (admin only)
// @access  Private (admin/superadmin)
router.get('/invite-code', authenticate, authorizeAdmin, async (req, res) => {
  try {
    const current = await getOrCreateInviteCode();
    res.json({ code: current.code });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/auth/register
// @desc    Register new admin (protected by rotating invite code)
// @access  Public (requires valid invite code)
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, inviteCode } = req.body;

    // Require invite code
    if (!inviteCode) {
      return res.status(403).json({ message: 'Invite code is required to register' });
    }

    const current = await getOrCreateInviteCode();

    if (inviteCode !== current.code) {
      return res.status(403).json({ message: 'Invalid or expired invite code' });
    }
    
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

    // Rotate invite code after successful signup
    current.code = generateInviteCode();
    await current.save();
    
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
// @desc    Generate password reset token and send email
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Please provide email address' });
    }
    
    // Check if user exists (Admin or Seller)
    let user = await Admin.findOne({ email });
    let userType = 'admin';
    
    if (!user) {
      user = await Seller.findOne({ email });
      userType = 'seller';
    }
    
    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({ 
        success: true, 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash token and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Set expire time (10 minutes)
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
    
    await user.save();
    
    // Create reset URL
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password/${resetToken}`;
    
    // Get email template
    const emailContent = passwordResetTemplate(resetUrl, user.username || user.name);
    
    try {
      // Send email
      await sendEmail({
        to: user.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      
      console.log(`✅ Password reset email sent to: ${user.email}`);
      
      res.json({
        success: true,
        message: 'Password reset email sent successfully. Please check your inbox.'
      });
      
    } catch (emailError) {
      // If email fails, remove reset token from database
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();
      
      console.error('Email sending failed:', emailError);
      
      return res.status(500).json({
        success: false,
        message: 'Email could not be sent. Please try again later or contact support.'
      });
    }
    
  } catch (error) {
    console.error('Forgot password error:', error);
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
    
    // Find user (admin or seller) with valid token
    let user = await Admin.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });
    
    if (!user) {
      user = await Seller.findOne({
        resetPasswordToken: hashedToken,
        resetPasswordExpire: { $gt: Date.now() }
      });
    }
    
    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token. Please request a new password reset.' 
      });
    }
    
    // Set new password
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    
    await user.save();
    
    // Optionally send confirmation email
    try {
      const emailContent = passwordChangedTemplate(user.username || user.name);
      await sendEmail({
        to: user.email,
        subject: emailContent.subject,
        text: emailContent.text,
        html: emailContent.html,
      });
      console.log(`✅ Password changed confirmation email sent to: ${user.email}`);
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't fail the request if email fails
    }
    
    res.json({
      success: true,
      message: 'Password reset successful. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
