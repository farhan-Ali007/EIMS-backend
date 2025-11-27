import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/auth.js';
import { getDashboardStats, getDashboardChartData } from '../controllers/dashboardController.js';

const router = express.Router();

// Dashboard is restricted to authenticated admins only
router.use(authenticate, authorizeAdmin);

// Get dashboard statistics
router.get('/stats', getDashboardStats);

// Get sales data for charts (last 7 days)
router.get('/chart-data', getDashboardChartData);

export default router;
