import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { getParcels, createParcel, updateParcelStatus, updateParcel, deleteParcel } from '../controllers/parcelController.js';

const router = express.Router();

router.use(authenticate, authorizeManagerOrAdmin);

// GET /api/parcels - list parcels (optional query: tracking, status, paymentStatus)
router.get('/', getParcels);

router.post('/', createParcel);

router.patch('/:id/status', updateParcelStatus);

router.put('/:id', updateParcel);

router.delete('/:id', deleteParcel);

export default router;
