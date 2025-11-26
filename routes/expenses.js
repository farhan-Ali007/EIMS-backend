import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import {
  createExpense,
  getExpenses,
  getExpenseStats
} from '../controllers/expenseController.js';

const router = express.Router();

// Expenses are restricted to authenticated admin/manager
router.use(authenticate, authorizeManagerOrAdmin);

router.post('/', createExpense);
router.get('/', getExpenses);
router.get('/stats/overview', getExpenseStats);

export default router;
