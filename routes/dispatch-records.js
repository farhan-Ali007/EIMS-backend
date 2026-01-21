import express from 'express';
import { authenticate, authorizeManagerOrAdmin } from '../middleware/auth.js';
import { getDispatchRecords, upsertDispatchRecord } from '../controllers/dispatchRecordController.js';

const router = express.Router();

router.use(authenticate, authorizeManagerOrAdmin);

router.get('/', getDispatchRecords);
router.post('/', upsertDispatchRecord);

export default router;
