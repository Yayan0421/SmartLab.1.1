import dotenv from 'dotenv';

dotenv.config();

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length) {
  console.error(
    `\n[SMARTLAB] Missing required environment variables: ${missing.join(', ')}\n` +
      `Copy backend/.env.example to backend/.env and fill it in.\n`
  );
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  console.warn('[SMARTLAB] JWT_SECRET is shorter than 32 characters. Use a longer secret in production.');
}

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const env = {
  port: toInt(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  agentApiKey: process.env.AGENT_API_KEY || '',
  // Gate for the administrator signup portal. Empty disables admin
  // self-registration entirely, which is the safe default.
  adminSignupCode: process.env.ADMIN_SIGNUP_CODE || '',
  // The self-service kiosk authenticates with this. Falls back to the agent
  // key so a single-device setup works without extra configuration.
  kioskApiKey: process.env.KIOSK_API_KEY || process.env.AGENT_API_KEY || '',
  offlineAfterSeconds: toInt(process.env.OFFLINE_AFTER_SECONDS, 120),
  // The laboratory's own timezone. Bookings, opening hours and "today" are
  // all local facts, so they are computed in this zone rather than UTC.
  labTimezone: process.env.LAB_TIMEZONE || 'Asia/Manila',
  /**
   * A network receipt printer, addressed directly.
   *
   * Set PRINTER_HOST to the printer's address on the laboratory network
   * and the server prints every check-in itself, whatever device did the
   * scanning. Left unset, the kiosk prints through the browser as before:
   * a laboratory that is already printing should not start getting two
   * receipts because this was added.
   *
   * PRINTER_WIDTH is characters per line, not millimetres: 32 for a 58mm
   * roll, 48 for an 80mm one.
   */
  printerHost: process.env.PRINTER_HOST || '',
  printerPort: toInt(process.env.PRINTER_PORT, 9100),
  printerWidth: toInt(process.env.PRINTER_WIDTH, 32),
};

export default env;
