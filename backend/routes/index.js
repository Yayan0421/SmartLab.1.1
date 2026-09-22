import { Router } from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import computerRoutes from './computerRoutes.js';
import bookingRoutes from './bookingRoutes.js';
import monitoringRoutes from './monitoringRoutes.js';
import energyRoutes from './energyRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import adminRoutes from './adminRoutes.js';
import controlRoutes from './controlRoutes.js';
import kioskRoutes from './kioskRoutes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'smartlab-api', time: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/computers', computerRoutes);
router.use('/bookings', bookingRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/energy', energyRoutes);
router.use('/notifications', notificationRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/admin', adminRoutes);
router.use('/control', controlRoutes);
router.use('/kiosk', kioskRoutes);

export default router;
