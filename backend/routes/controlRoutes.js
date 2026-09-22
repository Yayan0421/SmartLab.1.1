import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controlController from '../controllers/controlController.js';
import { authenticate, authenticateAgent } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

/**
 * Agent traffic is machine-to-machine and far chattier than a person
 * clicking buttons: 30 workstations polling for commands and uploading a
 * thumbnail every few seconds.
 */
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Agent rate limit exceeded.' },
});

// ---- agent endpoints: shared key, no user session --------------------
router.get(
  '/agent/:computerId/commands',
  agentLimiter,
  authenticateAgent,
  controlController.agentPoll
);
router.post(
  '/agent/commands/:id/result',
  agentLimiter,
  authenticateAgent,
  controlController.agentResult
);
router.post(
  '/agent/:computerId/screen',
  agentLimiter,
  authenticateAgent,
  controlController.agentScreen
);
router.patch(
  '/agent/:computerId/state',
  agentLimiter,
  authenticateAgent,
  controlController.agentState
);

// ---- administrator endpoints ----------------------------------------
// Controlling a workstation is the most invasive thing this system does,
// so every route below is admin-only and audited.
router.use(authenticate, requireAdmin);

router.get('/screens', controlController.listScreens);
router.get('/commands', controlController.listCommands);
router.post('/:computerId/:action', controlController.sendCommand);

export default router;
