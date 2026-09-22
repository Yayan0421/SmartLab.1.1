import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';
import { getSetting } from '../services/settingsService.js';
import { labToday } from '../utils/labTime.js';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function rangeFromQuery(query) {
  const now = new Date();
  const period = query.period || 'today';

  if (period === 'custom' && query.from && query.to) {
    const from = new Date(`${query.from}T00:00:00`);
    const to = new Date(`${query.to}T23:59:59`);
    return { from, to, period, bucket: query.bucket || 'day' };
  }

  if (period === 'week') {
    const from = new Date(startOfToday().getTime() - 6 * 86_400_000);
    return { from, to: now, period, bucket: 'day' };
  }

  if (period === 'month') {
    const from = new Date(startOfToday().getTime() - 29 * 86_400_000);
    return { from, to: now, period, bucket: 'day' };
  }

  return { from: startOfToday(), to: now, period: 'today', bucket: 'hour' };
}

/** Groups readings into hourly or daily buckets in one pass. */
function bucketReadings(readings, bucket) {
  const buckets = new Map();

  for (const row of readings) {
    const at = new Date(row.recorded_at);
    // Bucketed in laboratory time so a "day" on the chart is the day the
    // laboratory actually had, not a UTC one shifted by the offset.
    const key =
      bucket === 'hour'
        ? `${labToday(at)} ${String(at.getHours()).padStart(2, '0')}:00`
        : labToday(at);

    const entry = buckets.get(key) || { label: key, energy_kwh: 0, power_watt: 0, samples: 0 };
    entry.energy_kwh += Number(row.energy_kwh) || 0;
    entry.power_watt += Number(row.power_watt) || 0;
    entry.samples += 1;
    buckets.set(key, entry);
  }

  return [...buckets.values()]
    .map((entry) => ({
      label: entry.label,
      energy_kwh: Number(entry.energy_kwh.toFixed(4)),
      avg_power_watt: entry.samples ? Number((entry.power_watt / entry.samples).toFixed(1)) : 0,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Sums energy over a window.
 * The query is bounded by timestamp and served by energy_recorded_idx; only
 * the two aggregate columns are selected so the payload stays small even
 * across a month of readings.
 */
async function sumEnergy(from, to, computerId = null) {
  let query = supabase
    .from(TABLES.energyReadings)
    .select('energy_kwh, power_watt, recorded_at')
    .gte('recorded_at', from.toISOString())
    .lte('recorded_at', to.toISOString())
    .order('recorded_at', { ascending: true })
    .limit(20000);

  if (computerId) query = query.eq('computer_id', computerId);

  const { data, error } = await query;
  if (error) throw ApiError.internal();

  const rows = data ?? [];
  const energy = rows.reduce((sum, r) => sum + (Number(r.energy_kwh) || 0), 0);
  return { rows, energy: Number(energy.toFixed(4)) };
}

/** GET /api/energy/summary — the headline figures on the energy page. */
export const energySummary = asyncHandler(async (req, res) => {
  const { rate_per_kwh, currency } = await getSetting('energy');
  const now = new Date();

  const dayStart = startOfToday();
  const weekStart = new Date(dayStart.getTime() - 6 * 86_400_000);
  const monthStart = new Date(dayStart.getTime() - 29 * 86_400_000);

  const [today, week, month] = await Promise.all([
    sumEnergy(dayStart, now),
    sumEnergy(weekStart, now),
    sumEnergy(monthStart, now),
  ]);

  // Current draw = the most recent reading per machine in the last 5 minutes.
  const { data: recent } = await supabase
    .from(TABLES.energyReadings)
    .select('computer_id, power_watt, recorded_at')
    .gte('recorded_at', new Date(Date.now() - 5 * 60_000).toISOString())
    .order('recorded_at', { ascending: false })
    .limit(500);

  const latestPerComputer = new Map();
  for (const row of recent ?? []) {
    if (!latestPerComputer.has(row.computer_id)) latestPerComputer.set(row.computer_id, row);
  }
  const currentPower = [...latestPerComputer.values()].reduce(
    (sum, row) => sum + (Number(row.power_watt) || 0),
    0
  );

  const cost = (kwh) => Number((kwh * rate_per_kwh).toFixed(2));

  res.json({
    success: true,
    data: {
      currency,
      rate_per_kwh,
      current_power_watt: Number(currentPower.toFixed(1)),
      active_meters: latestPerComputer.size,
      today_kwh: today.energy,
      week_kwh: week.energy,
      month_kwh: month.energy,
      today_cost: cost(today.energy),
      week_cost: cost(week.energy),
      month_cost: cost(month.energy),
      hourly: bucketReadings(today.rows, 'hour'),
      daily: bucketReadings(month.rows, 'day'),
    },
  });
});

/** GET /api/energy — series for a chosen period, optionally per computer. */
export const energySeries = asyncHandler(async (req, res) => {
  const { from, to, period, bucket } = rangeFromQuery(req.query);
  const { rate_per_kwh, currency } = await getSetting('energy');
  const { rows, energy } = await sumEnergy(from, to, req.query.computer_id || null);

  res.json({
    success: true,
    data: {
      period,
      from: from.toISOString(),
      to: to.toISOString(),
      total_kwh: energy,
      estimated_cost: Number((energy * rate_per_kwh).toFixed(2)),
      currency,
      series: bucketReadings(rows, bucket),
    },
  });
});

/** GET /api/energy/by-computer — ranked consumption, for the leaderboard. */
export const energyByComputer = asyncHandler(async (req, res) => {
  const { from, to } = rangeFromQuery(req.query);

  const { data, error } = await supabase
    .from(TABLES.energyReadings)
    .select('computer_id, energy_kwh, computer:computers ( id, name, computer_number )')
    .gte('recorded_at', from.toISOString())
    .lte('recorded_at', to.toISOString())
    .limit(20000);

  if (error) throw ApiError.internal();

  const totals = new Map();
  for (const row of data ?? []) {
    const computer = Array.isArray(row.computer) ? row.computer[0] : row.computer;
    if (!computer) continue;
    const entry = totals.get(row.computer_id) || {
      computer_id: row.computer_id,
      name: computer.name,
      computer_number: computer.computer_number,
      energy_kwh: 0,
    };
    entry.energy_kwh += Number(row.energy_kwh) || 0;
    totals.set(row.computer_id, entry);
  }

  const ranked = [...totals.values()]
    .map((entry) => ({ ...entry, energy_kwh: Number(entry.energy_kwh.toFixed(4)) }))
    .sort((a, b) => b.energy_kwh - a.energy_kwh);

  res.json({ success: true, data: ranked });
});

/** GET /api/energy/:computerId — paginated raw readings for one machine. */
export const energyForComputer = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = getPagination(req.query);
  const range = rangeFromQuery(req.query);

  const { data, count, error } = await supabase
    .from(TABLES.energyReadings)
    .select('id, voltage, current_amp, power_watt, energy_kwh, temperature, recorded_at', {
      count: 'exact',
    })
    .eq('computer_id', req.params.computerId)
    .gte('recorded_at', range.from.toISOString())
    .lte('recorded_at', range.to.toISOString())
    .order('recorded_at', { ascending: false })
    .range(from, to);

  if (error) throw ApiError.internal();

  res.json({ success: true, ...paginated(data ?? [], count, { page, limit }) });
});
