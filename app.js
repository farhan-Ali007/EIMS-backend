import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
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
import billRoutes from './routes/bills.js';
import expenseRoutes from './routes/expenses.js';
import incomeRoutes from './routes/incomes.js';
import adminRoutes from './routes/admins.js';
import returnRoutes from './routes/returns.js';
import parcelRoutes from './routes/parcels.js';

// Import middleware
import { authenticate } from './middleware/auth.js';

// Load environment variables
dotenv.config();

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
app.use('/api/bills', authenticate, billRoutes);
app.use('/api/expenses', authenticate, expenseRoutes);
app.use('/api/incomes', authenticate, incomeRoutes);
app.use('/api/admins', authenticate, adminRoutes);
app.use('/api/returns', authenticate, returnRoutes);
app.use('/api/parcels', authenticate, parcelRoutes);

// Serve frontend static files from Vite dist folder
const frontendDistPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDistPath));

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
      pdf: '/api/pdf',
      bills: '/api/bills',
      expenses: '/api/expenses'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// SPA fallback for non-API routes (must come before 404 handler)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendDistPath, 'index.html'));
});

// 404 handler (for unmatched API routes or other errors)
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