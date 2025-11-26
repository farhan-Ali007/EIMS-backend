import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import Seller from '../models/Seller.js';

export const authenticate = async (req, res, next) => {
  try {
    // Get token from cookie or header
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token' });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user based on userType
    if (decoded.userType === 'seller') {
      req.user = await Seller.findById(decoded.id).select('-password');
      req.userType = 'seller';
    } else {
      req.user = await Admin.findById(decoded.id).select('-password');
      req.userType = 'admin';
    }

    // Also set req.admin for backward compatibility
    req.admin = req.user;

    next();
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

export const authorizeAdmin = (req, res, next) => {
  if (req.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }

  if (req.admin.role !== 'admin' && req.admin.role !== 'superadmin') {
    return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
  }

  next();
};

// Allow both admin and manager (and superadmin) for operational routes
export const authorizeManagerOrAdmin = (req, res, next) => {
  if (req.userType !== 'admin') {
    return res.status(403).json({ message: 'Access denied.' });
  }

  if (!['admin', 'superadmin', 'manager'].includes(req.admin.role)) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  next();
};

// Restrict to seller users only
export const authorizeSeller = (req, res, next) => {
  if (req.userType !== 'seller') {
    return res.status(403).json({ message: 'Access denied. Seller privileges required.' });
  }
  next();
};
