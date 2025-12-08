import express from 'express';
import { authenticate, authorizeManagerOrAdmin, authorizeAdmin } from '../middleware/auth.js';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer
} from '../controllers/customerController.js';

const router = express.Router();

// Customer management requires authenticated admin/manager
router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getCustomers);
router.get('/:id', getCustomerById);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
// Only admins/superadmins can delete customers
router.delete('/:id', authorizeAdmin, deleteCustomer);

export default router;
