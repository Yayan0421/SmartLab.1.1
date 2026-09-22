import { supabase, TABLES } from '../config/database.js';

const DEFAULTS = {
  booking: {
    max_active_per_user: 3,
    max_hours_per_booking: 4,
    advance_days: 14,
    auto_approve_faculty: true,
    auto_approve_student: false,
    // Laboratory opening rule. Days use JavaScript's numbering
    // (0 = Sunday ... 6 = Saturday), so Monday-Thursday is [1, 2, 3, 4].
    open_days: [1, 2, 3, 4],
    open_time: '07:00',
    close_time: '17:00',
    // Student allowance: how long one student may hold the laboratory in a
    // single day, and how many machines at once.
    student_max_hours_per_day: 2,
    student_max_computers: 1,
    // A faculty reservation takes the room: while it runs, students cannot
    // book any machine in that laboratory.
    faculty_priority: true,
    // How long after the start time somebody may still check in at the
    // kiosk. Past this the booking expires and the machine is released.
    late_grace_minutes: 30,
  },
  energy: { rate_per_kwh: 11.5, currency: 'PHP' },
  general: { site_name: 'SMARTLAB', offline_after_seconds: 120 },
};

const CACHE_TTL_MS = 30_000;
const cache = new Map();

/**
 * Settings are read on nearly every booking, so they are cached briefly.
 * Writes clear the cache so an admin change takes effect right away.
 */
export async function getSetting(key) {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  const { data, error } = await supabase
    .from(TABLES.systemSettings)
    .select('value')
    .eq('key', key)
    .maybeSingle();

  const value = error || !data ? DEFAULTS[key] : { ...DEFAULTS[key], ...data.value };
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function getAllSettings() {
  const { data, error } = await supabase
    .from(TABLES.systemSettings)
    .select('key, value, description, updated_at')
    .order('key');

  if (error) return Object.entries(DEFAULTS).map(([key, value]) => ({ key, value, description: '' }));

  return data.map((row) => ({ ...row, value: { ...DEFAULTS[row.key], ...row.value } }));
}

export async function updateSetting(key, patch) {
  const current = await getSetting(key);
  const merged = { ...current, ...patch };

  const { data, error } = await supabase
    .from(TABLES.systemSettings)
    .upsert({ key, value: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key, value, description, updated_at')
    .single();

  cache.delete(key);
  if (error) throw new Error(error.message);
  return data;
}

export function clearSettingsCache() {
  cache.clear();
}

export { DEFAULTS as SETTINGS_DEFAULTS };
