import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  listUsersQuerySchema,
} from '../validators/userValidators.js';

const router = Router();

// Every route below is admin-only, enforced server-side. A faculty or
// student token calling these directly gets a 403 regardless of the UI.
router.use(authenticate, requireAdmin);

router.get('/stats', userController.userStats);
router.get('/', validate(listUsersQuerySchema, 'query'), userController.listUsers);
router.get('/:id', userController.getUser);
router.post('/', validate(createUserSchema), userController.createUser);
router.patch('/:id', validate(updateUserSchema), userController.updateUser);
router.post('/:id/reset-password', validate(resetPasswordSchema), userController.resetPassword);
router.delete('/:id', userController.deleteUser);

export default router;
