import { Router } from 'express';
import * as computerController from '../controllers/computerController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createComputerSchema,
  updateComputerSchema,
  listComputersQuerySchema,
} from '../validators/computerValidators.js';

const router = Router();

router.use(authenticate);

// Reads are open to every signed-in role: students and faculty need to see
// what is available before booking.
router.get('/laboratories', computerController.listLaboratories);
router.get('/stats', computerController.computerStats);
router.get('/', validate(listComputersQuerySchema, 'query'), computerController.listComputers);
router.get('/:id', computerController.getComputer);

// Writes are admin-only.
router.post('/', requireAdmin, validate(createComputerSchema), computerController.createComputer);
router.patch('/:id', requireAdmin, validate(updateComputerSchema), computerController.updateComputer);
router.delete('/:id', requireAdmin, computerController.deleteComputer);

export default router;
