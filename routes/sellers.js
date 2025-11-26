import express from 'express';
import { authenticate, authorizeManagerOrAdmin, authorizeAdmin } from '../middleware/auth.js';
import {
  getSellers,
  getSellerLeaderboard,
  getSellerById,
  createSeller,
  updateSeller,
  deleteSeller
} from '../controllers/sellerController.js';

const router = express.Router();

// Seller management requires authenticated admin/manager
router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getSellers);
router.get('/leaderboard', getSellerLeaderboard);
router.get('/:id', getSellerById);
router.post('/', createSeller);
router.put('/:id', updateSeller);
// Only admins/superadmins can delete sellers
router.delete('/:id', authorizeAdmin, deleteSeller);

export default router;
