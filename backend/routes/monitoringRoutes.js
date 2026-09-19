import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as monitoringController from '../controllers/monitoringController.js';
import { authenticate, authenticateAgent } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import { heartbeatSchema } from '../validators/computerValidators.js';

const router = Router();

/**
 * Heartbeats come from machines, not people, so they get their own limiter
 * and their own credential. Sized for 30+ agents reporting every 30s.
 */
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Heartbeat rate limit exceeded.' },
});

router.post(
  '/heartbeat',
  agentLimiter,
  authenticateAgent,
  validate(heartbeatSchema),
  monitoringController.heartbeat
);

// Monitoring views are admin-only.
router.get('/', authenticate, requireAdmin, monitoringController.listMonitoring);
router.get('/:computerId', authenticate, requireAdmin, monitoringController.getMonitoring);

export default router;
