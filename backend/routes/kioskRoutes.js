import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as kioskController from '../controllers/kioskController.js';
import { authenticate, authenticateKiosk } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';

const router = Router();

/**
 * A kiosk is a shared device in a public room, so its endpoints get their
 * own key and a limiter sized for a queue of students rather than a script.
 */
const kioskLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many scans. Please wait a moment.' },
});

router.post('/scan', kioskLimiter, authenticateKiosk, kioskController.scan);
router.post('/check-in', kioskLimiter, authenticateKiosk, kioskController.checkIn);
router.post('/check-out', kioskLimiter, authenticateKiosk, kioskController.checkOut);

// The receipt list is an administrator view, not a kiosk one.
router.get('/receipts', authenticate, requireAdmin, kioskController.listReceipts);

export default router;
