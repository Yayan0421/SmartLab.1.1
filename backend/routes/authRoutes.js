import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  loginSchema,
  registerSchema,
  registerAdminSchema,
  changePasswordSchema,
  updateProfileSchema,
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

/**
 * Administrator signup is the most sensitive endpoint here, so it gets a
 * much tighter limiter: a handful of attempts per hour makes guessing the
 * admin code impractical.
 */
const adminSignupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many administrator signup attempts. Please try again later.',
  },
});

router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post(
  '/register-admin',
  adminSignupLimiter,
  validate(registerAdminSchema),
  authController.registerAdmin
);

router.get('/me', authenticate, authController.me);
router.post('/logout', authenticate, authController.logout);
router.patch('/profile', authenticate, validate(updateProfileSchema), authController.updateProfile);
router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  authController.changePassword
);

export default router;
