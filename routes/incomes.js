import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { createIncome, getIncomes } from '../controllers/incomeController.js';

const router = express.Router();

// Income routes restricted to authenticated admin / manager
router.use(authenticate, authorizeManagerOrAdmin);

router.post('/', createIncome);
router.get('/', getIncomes);

export default router;
