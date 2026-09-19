import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import env from './config/env.js';
import { assertDatabaseConnection } from './config/database.js';
import apiRoutes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorMiddleware.js';
import { sweepStaleBookings } from './services/bookingService.js';
import { markStaleComputersOffline } from './controllers/monitoringController.js';

const app = express();

// Behind a reverse proxy in production, so rate limiting sees the real IP.
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and tooling requests arrive without an Origin header.
      if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan(env.isProduction ? 'combined' : 'dev'));

// Baseline limiter for the whole API. Sized for a lab of 30+ machines and
// browser clients; /auth and /monitoring add their own tighter limits.
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down and try again.' },
  })
);

app.use('/api', apiRoutes);

app.get('/', (_req, res) => {
  res.json({ success: true, service: 'SMARTLAB API', docs: '/api/health' });
});

app.use(notFoundHandler);
app.use(errorHandler);

/** Background maintenance: expire past bookings, mark silent agents offline. */
function startBackgroundJobs() {
  const runSweep = () => {
    sweepStaleBookings().catch((e) => console.error('[sweep]', e.message));
    markStaleComputersOffline().catch((e) => console.error('[offline-sweep]', e.message));
  };
  runSweep();
  return setInterval(runSweep, 60_000);
}

async function start() {
  try {
    await assertDatabaseConnection();
    console.log('[SMARTLAB] Supabase connection OK');
  } catch (error) {
    console.error(`[SMARTLAB] ${error.message}`);
    process.exit(1);
  }

  const timer = startBackgroundJobs();

  const server = app.listen(env.port, () => {
    console.log(`\n  SMARTLAB API listening on http://localhost:${env.port}/api`);
    console.log(`  Environment: ${env.nodeEnv}`);
    console.log(`  Allowed origins: ${env.corsOrigins.join(', ')}\n`);
  });

  const shutdown = (signal) => {
    console.log(`\n[SMARTLAB] ${signal} received, shutting down.`);
    clearInterval(timer);
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start();

export default app;
