import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { getAdSpends, upsertAdSpend } from '../controllers/adSpendController.js';

const router = express.Router();

router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getAdSpends);
router.post('/', upsertAdSpend);

export default router;
