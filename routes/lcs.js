import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { getBookedPacketLastStatusByDateRange, getLcsCities, resolveLcsCity, suggestLcsCities } from '../controllers/lcsController.js';

const router = express.Router();

router.use(authenticate, authorizeManagerOrAdmin);

router.get('/cities', getLcsCities);
router.get('/cities/resolve', resolveLcsCity);
router.get('/cities/suggest', suggestLcsCities);

router.get('/booked-packets/last-status', getBookedPacketLastStatusByDateRange);

export default router;
