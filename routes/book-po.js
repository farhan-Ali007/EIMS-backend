import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { createBookPO, getBookPOs } from '../controllers/bookPOController.js';

const router = express.Router();

// All routes here require admin/manager auth
router.use(authenticate, authorizeManagerOrAdmin);

// Create new Book PO order
router.post('/', createBookPO);

// Get list of Book PO orders (simple, latest first, optional limit)
router.get('/', getBookPOs);

export default router;
