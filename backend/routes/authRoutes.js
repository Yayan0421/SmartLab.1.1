import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  loginSchema,
  changePasswordSchema,
  updateProfileSchema,
  avatarSchema,
} from '../validators/authValidators.js';

const router = Router();

/** Brute-force guard on the credential endpoints specifically. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in a few minutes.' },
});

// There is no signup. Accounts are created by an administrator from the
// Users screen, and administrator accounts by a super admin from Manage
// Admins, so the only credential endpoint left open is the sign-in itself.
router.post('/login', authLimiter, validate(loginSchema), authController.login);

router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);
router.patch('/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);
router.post('/avatar', authenticate, validate(avatarSchema), authController.setAvatar);
router.delete('/avatar', authenticate, authController.removeAvatar);
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
