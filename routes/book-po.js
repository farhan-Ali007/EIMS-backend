import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { createBookPO, getBookPOs, updateBookPO } from '../controllers/bookPOController.js';

const router = express.Router();

// All routes here require admin/manager auth
router.use(authenticate, authorizeManagerOrAdmin);

// Create new Book PO order
router.post('/', createBookPO);

// Update existing Book PO order
router.put('/:id', updateBookPO);

// Get list of Book PO orders (simple, latest first, optional limit)
router.get('/', getBookPOs);

export default router;
