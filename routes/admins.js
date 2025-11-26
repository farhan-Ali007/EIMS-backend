import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/auth.js';
import { getAdmins, updateAdminRole } from '../controllers/adminController.js';

const router = express.Router();

// All admin-management routes require authenticated true admin (or superadmin)
router.use(authenticate, authorizeAdmin);

router.get('/', getAdmins);
router.put('/:id/role', updateAdminRole);

export default router;
