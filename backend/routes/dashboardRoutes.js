import { Router } from 'express';
import * as dashboardController from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(authenticate);

router.get('/admin', requireAdmin, dashboardController.adminDashboard);
router.get('/me', dashboardController.userDashboard);

export default router;
