import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import connectDB from './config/database.js';

// Import routes
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import sellerRoutes from './routes/sellers.js';
import customerRoutes from './routes/customers.js';
import saleRoutes from './routes/sales.js';
import dashboardRoutes from './routes/dashboard.js';
import pdfRoutes from './routes/pdf.js';
import categoryRoutes from './routes/categories.js';
import sellerDashboardRoutes from './routes/seller-dashboard.js';

// Import middleware
import { authenticate } from './middleware/auth.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 4000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Request logging middleware (development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API Routes
// Public routes
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
app.use('/api/categories', authenticate, categoryRoutes);
app.use('/api/products', authenticate, productRoutes);
app.use('/api/sellers', authenticate, sellerRoutes);
app.use('/api/customers', authenticate, customerRoutes);
app.use('/api/sales', authenticate, saleRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/pdf', authenticate, pdfRoutes);
app.use('/api/seller-dashboard', authenticate, sellerDashboardRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: '🎯 Inventory Management System API',
    version: '1.0.0',
    endpoints: {
      products: '/api/products',
      sellers: '/api/sellers',
      customers: '/api/customers',
      sales: '/api/sales',
      dashboard: '/api/dashboard',
      pdf: '/api/pdf'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}`);
});

export default app;