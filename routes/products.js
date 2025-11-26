import express from 'express';
import { authenticate, authorizeManagerOrAdmin, authorizeAdmin } from '../middleware/auth.js';
import {
  getProducts,
  getLowStockProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductStockHistory,
  addProductStock
} from '../controllers/productController.js';

const router = express.Router();

// All product operations require authenticated admin/manager
router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getProducts);
router.get('/low-stock', getLowStockProducts);
router.get('/:id', getProductById);
router.post('/', createProduct);
router.put('/:id', updateProduct);
// Only admins/superadmins can delete products
router.delete('/:id', authorizeAdmin, deleteProduct);
router.get('/:id/stock-history', getProductStockHistory);
router.post('/:id/add-stock', addProductStock);

export default router;
