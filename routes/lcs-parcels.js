import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { getLcsParcels, syncLcsParcels, updateLcsParcelProducts, getLcsParcelByCn } from '../controllers/lcsParcelController.js';

const router = express.Router();

router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getLcsParcels);
router.get('/by-cn/:cn', getLcsParcelByCn);
router.post('/sync', syncLcsParcels);
router.patch('/:id/products', updateLcsParcelProducts);

export default router;
