import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/auth.js';
import {
  getSales,
  getSaleById,
  createSale,
  deleteSale
} from '../controllers/saleController.js';

const router = express.Router();

// Sales routes (global history) restricted to admins only
router.use(authenticate, authorizeAdmin);

router.get('/', getSales);
router.get('/:id', getSaleById);
router.post('/', createSale);
router.delete('/:id', deleteSale);

export default router;
