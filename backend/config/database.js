import { createClient } from '@supabase/supabase-js';
import env from './env.js';

/**
 * Single Supabase client for the whole API.
 *
 * It uses the service_role key, so it bypasses Row Level Security. That is
 * deliberate: every table has RLS enabled with no permissive policies, and
 * all authorisation happens in Express (authMiddleware + roleMiddleware).
 * This key must never reach the browser.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  db: { schema: 'public' },
  global: {
    headers: { 'x-application-name': 'smartlab-api' },
  },
});

/** Table name constants so typos fail loudly in one place. */
export const TABLES = {
  users: 'users',
  roles: 'roles',
  laboratories: 'laboratories',
  computers: 'computers',
  computerStatus: 'computer_status',
  bookings: 'bookings',
  schedules: 'schedules',
  energyReadings: 'energy_readings',
  notifications: 'notifications',
  auditLogs: 'audit_logs',
  systemSettings: 'system_settings',
};

/** Verifies the connection at boot so misconfiguration surfaces immediately. */
export async function assertDatabaseConnection() {
  const { error } = await supabase.from(TABLES.systemSettings).select('key').limit(1);
  if (error) {
    throw new Error(
      `Supabase connection failed: ${error.message}. ` +
        'Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and confirm db/schema.sql has been run.'
    );
  }
}

export default supabase;
