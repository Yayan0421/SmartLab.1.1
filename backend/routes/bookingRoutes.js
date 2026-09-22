import { Router } from 'express';
import * as bookingController from '../controllers/bookingController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { requireAdmin } from '../middleware/roleMiddleware.js';
import { validate } from '../middleware/validate.js';
import {
  createBookingSchema,
  createBulkBookingSchema,
  decisionSchema,
  listBookingsQuerySchema,
} from '../validators/bookingValidators.js';

const router = Router();

router.use(authenticate);

// Own-scope routes: any signed-in role.
router.get('/my', validate(listBookingsQuerySchema, 'query'), bookingController.listMyBookings);
router.get('/summary', bookingController.myBookingSummary);
router.get('/availability', bookingController.getAvailability);
router.get('/schedule', bookingController.getSchedule);
router.get('/policy', bookingController.getPolicy);
router.post('/', validate(createBookingSchema), bookingController.createBooking);
router.post('/bulk', validate(createBulkBookingSchema), bookingController.createBulkBooking);
router.patch('/:id/cancel', bookingController.cancelBooking);

// Admin-wide views and decisions.
router.get('/stats', requireAdmin, bookingController.bookingStats);
router.get('/groups', requireAdmin, bookingController.listBookingGroups);
router.patch('/batch/:batchId/:decision', requireAdmin, bookingController.decideBatch);
router.get('/', requireAdmin, validate(listBookingsQuerySchema, 'query'), bookingController.listBookings);
router.patch('/:id/approve', requireAdmin, validate(decisionSchema), bookingController.approveBooking);
router.patch('/:id/reject', requireAdmin, validate(decisionSchema), bookingController.rejectBooking);

// Kept last so the literal paths above are matched first.
router.get('/:id', bookingController.getBooking);

export default router;
