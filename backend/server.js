import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
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
import { expireStaleCommands } from './services/commandService.js';
import { expireNoShows, releaseFinishedSessions } from './controllers/kioskController.js';

const app = express();

// Behind a reverse proxy in production, so rate limiting sees the real IP.
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(compression());

/**
 * Private-network addresses, so a phone or a second laptop on the same
 * Wi-Fi can use the app during development. Only consulted when NODE_ENV is
 * not production — a deployed server accepts CORS_ORIGIN and nothing else.
 */
const PRIVATE_LAN = /^https?:\/\/(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and tooling requests arrive without an Origin header.
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      if (!env.isProduction && PRIVATE_LAN.test(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// 3mb covers a base64 profile picture (the browser resizes to a 256px
// square first, so a real upload is far smaller than this).
app.use(express.json({ limit: '3mb' }));
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

/**
 * The built front end, when it is there.
 *
 * Serving the app from the same origin as the API turns two deployments
 * into one and removes CORS from the picture entirely — the browser is no
 * longer making a cross-origin request. In development the directory does
 * not exist and Vite serves the app instead, so nothing changes here.
 */
const clientDir = path.resolve(process.cwd(), '..', 'frontend', 'dist');
const hasClient = fs.existsSync(path.join(clientDir, 'index.html'));

if (hasClient) {
  // Hashed assets never change under the same name, so they can be held
  // for a year; index.html must not be, or a deploy never reaches anyone.
  app.use(
    '/assets',
    express.static(path.join(clientDir, 'assets'), {
      immutable: true,
      maxAge: '1y',
    })
  );
  app.use(express.static(clientDir, { index: false }));
}

app.get('/', (_req, res, next) => {
  if (!hasClient) {
    return res.json({ success: true, service: 'SMARTLAB API', docs: '/api/health' });
  }
  return next();
});

/**
 * Client-side routing: anything that is not an API call and not a file
 * gets the app, which then decides what the path means. Scoped away from
 * /api so a mistyped endpoint still returns a JSON 404 rather than HTML,
 * which is the difference between a clear error and a confusing one.
 */
if (hasClient) {
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.use(notFoundHandler);
app.use(errorHandler);

/** Background maintenance: expire past bookings, mark silent agents offline. */
function startBackgroundJobs() {
  const runSweep = () => {
    sweepStaleBookings().catch((e) => console.error('[sweep]', e.message));
    markStaleComputersOffline().catch((e) => console.error('[offline-sweep]', e.message));
    expireStaleCommands().catch((e) => console.error('[command-sweep]', e.message));
    expireNoShows().catch((e) => console.error('[no-show-sweep]', e.message));
    releaseFinishedSessions().catch((e) => console.error('[release-sweep]', e.message));
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

  /**
   * HTTPS turns on by itself once certs/ exists.
   *
   * Browsers only allow camera access on a secure origin, so the kiosk
   * cannot scan from a phone over the network without it. Create the
   * certificate with `npm run cert`; delete certs/ to go back to http.
   *
   * The certificate is for development on a local network. A deployed
   * server should sit behind a real one.
   */
  const certDir = path.resolve(process.cwd(), '..', 'certs');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  const haveCerts = fs.existsSync(keyPath) && fs.existsSync(certPath);

  /**
   * USE_HTTPS: 'auto' (default), 'true' or 'false'.
   *
   * On a hosting platform TLS is terminated before the request reaches
   * this process, and a server that insists on speaking HTTPS to a proxy
   * expecting HTTP simply never answers. So 'auto' means "in development
   * only": a certs/ directory left behind on a deployed machine cannot
   * silently break it. An on-premises server that really does terminate
   * its own TLS sets USE_HTTPS=true.
   */
  const httpsMode = (process.env.USE_HTTPS || 'auto').toLowerCase();
  const wantsHttps =
    httpsMode === 'true' ? true : httpsMode === 'false' ? false : !env.isProduction;
  const useHttps = haveCerts && wantsHttps;

  if (httpsMode === 'true' && !haveCerts) {
    console.error('[SMARTLAB] USE_HTTPS=true but certs/ has no key.pem and cert.pem.');
    process.exit(1);
  }
  const scheme = useHttps ? 'https' : 'http';

  const server = useHttps
    ? https.createServer(
        { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
        app
      )
    : http.createServer(app);

  /**
   * Every address on this machine a browser elsewhere could use.
   *
   * Listening on all interfaces is the easy half; the hard half is knowing
   * what to type on the tablet. Printing the LAN address turns that into
   * reading a line off the console instead of hunting through ipconfig.
   */
  const lanAddresses = () =>
    Object.values(os.networkInterfaces())
      .flat()
      .filter((entry) => entry?.family === 'IPv4' && !entry.internal)
      .map((entry) => entry.address);

  // 0.0.0.0 rather than the default: bound to one interface only, the
  // server is unreachable from the kiosk tablet on the same Wi-Fi.
  server.listen(env.port, '0.0.0.0', () => {
    console.log(`\n  SMARTLAB API listening on ${scheme}://localhost:${env.port}/api`);
    console.log(`  Environment: ${env.nodeEnv}`);
    console.log(`  Allowed origins: ${env.corsOrigins.join(', ')}`);
    if (useHttps) {
      console.log('  HTTPS: on (self-signed — accept the warning once per device)');
    }

    // Worth a line of its own: a blank here is the whole explanation when
    // a laboratory expects the server to print and nothing comes out.
    console.log(
      env.printerHost
        ? `  Printer: ${env.printerHost}:${env.printerPort} (${env.printerWidth} columns)`
        : '  Printer: none configured - the kiosk prints through the browser'
    );

    const lan = lanAddresses();
    if (lan.length) {
      console.log('\n  On this network:');
      for (const address of lan) {
        console.log(`    API   : ${scheme}://${address}:${env.port}/api/health`);
        console.log(`    Kiosk : ${scheme}://${address}:5173/kiosk`);
      }
      console.log('\n  From another device, open the API address once and accept the');
      console.log('  certificate warning first, or every request from it is refused.');
    }
    console.log('');
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
