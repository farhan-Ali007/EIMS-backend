import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { createPurchaseBatch, getPurchaseBatches } from '../controllers/purchaseBatchController.js';

const router = express.Router();

router.use(authenticate, authorizeManagerOrAdmin);

router.post('/', createPurchaseBatch);
router.get('/', getPurchaseBatches);

export default router;
