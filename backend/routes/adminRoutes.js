import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/audit-logs', adminController.listAuditLogs);
router.get('/settings', adminController.listSettings);
router.patch('/settings/:key', adminController.patchSetting);
router.get('/laboratories', adminController.listLaboratories);
router.post('/laboratories', adminController.createLaboratory);
router.get('/reports', adminController.reports);

export default router;
