import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { createReturn, getReturns } from '../controllers/returnController.js';

const router = express.Router();

// All returns operations require authenticated admin/manager
router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getReturns);
router.post('/', createReturn);

export default router;
