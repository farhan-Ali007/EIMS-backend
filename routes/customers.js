import express from 'express';
import { authenticate, authorizeManagerOrAdmin, authorizeAdmin } from '../middleware/auth.js';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  backfillOnlineCustomerCommissions,
  previewOnlineCustomerCommissions
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

// One-time backfill endpoint for online customer commissions (admin only)
router.post('/backfill-online-commissions', authorizeAdmin, backfillOnlineCustomerCommissions);
router.get('/backfill-online-commissions/preview', authorizeAdmin, previewOnlineCustomerCommissions);

export default router;
