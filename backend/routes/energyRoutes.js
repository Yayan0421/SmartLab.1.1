import { Router } from 'express';
import * as energyController from '../controllers/energyController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

// Energy management is an administrator capability.
router.use(authenticate, requireAdmin);

router.get('/summary', energyController.energySummary);
router.get('/by-computer', energyController.energyByComputer);
router.get('/', energyController.energySeries);
router.get('/:computerId', energyController.energyForComputer);

export default router;
