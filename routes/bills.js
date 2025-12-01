import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import {
  getBills,
  getBillById,
  createBill,
  getCustomerHistory,
  getBillingStats,
  updateBillStatus,
  cancelBill,
  addBillPayment,
} from '../controllers/billController.js';

const router = express.Router();

// Billing routes wired to controller (admin/manager only)
router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getBills);
router.get('/stats/overview', getBillingStats);
router.get('/customer/:customerId/history', getCustomerHistory);
router.get('/:id', getBillById);
router.post('/', createBill);
router.patch('/:id/status', updateBillStatus);
router.delete('/:id', cancelBill);
router.post('/:id/payments', addBillPayment);

export default router;
