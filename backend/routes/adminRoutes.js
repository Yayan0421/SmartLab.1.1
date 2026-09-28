import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

// Both administrator roles get through the door; the screens that own the
// system are then narrowed to the super admin on the route itself.
router.use(authenticate, requireAdmin);

// Super admin only: the audit trail and the system settings.
router.get('/audit-logs', requireSuperAdmin, adminController.listAuditLogs);
router.get('/settings', requireSuperAdmin, adminController.listSettings);
router.patch('/settings/:key', requireSuperAdmin, adminController.patchSetting);

// Day-to-day laboratory management: admin and super admin alike.
router.get('/laboratories', adminController.listLaboratories);
router.post('/laboratories', adminController.createLaboratory);
router.get('/reports', adminController.reports);

export default router;
