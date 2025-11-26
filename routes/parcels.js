import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { getParcels, createParcel } from '../controllers/parcelController.js';

const router = express.Router();

// All routes here require admin / manager access
router.use(authenticate, authorizeManagerOrAdmin);

// GET /api/parcels - list parcels (optional query: tracking, status, paymentStatus)
router.get('/', getParcels);

// POST /api/parcels - create new parcel
router.post('/', createParcel);

export default router;
