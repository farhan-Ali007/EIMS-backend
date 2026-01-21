import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { getLcsParcels, syncLcsParcels } from '../controllers/lcsParcelController.js';

const router = express.Router();

router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getLcsParcels);
router.post('/sync', syncLcsParcels);

export default router;
