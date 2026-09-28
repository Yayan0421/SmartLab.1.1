import { Router } from 'express';
import * as reservationController from '../controllers/reservationController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createReservationSchema,
  createBulkReservationSchema,
  decisionSchema,
  listReservationsQuerySchema,
} from '../validators/reservationValidators.js';

const router = Router();

router.use(authenticate);

// Own-scope routes: any signed-in role.
router.get('/my', validate(listReservationsQuerySchema, 'query'), reservationController.listMyReservations);
router.get('/summary', reservationController.myReservationSummary);
router.get('/availability', reservationController.getAvailability);
router.get('/schedule', reservationController.getSchedule);
router.get('/policy', reservationController.getPolicy);
router.post('/', validate(createReservationSchema), reservationController.createReservation);
router.post('/bulk', validate(createBulkReservationSchema), reservationController.createBulkReservation);
router.patch('/:id/cancel', reservationController.cancelReservation);

// Admin-wide views and decisions.
router.get('/stats', requireAdmin, reservationController.reservationStats);
router.get('/groups', requireAdmin, reservationController.listReservationGroups);
router.patch('/batch/:batchId/:decision', requireAdmin, reservationController.decideBatch);
router.get('/', requireAdmin, validate(listReservationsQuerySchema, 'query'), reservationController.listReservations);
router.patch('/:id/approve', requireAdmin, validate(decisionSchema), reservationController.approveReservation);
router.patch('/:id/reject', requireAdmin, validate(decisionSchema), reservationController.rejectReservation);

// Kept last so the literal paths above are matched first.
router.get('/:id', reservationController.getReservation);

export default router;
